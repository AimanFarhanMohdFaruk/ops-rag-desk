import { and, asc, count, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db'
import { ValidationError } from '../errors'
import {
  documentChunks,
  documents,
  type Document,
  type DocumentChunk,
} from './schema'

export type CreateDocumentInput = {
  userId: string
  key: string
  filename: string
  contentType: string
  byteSize: number
  status?: string
}

export type ChunkInsert = {
  content: string
  embedding: number[]
}

/** Fat model — document metadata + ownership. Bytes live in the object store. */

export async function createDocument(input: CreateDocumentInput): Promise<Document> {
  const filename = input.filename.trim()
  if (!filename) throw new ValidationError('Filename required')
  if (!input.key.trim()) throw new ValidationError('Object key required')
  if (!Number.isFinite(input.byteSize) || input.byteSize < 0) {
    throw new ValidationError('byteSize must be a non-negative number')
  }

  const id = randomUUID()
  const [row] = await db
    .insert(documents)
    .values({
      id,
      userId: input.userId,
      key: input.key.trim(),
      filename,
      contentType: input.contentType.trim() || 'application/octet-stream',
      byteSize: Math.trunc(input.byteSize),
      status: input.status ?? 'uploaded',
    })
    .returning()
  return row
}

export async function getDocumentById(id: string) {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
  return row ?? null
}

export async function getDocumentForUser(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function listDocumentsForUser(userId: string) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt))
    .limit(50)
}

export async function markDocumentReady(id: string, extractedText: string) {
  const [row] = await db
    .update(documents)
    .set({
      status: 'ready',
      extractedText,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id))
    .returning()
  return row ?? null
}

export async function markDocumentFailed(id: string) {
  const [row] = await db
    .update(documents)
    .set({
      status: 'failed',
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id))
    .returning()
  return row ?? null
}

export async function markDocumentIndexed(id: string, indexedAt: Date | null) {
  const [row] = await db
    .update(documents)
    .set({
      indexedAt,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id))
    .returning()
  return row ?? null
}

/** Delete existing chunks for the document, then insert the new set (re-embed). */
export async function replaceDocumentChunks(
  documentId: string,
  chunks: ChunkInsert[],
): Promise<DocumentChunk[]> {
  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId))
  if (chunks.length === 0) {
    await markDocumentIndexed(documentId, null)
    return []
  }

  const rows = chunks.map((c, ordinal) => ({
    id: randomUUID(),
    documentId,
    ordinal,
    content: c.content,
    embedding: c.embedding,
  }))
  const inserted = await db.insert(documentChunks).values(rows).returning()
  await markDocumentIndexed(documentId, new Date())
  return inserted
}

/** Ready-document chunks for all of a user’s uploads (desk library). */
export async function listChunksForUser(userId: string) {
  return db
    .select({
      id: documentChunks.id,
      documentId: documentChunks.documentId,
      ordinal: documentChunks.ordinal,
      content: documentChunks.content,
      embedding: documentChunks.embedding,
      filename: documents.filename,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(eq(documents.userId, userId), eq(documents.status, 'ready')))
    .orderBy(asc(documents.createdAt), asc(documentChunks.ordinal))
}

export async function countChunksForDocument(documentId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
  return Number(row?.n ?? 0)
}
