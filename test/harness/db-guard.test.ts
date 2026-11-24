import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import {
  assertTestDatabaseUrl,
  requireTestDatabaseUrl,
  TEST_DATABASE_NAME,
  truncateAppTables,
} from './db'

const kitTestUrl = `postgres://ops_rag_desk:ops_rag_desk@127.0.0.1:5432/${TEST_DATABASE_NAME}`

describe('assertTestDatabaseUrl', () => {
  test('allows the harness test database name', () => {
    assert.doesNotThrow(() => assertTestDatabaseUrl(kitTestUrl))
    assert.doesNotThrow(() =>
      assertTestDatabaseUrl(
        `postgresql://kit:kit@127.0.0.1:5432/${TEST_DATABASE_NAME}`,
      ),
    )
  })

  test('refuses Compose / app database names', () => {
    assert.throws(
      () =>
        assertTestDatabaseUrl(
          'postgres://ops_rag_desk:ops_rag_desk@localhost:5432/ops_rag_desk',
        ),
      /Refusing truncate/,
    )
  })

  test('refuses non-postgres URLs', () => {
    assert.throws(
      () => assertTestDatabaseUrl('http://localhost/ops_rag_desk_test'),
      /protocol must be postgres/,
    )
  })
})

describe('requireTestDatabaseUrl', () => {
  const previousTest = process.env.TEST_DATABASE_URL
  const previousApp = process.env.DATABASE_URL

  afterEach(() => {
    if (previousTest === undefined) delete process.env.TEST_DATABASE_URL
    else process.env.TEST_DATABASE_URL = previousTest
    if (previousApp === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousApp
  })

  test('refuses when TEST_DATABASE_URL is unset even if DATABASE_URL is set', () => {
    delete process.env.TEST_DATABASE_URL
    process.env.DATABASE_URL = kitTestUrl
    assert.throws(() => requireTestDatabaseUrl(), /TEST_DATABASE_URL not set/)
  })

  test('refuses when DATABASE_URL drifts from TEST_DATABASE_URL', () => {
    process.env.TEST_DATABASE_URL = kitTestUrl
    process.env.DATABASE_URL =
      'postgres://ops_rag_desk:ops_rag_desk@localhost:5432/ops_rag_desk'
    assert.throws(
      () => requireTestDatabaseUrl(),
      /does not match TEST_DATABASE_URL/,
    )
  })

  test('returns the test URI when set and matching', () => {
    process.env.TEST_DATABASE_URL = kitTestUrl
    process.env.DATABASE_URL = kitTestUrl
    assert.equal(requireTestDatabaseUrl(), kitTestUrl)
  })
})

describe('truncateAppTables guard', () => {
  const previousTest = process.env.TEST_DATABASE_URL
  const previousApp = process.env.DATABASE_URL

  afterEach(() => {
    if (previousTest === undefined) delete process.env.TEST_DATABASE_URL
    else process.env.TEST_DATABASE_URL = previousTest
    if (previousApp === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousApp
  })

  test('refuses when only ambient DATABASE_URL points at ops_rag_desk', async () => {
    delete process.env.TEST_DATABASE_URL
    process.env.DATABASE_URL = 'postgres://ops_rag_desk:ops_rag_desk@localhost:5432/ops_rag_desk'
    await assert.rejects(truncateAppTables(), /TEST_DATABASE_URL not set/)
  })

  test('refuses TEST_DATABASE_URL aimed at ops_rag_desk', async () => {
    process.env.TEST_DATABASE_URL =
      'postgres://ops_rag_desk:ops_rag_desk@localhost:5432/ops_rag_desk'
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    await assert.rejects(truncateAppTables(), /Refusing truncate/)
  })
})
