import { getDocumentById } from '../models/document'
import { indexDocumentText, type KitLibrarianDeps } from './retrieval/index-and-search'

/** Job args — registered on the stupid bus as `index_document`. */
export type IndexDocumentArgs = {
  documentId: string
}

export type IndexDocumentDeps = KitLibrarianDeps

/** Chunk + embed a ready document’s extractedText. */
export async function indexDocument(
  args: IndexDocumentArgs,
  deps: IndexDocumentDeps = {},
) {
  const doc = await getDocumentById(args.documentId)
  if (!doc) throw new Error(`Document not found: ${args.documentId}`)
  if (doc.status !== 'ready' || !doc.extractedText?.trim()) {
    throw new Error(
      `Document ${args.documentId} must be ready with extracted text before indexing`,
    )
  }
  const chunks = await indexDocumentText(doc.id, doc.extractedText, deps)
  return { documentId: doc.id, chunks: chunks.length }
}
