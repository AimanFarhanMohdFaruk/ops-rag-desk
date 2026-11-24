import { tool } from 'ai'
import { z } from 'zod'
import { createAgentAsk, parseAskQuestions } from '../../models/agent-ask'
import { listDocumentsForUser } from '../../models/document'
import {
  formatRetrievalContext,
  retrieveForUser,
} from '../retrieval/index-and-search'

export type DeskToolContext = {
  threadId: string
  runId: string
}

const askQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z
    .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
    .optional(),
})

/** Tools closed over session userId — never trust client-supplied identity. */
export function buildDeskAgentTools(userId: string, ctx: DeskToolContext) {
  return {
    search_ops_docs: tool({
      description:
        'Search the signed-in user’s uploaded ops corpus (runbooks/tickets) and return grounded excerpts with scores.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Search query'),
      }),
      execute: async ({ query }) => {
        const hit = await retrieveForUser(userId, query)
        if (!hit.ok) {
          return {
            ok: false as const,
            reason: hit.reason,
            excerpts: '',
          }
        }
        return {
          ok: true as const,
          excerpts: formatRetrievalContext(hit.chunks),
          citations: hit.chunks.map((c) => ({
            chunkId: c.id,
            documentId: c.documentId,
            filename: c.filename,
            score: c.score,
          })),
        }
      },
    }),
    list_ops_docs: tool({
      description: 'List uploaded ops documents for the signed-in user.',
      inputSchema: z.object({}),
      execute: async () => {
        const docs = await listDocumentsForUser(userId)
        return docs.map((d) => ({
          id: d.id,
          filename: d.filename,
          status: d.status,
          indexedAt: d.indexedAt?.toISOString() ?? null,
        }))
      },
    }),
    ask_user: tool({
      description:
        'Ask the human clarifying question(s) or escalate for a decision. Parks the turn until they reply. Use when runbooks are ambiguous or owner approval is needed.',
      inputSchema: z.object({
        questions: z.array(askQuestionSchema).min(1).max(5),
      }),
      execute: async ({ questions }) => {
        try {
          const ask = await createAgentAsk({
            threadId: ctx.threadId,
            runId: ctx.runId,
            userId,
            questions,
          })
          return {
            ok: true as const,
            status: 'awaiting_human' as const,
            askId: ask.id,
            questions: parseAskQuestions(ask.questions),
          }
        } catch (err) {
          return {
            ok: false as const,
            reason: 'ask_failed',
            message: err instanceof Error ? err.message : String(err),
          }
        }
      },
    }),
  }
}
