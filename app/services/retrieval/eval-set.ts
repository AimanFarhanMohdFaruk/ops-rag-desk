import {
  DEFAULT_SCORE_FLOOR,
  DEFAULT_TOP_K,
  topKBySimilarity,
  type EmbedFn,
} from './index-and-search'

export type RagEvalCase = {
  id: string
  query: string
  /** In-memory corpus (no DB) — content strings to embed as chunks. */
  corpus: { id: string; filename: string; content: string }[]
  /** When true, expect no hit above the score floor. */
  expectEmpty: boolean
  /** If expectEmpty is false, at least one top chunk must include this substring. */
  expectContentIncludes?: string
}

export type RagEvalMismatch = {
  id: string
  detail: string
}

export type RagEvalResult = {
  total: number
  wrong: number
  wrongRate: number
  mismatches: RagEvalMismatch[]
}

/**
 * Offline eval-set gate for retrieval quality (no Postgres / no live LLM).
 * Regressions → wrongRate > 0 (tests fail the build).
 */
export async function evaluateRagEvalSet(
  cases: RagEvalCase[],
  embedTexts: EmbedFn,
  opts: { topK?: number; scoreFloor?: number } = {},
): Promise<RagEvalResult> {
  const topK = opts.topK ?? DEFAULT_TOP_K
  const floor = opts.scoreFloor ?? DEFAULT_SCORE_FLOOR
  const mismatches: RagEvalMismatch[] = []

  for (const row of cases) {
    const texts = row.corpus.map((c) => c.content)
    const vectors = await embedTexts([...texts, row.query])
    const queryVec = vectors[texts.length]
    if (!queryVec) {
      mismatches.push({ id: row.id, detail: 'missing query embedding' })
      continue
    }

    const items = row.corpus.map((c, i) => ({
      id: c.id,
      documentId: c.id,
      filename: c.filename,
      content: c.content,
      embedding: vectors[i]!,
    }))

    const ranked = topKBySimilarity(queryVec, items, topK).filter(
      (c) => c.score >= floor,
    )

    if (row.expectEmpty) {
      if (ranked.length > 0) {
        mismatches.push({
          id: row.id,
          detail: `expected empty retrieval, got ${ranked.length} hit(s)`,
        })
      }
      continue
    }

    if (ranked.length === 0) {
      mismatches.push({
        id: row.id,
        detail: 'expected hits, got empty / below floor',
      })
      continue
    }

    const needle = row.expectContentIncludes
    if (needle) {
      const joined = ranked.map((c) => c.content).join('\n')
      if (!joined.includes(needle)) {
        mismatches.push({
          id: row.id,
          detail: `top chunks missing expected substring ${JSON.stringify(needle)}`,
        })
      }
    }
  }

  const total = cases.length
  const wrong = mismatches.length
  return {
    total,
    wrong,
    wrongRate: total === 0 ? 0 : wrong / total,
    mismatches,
  }
}
