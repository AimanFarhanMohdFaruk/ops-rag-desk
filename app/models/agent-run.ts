import { and, asc, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db'
import { ValidationError } from '../errors'
import {
  agentRunSteps,
  agentRuns,
  type AgentRun,
  type AgentRunStep,
} from './schema'

export async function createAgentRun(
  userId: string,
  threadId: string,
  input: string,
): Promise<AgentRun> {
  const trimmed = input.trim()
  if (!trimmed) throw new ValidationError('Input required')
  const id = randomUUID()
  const [row] = await db
    .insert(agentRuns)
    .values({
      id,
      threadId,
      userId,
      input: trimmed,
      status: 'queued',
    })
    .returning()
  return row
}

export async function getAgentRunById(id: string) {
  const [row] = await db.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1)
  return row ?? null
}

export async function getAgentRunForUser(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function listAgentRunsForUser(userId: string, limit = 30) {
  return db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.userId, userId))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit)
}

export async function listAgentRunSteps(runId: string): Promise<AgentRunStep[]> {
  return db
    .select()
    .from(agentRunSteps)
    .where(eq(agentRunSteps.runId, runId))
    .orderBy(asc(agentRunSteps.seq))
}

export async function getAgentRunWithStepsForUser(id: string, userId: string) {
  const run = await getAgentRunForUser(id, userId)
  if (!run) return null
  const steps = await listAgentRunSteps(id)
  return { run, steps }
}

export async function markAgentRunRunning(id: string) {
  const [row] = await db
    .update(agentRuns)
    .set({ status: 'running' })
    .where(and(eq(agentRuns.id, id), eq(agentRuns.status, 'queued')))
    .returning()
  return row ?? null
}

export async function markAgentRunDone(
  id: string,
  opts: { output: string; stopReason: string },
) {
  const [row] = await db
    .update(agentRuns)
    .set({
      status: 'done',
      output: opts.output,
      stopReason: opts.stopReason,
      finishedAt: new Date(),
    })
    .where(eq(agentRuns.id, id))
    .returning()
  return row ?? null
}

export async function markAgentRunFailed(id: string, error: string) {
  const [row] = await db
    .update(agentRuns)
    .set({
      status: 'failed',
      error,
      finishedAt: new Date(),
    })
    .where(eq(agentRuns.id, id))
    .returning()
  return row ?? null
}

export async function markAgentRunAwaitingHuman(
  id: string,
  opts: { output: string; stopReason: string },
) {
  const [row] = await db
    .update(agentRuns)
    .set({
      status: 'awaiting_human',
      output: opts.output,
      stopReason: opts.stopReason,
    })
    .where(
      and(
        eq(agentRuns.id, id),
        eq(agentRuns.status, 'running'),
      ),
    )
    .returning()
  return row ?? null
}

export async function appendAgentRunStep(
  runId: string,
  step: { type: string; name?: string | null; payload?: string | null },
) {
  const existing = await listAgentRunSteps(runId)
  const seq = existing.length + 1
  const id = randomUUID()
  const [row] = await db
    .insert(agentRunSteps)
    .values({
      id,
      runId,
      seq,
      type: step.type,
      name: step.name ?? null,
      payload: step.payload ?? null,
    })
    .returning()
  return row
}
