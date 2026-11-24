/**
 * Desk agent HTTP — accept turn, inspect run, answer ask.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { NotFoundError, ValidationError } from '../../errors'
import {
  answerAgentAsk,
  getPendingAskForThread,
  parseAskQuestions,
} from '../../models/agent-ask'
import { listAgentRunsForUser } from '../../models/agent-run'
import {
  getDeskThreadForUser,
  listDeskMessages,
  listDeskThreadsForUser,
} from '../../models/desk-thread'
import {
  enqueueDeskAgentTurn,
  inspectDeskRun,
} from '../../services/desk-agent/run'
import { sessionUser } from '../auth'

export async function createRun(req: FastifyRequest, _reply: FastifyReply) {
  const body =
    typeof req.body === 'object' && req.body !== null
      ? (req.body as { input?: unknown; threadId?: unknown })
      : {}
  const input = String(body.input ?? '')
  const threadId =
    typeof body.threadId === 'string' && body.threadId.trim()
      ? body.threadId.trim()
      : undefined
  if (!input.trim()) throw new ValidationError('Input required')

  try {
    const accepted = await enqueueDeskAgentTurn(sessionUser(req).id, input, {
      threadId,
    })
    return {
      threadId: accepted.threadId,
      runId: accepted.runId,
      status: 'queued' as const,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === 'Thread not found') throw new NotFoundError(message)
    throw new ValidationError(message)
  }
}

export async function showRun(req: FastifyRequest, _reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const full = await inspectDeskRun(sessionUser(req).id, id)
  if (!full) throw new NotFoundError()
  return {
    run: {
      id: full.run.id,
      threadId: full.run.threadId,
      status: full.run.status,
      input: full.run.input,
      output: full.run.output,
      stopReason: full.run.stopReason,
      error: full.run.error,
      createdAt: full.run.createdAt.toISOString(),
      finishedAt: full.run.finishedAt?.toISOString() ?? null,
    },
    steps: full.steps.map((s) => ({
      seq: s.seq,
      type: s.type,
      name: s.name,
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
    pendingAsk: full.pendingAsk,
  }
}

export async function listRuns(req: FastifyRequest, _reply: FastifyReply) {
  const runs = await listAgentRunsForUser(sessionUser(req).id)
  return runs.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    status: r.status,
    input: r.input,
    stopReason: r.stopReason,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }))
}

export async function showThread(req: FastifyRequest, _reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const userId = sessionUser(req).id
  const thread = await getDeskThreadForUser(id, userId)
  if (!thread) throw new NotFoundError()
  const [messages, pendingAsk] = await Promise.all([
    listDeskMessages(id),
    getPendingAskForThread(id),
  ])
  return {
    thread: {
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt.toISOString(),
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
    pendingAsk: pendingAsk
      ? {
          id: pendingAsk.id,
          questions: parseAskQuestions(pendingAsk.questions),
          status: pendingAsk.status,
        }
      : null,
  }
}

export async function listThreads(req: FastifyRequest, _reply: FastifyReply) {
  const threads = await listDeskThreadsForUser(sessionUser(req).id)
  return threads.map((t) => ({
    id: t.id,
    title: t.title,
    updatedAt: t.updatedAt.toISOString(),
  }))
}

export async function answerAsk(req: FastifyRequest, _reply: FastifyReply) {
  const { id } = req.params as { id: string }
  const body =
    typeof req.body === 'object' && req.body !== null
      ? (req.body as { text?: unknown; threadId?: unknown })
      : {}
  const text = String(body.text ?? '')
  const userId = sessionUser(req).id

  try {
    const ask = await answerAgentAsk(id, userId, text)
    const threadId =
      typeof body.threadId === 'string' && body.threadId.trim()
        ? body.threadId.trim()
        : ask.threadId
    const accepted = await enqueueDeskAgentTurn(userId, text, { threadId })
    return {
      askId: ask.id,
      threadId: accepted.threadId,
      runId: accepted.runId,
      status: 'queued' as const,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('not found')) throw new NotFoundError(message)
    throw new ValidationError(message)
  }
}
