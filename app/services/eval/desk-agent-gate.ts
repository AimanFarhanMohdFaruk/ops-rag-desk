/**
 * Desk agent behavioral gate — happy search, ask park, refuse path.
 * Cases are produced by offline fixtures (no live LLM / optional DB).
 */

export const DESK_AGENT_GATE_CRITERIA = {
  minCases: 3,
  requiredIds: ['happy_search', 'ask_park', 'refuse_empty'] as const,
} as const

export type DeskAgentGateCaseId =
  (typeof DESK_AGENT_GATE_CRITERIA.requiredIds)[number]

export type DeskAgentGateCaseResult = {
  id: string
  ok: boolean
  detail: string
}

export type DeskAgentGateResult = {
  ok: boolean
  total: number
  wrong: number
  detail: string
  cases: DeskAgentGateCaseResult[]
}

/** Summarize fixture outcomes — fails if any case fails or a required id is missing. */
export function evaluateDeskAgentGate(
  cases: DeskAgentGateCaseResult[],
): DeskAgentGateResult {
  const byId = new Map(cases.map((c) => [c.id, c]))
  const missing = DESK_AGENT_GATE_CRITERIA.requiredIds.filter(
    (id) => !byId.has(id),
  )
  const wrongCases = cases.filter((c) => !c.ok)
  const wrong = wrongCases.length + missing.length
  const ok =
    missing.length === 0 &&
    wrongCases.length === 0 &&
    cases.length >= DESK_AGENT_GATE_CRITERIA.minCases

  const detailParts: string[] = []
  if (missing.length > 0) {
    detailParts.push(`missing cases: ${missing.join(', ')}`)
  }
  for (const c of wrongCases) {
    detailParts.push(`${c.id}: ${c.detail}`)
  }
  if (ok) {
    detailParts.push(
      `${cases.length} desk-agent fixtures ok (happy search / ask park / refuse)`,
    )
  }

  return {
    ok,
    total: cases.length,
    wrong,
    detail: detailParts.join('; '),
    cases,
  }
}
