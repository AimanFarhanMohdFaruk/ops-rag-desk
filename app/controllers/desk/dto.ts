/**
 * HTTP shaping for Ops Desk ask — not domain types.
 */
import type { Citation } from '../../services/retrieval/citations'

export type DeskLibraryItemDto = {
  id: string
  filename: string
  status: string
  indexedAt: string | null
  createdAt: string
}

export type DeskAskDto = {
  ok: boolean
  answer: string
  citations: Citation[]
  refused?: boolean
}

export type { Citation as CitationDto }
