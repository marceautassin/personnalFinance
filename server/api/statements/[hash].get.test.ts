import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-stmt-detail-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
let handler: Handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')

  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(`
    CREATE TABLE category_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      is_variable INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE bank_statements (
      hash_sha256 TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      opening_balance_cents INTEGER NOT NULL,
      closing_balance_cents INTEGER NOT NULL,
      reliability TEXT NOT NULL DEFAULT 'reliable',
      ingested_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_hash TEXT NOT NULL REFERENCES bank_statements(hash_sha256) ON DELETE CASCADE,
      transaction_date TEXT NOT NULL,
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category_code TEXT NOT NULL REFERENCES category_definitions(code) ON DELETE RESTRICT,
      is_manual INTEGER NOT NULL DEFAULT 0,
      is_debt_repayment INTEGER NOT NULL DEFAULT 0,
      debt_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX transactions_period_idx ON transactions(transaction_date);
    CREATE INDEX transactions_statement_idx ON transactions(statement_hash);
  `)

  dbMod.db.insert(schema.categoryDefinitions).values([
    { code: 'courses', label: 'Courses' },
    { code: 'divers', label: 'Divers / Inconnu' },
  ]).run()

  handler = (await import('./[hash].get')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.transactions).run()
  dbMod.db.delete(schema.bankStatements).run()
})

const HASH_A = 'a'.repeat(64)

function makeEvent(hash: string): H3Event {
  return {
    path: `/api/statements/${hash}`,
    method: 'GET',
    context: { params: { hash } },
  } as unknown as H3Event
}

describe('GET /api/statements/[hash]', () => {
  it('returns full statement detail with balanced reconciliation', async () => {
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: HASH_A,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      openingBalanceCents: 100_000,
      closingBalanceCents: 80_000,
      reliability: 'reliable',
    }).run()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-15', label: 'Carrefour', amountCents: -20_000, categoryCode: 'courses' },
    ]).run()

    const result = (await handler(makeEvent(HASH_A))) as {
      hash: string
      periodStart: string
      periodEnd: string
      openingBalanceCents: number
      closingBalanceCents: number
      reliability: string
      transactions: { id: number, label: string, amountCents: number }[]
      reconciliation: { isBalanced: boolean, gapCents: number }
    }

    expect(result.hash).toBe(HASH_A)
    expect(result.periodStart).toBe('2026-04-01')
    expect(result.periodEnd).toBe('2026-04-30')
    expect(result.openingBalanceCents).toBe(100_000)
    expect(result.closingBalanceCents).toBe(80_000)
    expect(result.reliability).toBe('reliable')
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]!.label).toBe('Carrefour')
    expect(result.reconciliation.isBalanced).toBe(true)
    expect(result.reconciliation.gapCents).toBe(0)
  })

  it('returns gap detail when statement is not balanced', async () => {
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: HASH_A,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      openingBalanceCents: 100_000,
      closingBalanceCents: 80_000,
      reliability: 'reliable',
    }).run()
    // closing-opening = -20000, sum = -19990 → gap = -20000 - (-19990) = -10
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-15', label: 'Carrefour', amountCents: -19_990, categoryCode: 'courses' },
    ]).run()

    const result = (await handler(makeEvent(HASH_A))) as {
      reconciliation: { isBalanced: boolean, gapCents: number }
    }

    expect(result.reconciliation.isBalanced).toBe(false)
    expect(result.reconciliation.gapCents).toBe(-10)
  })

  it('returns 404 not_found for unknown hash', async () => {
    await expect(handler(makeEvent(HASH_A))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: ApiErrorCode.NotFound,
    })
  })

  it('returns 422 validation_failed for invalid hash format', async () => {
    await expect(handler(makeEvent('not-a-hash'))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })

  it('orders transactions by date asc then id asc', async () => {
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: HASH_A,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      openingBalanceCents: 100_000,
      closingBalanceCents: 100_000,
      reliability: 'reliable',
    }).run()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-20', label: 'B', amountCents: 0, categoryCode: 'courses' },
      { statementHash: HASH_A, transactionDate: '2026-04-05', label: 'A', amountCents: 0, categoryCode: 'courses' },
      { statementHash: HASH_A, transactionDate: '2026-04-25', label: 'C', amountCents: 0, categoryCode: 'courses' },
    ]).run()

    const result = (await handler(makeEvent(HASH_A))) as {
      transactions: { label: string }[]
    }
    expect(result.transactions.map(t => t.label)).toEqual(['A', 'B', 'C'])
  })
})
