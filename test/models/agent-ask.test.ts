import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  formatAskPromptMessage,
  parseAskQuestions,
} from '../../app/models/agent-ask'

describe('agent-ask helpers', () => {
  test('parseAskQuestions reads valid JSON', () => {
    const qs = parseAskQuestions(
      JSON.stringify([{ id: 'a', prompt: 'Escalate to owner?' }]),
    )
    assert.equal(qs.length, 1)
    assert.equal(qs[0]!.id, 'a')
  })

  test('parseAskQuestions returns [] on bad JSON', () => {
    assert.deepEqual(parseAskQuestions('not-json'), [])
  })

  test('formatAskPromptMessage for one question', () => {
    assert.equal(
      formatAskPromptMessage([{ id: 'a', prompt: 'Need owner?' }]),
      'Need owner?',
    )
  })
})
