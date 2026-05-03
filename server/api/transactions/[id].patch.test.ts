import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-tx-patch-api-'))
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
    { code: 'restaurants', label: 'Restaurants' },
  ]).run()

  handler = (await import('./[id].patch')).default as Handler
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

function seedStatement(hash = HASH_A) {
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: hash,
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    openingBalanceCents: 100_000,
    closingBalanceCents: 50_000,
    reliability: 'reliable',
  }).run()
}

function seedTransaction(): number {
  const result = dbMod.db.insert(schema.transactions).values({
    statementHash: HASH_A,
    transactionDate: '2026-04-15',
    label: 'Carrefour',
    amountCents: -2500,
    categoryCode: 'courses',
  }).run()
  return Number(result.lastInsertRowid)
}

function makeEvent(id: string, body: unknown): H3Event {
  const rawBody = body === undefined ? '' : JSON.stringify(body)
  const req = { headers: { 'content-type': 'application/json' }, method: 'PATCH' }
  return {
    _requestBody: rawBody,
    node: { req, res: {} },
    path: `/api/transactions/${id}`,
    method: 'PATCH',
    context: { params: { id } },
  } as unknown as H3Event
}

describe('PATCH /api/transactions/[id]', () => {
  it('updates categoryCode and flips is_manual to true', async () => {
    seedStatement()
    const id = seedTransaction()

    const result = (await handler(makeEvent(String(id), { categoryCode: 'restaurants' }))) as {
      id: number
      categoryCode: string
      isManual: boolean
      isDebtRepayment: boolean
      debtId: number | null
    }

    expect(result.id).toBe(id)
    expect(result.categoryCode).toBe('restaurants')
    expect(result.isManual).toBe(true)
    expect(result.isDebtRepayment).toBe(false)
    expect(result.debtId).toBeNull()
  })

  it('persists isDebtRepayment + debtId without creating a debt_repayments row (Story 6.3 scope)', async () => {
    seedStatement()
    const id = seedTransaction()

    const result = (await handler(makeEvent(String(id), { isDebtRepayment: true, debtId: 42 }))) as {
      isDebtRepayment: boolean
      debtId: number | null
      isManual: boolean
    }

    expect(result.isDebtRepayment).toBe(true)
    expect(result.debtId).toBe(42)
    expect(result.isManual).toBe(true)
  })

  it('returns 404 not_found for unknown id', async () => {
    seedStatement()
    seedTransaction()

    await expect(
      handler(makeEvent('999999', { categoryCode: 'restaurants' })),
    ).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: ApiErrorCode.NotFound,
    })
  })

  it('returns 422 validation_failed for unknown categoryCode (FK pre-check)', async () => {
    seedStatement()
    const id = seedTransaction()

    await expect(
      handler(makeEvent(String(id), { categoryCode: 'this-does-not-exist' })),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })

    const rows = dbMod.db.select().from(schema.transactions).all()
    const row = rows.find(r => r.id === id)!
    expect(row.categoryCode).toBe('courses')
    expect(row.isManual).toBe(false)
  })

  it('returns 422 validation_failed when body is empty (refine: at least one field required)', async () => {
    seedStatement()
    const id = seedTransaction()

    await expect(
      handler(makeEvent(String(id), {})),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })

  it('returns 422 validation_failed for non-numeric id', async () => {
    await expect(
      handler(makeEvent('abc', { categoryCode: 'restaurants' })),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })
})
