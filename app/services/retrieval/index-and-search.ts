import { embed, embedMany } from 'ai'
import { openai } from '@ai-sdk/openai'
import {
  getDocumentForUser,
  listChunksForUser,
  replaceDocumentChunks,
  type ChunkInsert,
} from '../../models/document'

export const EMBEDDING_DIMS = 1536
export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const DEFAULT_TOP_K = 4
/** Cosine similarity floor — below this, treat as empty retrieval. */
export const DEFAULT_SCORE_FLOOR = 0.25

export type EmbedFn = (texts: string[]) => Promise<number[][]>

export type KitLibrarianDeps = {
  embedTexts?: EmbedFn
  topK?: number
  scoreFloor?: number
}

export type RetrievedChunk = {
  id: string
  documentId: string
  filename: string
  content: string
  score: number
}

export type RetrieveOk = { ok: true; chunks: RetrievedChunk[] }
export type RetrieveEmpty = { ok: false; reason: 'no_chunks' | 'below_floor' }
export type RetrieveResult = RetrieveOk | RetrieveEmpty

/** Split text into overlapping character windows (paragraph-aware when possible). */
export function chunkText(
  text: string,
  opts: { maxChars?: number; overlap?: number } = {},
): string[] {
  const maxChars = opts.maxChars ?? 800
  const overlap = opts.overlap ?? 120
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const units = paragraphs.length > 0 ? paragraphs : [normalized]
  const chunks: string[] = []
  let buf = ''

  const flush = () => {
    const piece = buf.trim()
    if (piece) chunks.push(piece)
    buf = ''
  }

  for (const unit of units) {
    if (unit.length > maxChars) {
      flush()
      for (let i = 0; i < unit.length; i += maxChars - overlap) {
        const slice = unit.slice(i, i + maxChars).trim()
        if (slice) chunks.push(slice)
      }
      continue
    }
    if (!buf) {
      buf = unit
      continue
    }
    if (buf.length + 2 + unit.length <= maxChars) {
      buf = `${buf}\n\n${unit}`
    } else {
      flush()
      buf = unit
    }
  }
  flush()
  return chunks
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function topKBySimilarity(
  query: number[],
  items: {
    id: string
    embedding: number[]
    content: string
    documentId: string
    filename: string
  }[],
  k: number,
): RetrievedChunk[] {
  return items
    .map((item) => ({
      id: item.id,
      documentId: item.documentId,
      filename: item.filename,
      content: item.content,
      score: cosineSimilarity(query, item.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

async function defaultEmbedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  if (texts.length === 1) {
    const { embedding } = await embed({
      model: openai.embedding(EMBEDDING_MODEL),
      value: texts[0]!,
    })
    return [embedding]
  }
  const { embeddings } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values: texts,
  })
  return embeddings
}

/** Chunk + embed extracted text and replace prior rows for this document. */
export async function indexDocumentText(
  documentId: string,
  text: string,
  deps: KitLibrarianDeps = {},
) {
  const parts = chunkText(text)
  if (parts.length === 0) {
    await replaceDocumentChunks(documentId, [])
    return []
  }
  const embedTexts = deps.embedTexts ?? defaultEmbedTexts
  const vectors = await embedTexts(parts)
  if (vectors.length !== parts.length) {
    throw new Error('embedTexts returned a different length than chunks')
  }
  const payload: ChunkInsert[] = parts.map((content, i) => ({
    content,
    embedding: vectors[i]!,
  }))
  return replaceDocumentChunks(documentId, payload)
}

/**
 * Re-chunk + embed a ready document the user owns.
 * Returns null if missing/foreign; throws if not ready or no extracted text.
 */
export async function reindexDocumentForUser(
  userId: string,
  documentId: string,
  deps: KitLibrarianDeps = {},
) {
  const doc = await getDocumentForUser(documentId, userId)
  if (!doc) return null
  if (doc.status !== 'ready' || !doc.extractedText?.trim()) {
    throw new Error(
      'Document must be ready with extracted text before embedding',
    )
  }
  await indexDocumentText(doc.id, doc.extractedText, deps)
  return getDocumentForUser(documentId, userId)
}

/** Top-k over all of a user’s ready uploads (Ops Desk library). */
export async function retrieveForUser(
  userId: string,
  query: string,
  deps: KitLibrarianDeps = {},
): Promise<RetrieveResult> {
  const trimmed = query.trim()
  const rows = await listChunksForUser(userId)
  if (rows.length === 0 || !trimmed) return { ok: false, reason: 'no_chunks' }

  const embedTexts = deps.embedTexts ?? defaultEmbedTexts
  const [queryVec] = await embedTexts([trimmed])
  if (!queryVec) return { ok: false, reason: 'no_chunks' }

  const topK = deps.topK ?? DEFAULT_TOP_K
  const floor = deps.scoreFloor ?? DEFAULT_SCORE_FLOOR
  const ranked = topKBySimilarity(
    queryVec,
    rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      filename: r.filename,
      content: r.content,
      embedding: r.embedding,
    })),
    topK,
  ).filter((c) => c.score >= floor)

  if (ranked.length === 0) return { ok: false, reason: 'below_floor' }
  return { ok: true, chunks: ranked }
}

export function formatRetrievalContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] (${c.filename}, score=${c.score.toFixed(3)})\n${c.content}`,
    )
    .join('\n\n')
}
