import { generateText, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import {
  appendAgentRunStep,
  createAgentRun,
  getAgentRunById,
  getAgentRunWithStepsForUser,
  markAgentRunAwaitingHuman,
  markAgentRunDone,
  markAgentRunFailed,
  markAgentRunRunning,
} from '../../models/agent-run'
import {
  answerAgentAsk,
  formatAskPromptMessage,
  getPendingAskForThread,
  parseAskQuestions,
} from '../../models/agent-ask'
import { awaitingAskFromResults } from './hitl'
import {
  appendDeskMessage,
  createDeskThread,
  getDeskThreadForUser,
  listDeskMessages,
  toModelMessages,
} from '../../models/desk-thread'
import { enqueue } from '../../queue'
import { buildDeskAgentTools } from './tools'

const DESK_SYSTEM = [
  'You are Ops Desk — an AI assistant for support/ops staff.',
  'Use search_ops_docs for grounded answers from uploaded runbooks and tickets.',
  'Cite filenames from tool results when answering.',
  'When policy is ambiguous or owner approval is needed, call ask_user to escalate/clarify — do not invent policy.',
  'Be concise.',
].join(' ')

function resolveChatModel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ error: 'unserializable' })
  }
}

/** Accept turn: create/continue thread, persist user message + queued run. */
export async function acceptDeskAgentTurn(
  userId: string,
  input: string,
  opts: { threadId?: string } = {},
) {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Input required')

  let threadId = opts.threadId
  if (threadId) {
    const existing = await getDeskThreadForUser(threadId, userId)
    if (!existing) throw new Error('Thread not found')
  } else {
    const thread = await createDeskThread(userId)
    threadId = thread.id
  }

  const pending = await getPendingAskForThread(threadId)
  if (pending) {
    await answerAgentAsk(pending.id, userId, trimmed)
  }

  await appendDeskMessage(threadId, 'user', trimmed)
  const run = await createAgentRun(userId, threadId, trimmed)
  return { threadId, runId: run.id }
}

export async function enqueueDeskAgentTurn(
  userId: string,
  input: string,
  opts: { threadId?: string } = {},
) {
  const accepted = await acceptDeskAgentTurn(userId, input, opts)
  await enqueue('desk_agent_turn', { runId: accepted.runId })
  return accepted
}

/** Worker body — model + tools + step trace. */
export async function executeDeskAgentTurn(args: { runId: string }) {
  const run = await getAgentRunById(args.runId)
  if (!run) throw new Error(`Run not found: ${args.runId}`)
  if (run.status !== 'queued') {
    return { runId: run.id, status: run.status, skipped: true }
  }

  const claimed = await markAgentRunRunning(run.id)
  if (!claimed) return { runId: run.id, status: 'skipped', skipped: true }

  if (!process.env.OPENAI_API_KEY) {
    await markAgentRunFailed(run.id, 'OPENAI_API_KEY not configured')
    return { runId: run.id, status: 'failed' }
  }

  try {
    const history = await listDeskMessages(run.threadId)
    const tools = buildDeskAgentTools(run.userId, {
      threadId: run.threadId,
      runId: run.id,
    })

    const result = await generateText({
      model: openai(resolveChatModel()),
      system: DESK_SYSTEM,
      messages: toModelMessages(history),
      tools,
      stopWhen: stepCountIs(6),
    })

    const steps = result.steps ?? []
    for (const step of steps) {
      const toolCalls = step.toolCalls ?? []
      const toolResults = step.toolResults ?? []

      for (const call of toolCalls) {
        await appendAgentRunStep(run.id, {
          type: 'tool_call',
          name: call.toolName ?? 'unknown',
          payload: safeJson({
            toolCallId: call.toolCallId,
            input: call.input ?? null,
          }),
        })
      }
      for (const tr of toolResults) {
        const output = tr.output ?? (tr as { result?: unknown }).result
        const isFailure =
          output != null &&
          typeof output === 'object' &&
          'ok' in (output as object) &&
          (output as { ok?: boolean }).ok === false
        await appendAgentRunStep(run.id, {
          type: isFailure ? 'error' : 'tool_result',
          name: tr.toolName ?? 'unknown',
          payload: safeJson({ toolCallId: tr.toolCallId, output }),
        })
      }
    }

    const flatResults = steps.flatMap((s) => s.toolResults ?? [])
    const hitl = awaitingAskFromResults(flatResults)
    if (hitl) {
      const output =
        String(result.text ?? '').trim() ||
        formatAskPromptMessage(hitl.questions)
      await appendAgentRunStep(run.id, {
        type: 'finish',
        name: 'awaiting_human',
        payload: safeJson({ finishReason: 'awaiting_human', askId: hitl.askId }),
      })
      await markAgentRunAwaitingHuman(run.id, {
        output,
        stopReason: 'awaiting_human',
      })
      await appendDeskMessage(run.threadId, 'assistant', output)
      return { runId: run.id, status: 'awaiting_human', askId: hitl.askId }
    }

    const text = String(result.text ?? '').trim()
    const output = text || 'Finished with no final text.'
    await appendAgentRunStep(run.id, {
      type: 'finish',
      name: String(result.finishReason ?? 'stop'),
      payload: safeJson({ finishReason: result.finishReason ?? 'stop' }),
    })
    await markAgentRunDone(run.id, {
      output,
      stopReason: String(result.finishReason ?? 'stop'),
    })
    await appendDeskMessage(run.threadId, 'assistant', output)
    return { runId: run.id, status: 'done' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await appendAgentRunStep(run.id, {
      type: 'error',
      name: 'execute',
      payload: safeJson({ message }),
    })
    await markAgentRunFailed(run.id, message)
    return { runId: run.id, status: 'failed', error: message }
  }
}

export async function inspectDeskRun(userId: string, runId: string) {
  const full = await getAgentRunWithStepsForUser(runId, userId)
  if (!full) return null
  const pendingAsk = await getPendingAskForThread(full.run.threadId)
  return {
    run: full.run,
    steps: full.steps,
    pendingAsk: pendingAsk
      ? {
          id: pendingAsk.id,
          questions: parseAskQuestions(pendingAsk.questions),
          status: pendingAsk.status,
        }
      : null,
  }
}
