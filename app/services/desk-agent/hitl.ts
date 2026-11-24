import type { AskQuestion } from '../../models/agent-ask'

export type AwaitingAsk = {
  askId: string
  questions: AskQuestion[]
}

/** Detect ask_user park from AI SDK tool results (shared by run + eval gate). */
export function awaitingAskFromResults(
  toolResults: Array<{ toolName?: string; output?: unknown; result?: unknown }>,
): AwaitingAsk | null {
  for (const tr of toolResults) {
    const output = (tr.output ?? tr.result) as {
      ok?: boolean
      status?: string
      askId?: string
      questions?: AskQuestion[]
    } | null
    if (!output || output.ok !== true || output.status !== 'awaiting_human') {
      continue
    }
    if (tr.toolName === 'ask_user' && typeof output.askId === 'string') {
      return {
        askId: output.askId,
        questions: Array.isArray(output.questions) ? output.questions : [],
      }
    }
  }
  return null
}
