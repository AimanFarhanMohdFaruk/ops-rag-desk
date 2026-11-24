import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  chunkText,
  cosineSimilarity,
  topKBySimilarity,
} from '../../../app/services/retrieval/index-and-search'

describe('chunkText', () => {
  test('splits on paragraphs and respects maxChars', () => {
    const text = 'Alpha paragraph.\n\nBeta paragraph that is short.\n\nGamma.'
    const chunks = chunkText(text, { maxChars: 40, overlap: 5 })
    assert.ok(chunks.length >= 2)
    assert.ok(chunks.every((c) => c.length <= 40))
  })

  test('returns empty for blank input', () => {
    assert.deepEqual(chunkText('   '), [])
  })
})

describe('topKBySimilarity', () => {
  test('ranks by cosine similarity', () => {
    const query = [1, 0, 0]
    const ranked = topKBySimilarity(
      query,
      [
        {
          id: 'a',
          documentId: 'd1',
          filename: 'a.md',
          content: 'near',
          embedding: [0.9, 0.1, 0],
        },
        {
          id: 'b',
          documentId: 'd1',
          filename: 'b.md',
          content: 'far',
          embedding: [0, 1, 0],
        },
      ],
      1,
    )
    assert.equal(ranked.length, 1)
    assert.equal(ranked[0]!.id, 'a')
    assert.ok(ranked[0]!.score > 0.8)
  })

  test('cosineSimilarity is 1 for identical vectors', () => {
    assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1)
  })
})
