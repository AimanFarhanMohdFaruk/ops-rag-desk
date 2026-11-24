import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluateRagEvalSet,
  type RagEvalCase,
} from '../retrieval/eval-set'
import type { EmbedFn } from '../retrieval/index-and-search'
import {
  evaluateDeskAgentGate,
  type DeskAgentGateCaseResult,
} from './desk-agent-gate'

export const QUALITY_GATE_CRITERIA = {
  rag: { maxWrongRate: 0, minCases: 3 },
  deskAgent: { minCases: 3 },
} as const

export type QualityGateSuiteId = 'rag' | 'desk_agent'

export type QualityGateSuiteResult = {
  id: QualityGateSuiteId
  ok: boolean
  total: number
  wrong: number
  rate: number
  detail: string
}

export type QualityGateResult = {
  ok: boolean
  suites: QualityGateSuiteResult[]
}

export type RunQualityGateInput = {
  ragCases: RagEvalCase[]
  deskAgentCases: DeskAgentGateCaseResult[]
  embedTexts: EmbedFn
  /** Override retrieval floor (fake bag-of-words embeds need a lower bar than live OpenAI). */
  ragScoreFloor?: number
}

export async function runQualityGate(
  input: RunQualityGateInput,
): Promise<QualityGateResult> {
  const rag = await evaluateRagEvalSet(input.ragCases, input.embedTexts, {
    scoreFloor: input.ragScoreFloor,
  })
  const ragOk =
    rag.total >= QUALITY_GATE_CRITERIA.rag.minCases &&
    rag.wrongRate <= QUALITY_GATE_CRITERIA.rag.maxWrongRate

  const desk = evaluateDeskAgentGate(input.deskAgentCases)
  const deskOk =
    desk.ok && desk.total >= QUALITY_GATE_CRITERIA.deskAgent.minCases

  const suites: QualityGateSuiteResult[] = [
    {
      id: 'rag',
      ok: ragOk,
      total: rag.total,
      wrong: rag.wrong,
      rate: rag.wrongRate,
      detail: ragOk
        ? `wrong-rate ${rag.wrongRate} ≤ ${QUALITY_GATE_CRITERIA.rag.maxWrongRate}`
        : `rag gate failed (wrong ${rag.wrong}/${rag.total}); ${rag.mismatches
            .map((m) => `${m.id}: ${m.detail}`)
            .join('; ')}`,
    },
    {
      id: 'desk_agent',
      ok: deskOk,
      total: desk.total,
      wrong: desk.wrong,
      rate: desk.total === 0 ? 1 : desk.wrong / desk.total,
      detail: desk.detail,
    },
  ]

  return { ok: suites.every((s) => s.ok), suites }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

/** Load checked-in RAG fixtures for local scripts / tests. */
export function loadCheckedInRagCases(): RagEvalCase[] {
  return JSON.parse(
    readFileSync(join(root, 'fixtures/eval/rag-cases.json'), 'utf8'),
  ) as RagEvalCase[]
}
