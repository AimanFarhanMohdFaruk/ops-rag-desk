import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { listDocumentsForUser } from '../../models/document'
import { citationsFromChunks, type Citation } from './citations'
import {
  formatRetrievalContext,
  retrieveForUser,
  type KitLibrarianDeps,
  type RetrieveResult,
} from './index-and-search'

/** Ops Desk — ask over the signed-in user’s durable upload library + citations. */

export type DocsDeskAskOk = {
  ok: true
  answer: string
  citations: Citation[]
}

export type DocsDeskAskErr = {
  ok: false
  error: 'question_required' | 'not_configured' | 'no_hits'
  answer: string
  citations: Citation[]
}

export type DocsDeskAskResult = DocsDeskAskOk | DocsDeskAskErr

export type DocsDeskAskDeps = KitLibrarianDeps & {
  generateText?: typeof generateText
  retrieveForUser?: (
    userId: string,
    query: string,
    deps?: KitLibrarianDeps,
  ) => Promise<RetrieveResult>
}

const OPS_DESK_SYSTEM = [
  'You answer using only the ops runbook / ticket excerpts below.',
  'If the excerpts do not contain the answer, say you do not know from the uploaded documents — do not invent.',
  'Be concise. Prefer quoting short phrases from the excerpts when helpful.',
].join(' ')

function resolveChatModel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
}

export async function askDocsDesk(
  userId: string,
  question: string,
  deps: DocsDeskAskDeps = {},
): Promise<DocsDeskAskResult> {
  const trimmed = question.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: 'question_required',
      answer: 'Ask a question about your uploaded ops documents.',
      citations: [],
    }
  }

  const retrieve = deps.retrieveForUser ?? retrieveForUser
  const hit = await retrieve(userId, trimmed, deps)
  if (!hit.ok) {
    return {
      ok: false,
      error: 'no_hits',
      answer:
        'I don’t have enough from your uploaded documents to answer that. Upload and embed a relevant runbook, then try again.',
      citations: [],
    }
  }

  const citations = citationsFromChunks(hit.chunks)
  const generate = deps.generateText ?? generateText

  if (!process.env.OPENAI_API_KEY && !deps.generateText) {
    return {
      ok: false,
      error: 'not_configured',
      answer: 'OPENAI_API_KEY not configured',
      citations,
    }
  }

  const { text } = await generate({
    model: openai(resolveChatModel()),
    system: `${OPS_DESK_SYSTEM}\n\nExcerpts:\n${formatRetrievalContext(hit.chunks)}`,
    prompt: trimmed,
  })

  const answer =
    text.trim() || 'I could not form an answer from the retrieved excerpts.'
  return { ok: true, answer, citations }
}

export async function listDocsDeskLibrary(userId: string) {
  const docs = await listDocumentsForUser(userId)
  return docs.map((d) => ({
    id: d.id,
    filename: d.filename,
    status: d.status,
    indexedAt: d.indexedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  }))
}
