import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { awaitingAskFromResults } from '../../../app/services/desk-agent/hitl'
import {
  DESK_AGENT_GATE_CRITERIA,
  evaluateDeskAgentGate,
  type DeskAgentGateCaseResult,
} from '../../../app/services/eval/desk-agent-gate'
import {
  loadCheckedInRagCases,
  QUALITY_GATE_CRITERIA,
  runQualityGate,
} from '../../../app/services/eval/gate'
import { evaluateRagEvalSet } from '../../../app/services/retrieval/eval-set'

/** Deterministic bag-of-words embed — no OpenAI in CI. */
function fakeEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(
    texts.map((t) => {
      const base = Array.from({ length: 1536 }, () => 0)
      const words = t.toLowerCase().split(/\W+/).filter(Boolean)
      for (const w of words) {
        let h = 0
        for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0
        base[h % 1536] += 1
      }
      const norm = Math.sqrt(base.reduce((s, v) => s + v * v, 0)) || 1
      return base.map((v) => v / norm)
    }),
  )
}

async function buildDeskAgentCases(): Promise<DeskAgentGateCaseResult[]> {
  const cases: DeskAgentGateCaseResult[] = []

  {
    const hitl = awaitingAskFromResults([
      {
        toolName: 'search_ops_docs',
        output: { ok: true, excerpts: 'Counter-B profile' },
      },
    ])
    const ok = hitl === null
    cases.push({
      id: 'happy_search',
      ok,
      detail: ok
        ? 'search tool result does not park'
        : 'search incorrectly detected as ask park',
    })
  }

  {
    const hitl = awaitingAskFromResults([
      {
        toolName: 'ask_user',
        output: {
          ok: true,
          status: 'awaiting_human',
          askId: 'ask_1',
          questions: [{ id: 'esc', prompt: 'Escalate to owner?' }],
        },
      },
    ])
    const ok = hitl?.askId === 'ask_1'
    cases.push({
      id: 'ask_park',
      ok,
      detail: ok
        ? 'ask_user parks with askId'
        : 'ask_user park not detected',
    })
  }

  {
    const refuseCase = loadCheckedInRagCases().find((c) => c.expectEmpty)
    assert.ok(refuseCase, 'fixtures must include an expectEmpty RAG case')
    const rag = await evaluateRagEvalSet([refuseCase], fakeEmbed, {
      scoreFloor: 0.08,
    })
    const ok = rag.wrong === 0
    cases.push({
      id: 'refuse_empty',
      ok,
      detail: ok
        ? `refuse case ${refuseCase.id} stays empty`
        : rag.mismatches.map((m) => m.detail).join('; '),
    })
  }

  return cases
}

describe('ops-rag quality gate', () => {
  test('checked-in RAG fixtures pass published criteria', async () => {
    const ragCases = loadCheckedInRagCases()
    const rag = await evaluateRagEvalSet(ragCases, fakeEmbed, {
      scoreFloor: 0.08,
    })
    assert.equal(
      rag.wrongRate,
      0,
      rag.mismatches.map((m) => `${m.id}: ${m.detail}`).join('; '),
    )
    assert.ok(rag.total >= QUALITY_GATE_CRITERIA.rag.minCases)
  })

  test('full gate (RAG + desk agent) passes', async () => {
    const result = await runQualityGate({
      ragCases: loadCheckedInRagCases(),
      deskAgentCases: await buildDeskAgentCases(),
      embedTexts: fakeEmbed,
      ragScoreFloor: 0.08,
    })
    assert.equal(
      result.ok,
      true,
      result.suites
        .filter((s) => !s.ok)
        .map((s) => s.detail)
        .join('\n'),
    )
  })

  test('fails when RAG cases regress', async () => {
    const ragCases = loadCheckedInRagCases()
    const broken = ragCases.map((c, i) =>
      i === 0
        ? { ...c, expectContentIncludes: '__definitely_missing__' }
        : c,
    )
    const result = await runQualityGate({
      ragCases: broken,
      deskAgentCases: await buildDeskAgentCases(),
      embedTexts: fakeEmbed,
      ragScoreFloor: 0.08,
    })
    assert.equal(result.ok, false)
    assert.equal(result.suites.find((s) => s.id === 'rag')?.ok, false)
  })

  test('desk agent gate requires published case ids', async () => {
    const incomplete = evaluateDeskAgentGate([
      { id: 'happy_search', ok: true, detail: 'ok' },
    ])
    assert.equal(incomplete.ok, false)
    assert.ok(incomplete.detail.includes('missing cases'))

    const full = evaluateDeskAgentGate(await buildDeskAgentCases())
    assert.equal(full.ok, true)
    for (const id of DESK_AGENT_GATE_CRITERIA.requiredIds) {
      assert.ok(full.cases.some((c) => c.id === id && c.ok))
    }
  })
})
