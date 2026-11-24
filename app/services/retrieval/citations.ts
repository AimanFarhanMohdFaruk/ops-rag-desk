import type { RetrievedChunk } from './index-and-search'

/** Shared citation shape for Ops Desk answers. */

export type Citation = {
  chunkId: string
  documentId: string
  filename: string
  content: string
  score: number
}

export function citationsFromChunks(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((c) => ({
    chunkId: c.id,
    documentId: c.documentId,
    filename: c.filename,
    content: c.content,
    score: c.score,
  }))
}
