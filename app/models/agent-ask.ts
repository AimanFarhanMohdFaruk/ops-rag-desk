import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db'
import { ValidationError } from '../errors'
import { agentAsks, type AgentAsk } from './schema'

export type AskChoice = { id: string; label: string }
export type AskQuestion = {
  id: string
  prompt: string
  choices?: AskChoice[]
}

const MAX_QUESTIONS = 5

export function parseAskQuestions(raw: string): AskQuestion[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (q): q is AskQuestion =>
        q != null &&
        typeof q === 'object' &&
        typeof (q as AskQuestion).id === 'string' &&
        typeof (q as AskQuestion).prompt === 'string',
    )
  } catch {
    return []
  }
}

export function formatAskPromptMessage(questions: AskQuestion[]): string {
  if (questions.length === 1) return questions[0]!.prompt
  return questions.map((q, i) => `${i + 1}. ${q.prompt}`).join('\n')
}

export async function createAgentAsk(input: {
  threadId: string
  runId: string
  userId: string
  questions: AskQuestion[]
}): Promise<AgentAsk> {
  if (input.questions.length === 0) {
    throw new ValidationError('At least one question required')
  }
  if (input.questions.length > MAX_QUESTIONS) {
    throw new ValidationError(`At most ${MAX_QUESTIONS} questions per ask`)
  }
  const id = randomUUID()
  const [row] = await db
    .insert(agentAsks)
    .values({
      id,
      threadId: input.threadId,
      runId: input.runId,
      userId: input.userId,
      questions: JSON.stringify(input.questions),
      status: 'pending',
    })
    .returning()
  return row
}

export async function getPendingAskForThread(threadId: string) {
  const [row] = await db
    .select()
    .from(agentAsks)
    .where(and(eq(agentAsks.threadId, threadId), eq(agentAsks.status, 'pending')))
    .orderBy(desc(agentAsks.createdAt))
    .limit(1)
  return row ?? null
}

export async function getAgentAskForUser(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(agentAsks)
    .where(and(eq(agentAsks.id, id), eq(agentAsks.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function answerAgentAsk(
  id: string,
  userId: string,
  rawUserMessage: string,
): Promise<AgentAsk> {
  const ask = await getAgentAskForUser(id, userId)
  if (!ask) throw new ValidationError('Ask not found')
  if (ask.status !== 'pending') throw new ValidationError('Ask already resolved')
  const text = rawUserMessage.trim()
  if (!text) throw new ValidationError('Answer required')

  const questions = parseAskQuestions(ask.questions)
  const answer = JSON.stringify({
    responses: questions.map((q) => ({ questionId: q.id, text })),
    rawUserMessage: text,
  })

  const [row] = await db
    .update(agentAsks)
    .set({
      status: 'answered',
      answer,
      resolvedAt: new Date(),
    })
    .where(and(eq(agentAsks.id, id), eq(agentAsks.status, 'pending')))
    .returning()
  if (!row) throw new ValidationError('Ask already resolved')
  return row
}
