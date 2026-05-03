import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

// Set DATABASE_URL avant tout import du module `db/client` (singleton).
const tmpDir = mkdtempSync(join(tmpdir(), 'pf-tx-api-'))
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

  // Accès à la connexion better-sqlite3 sous-jacente pour exécuter le DDL.
  // @ts-expect-error -- propriété interne drizzle
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

  dbMod.db.insert(schema.categoryDefinitions).values({ code: 'courses', label: 'Courses' }).run()

  handler = (await import('./index.get')).default as Handler
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

function eventWithQuery(query: string): H3Event {
  // h3 v1.x : getQuery(event) lit `event.path`. Mock minimal suffisant pour validateQuery.
  return { path: `/api/transactions?${query}` } as unknown as H3Event
}

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

type Row = {
  label: string
  transactionDate: string
  amountCents: number
  isManual: boolean
  isDebtRepayment: boolean
  debtId: number | null
  statementHash: string
  categoryCode: string
  id: number
}
type Resp = { transactions: Row[], reliability: 'reliable' | 'unreliable' | null }

describe('GET /api/transactions', () => {
  it('returns transactions of the requested month sorted by date asc', async () => {
    seedStatement()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-15', label: 'B', amountCents: -2000, categoryCode: 'courses' },
      { statementHash: HASH_A, transactionDate: '2026-04-05', label: 'A', amountCents: -1000, categoryCode: 'courses' },
      { statementHash: HASH_A, transactionDate: '2026-04-25', label: 'C', amountCents: -3000, categoryCode: 'courses' },
      { statementHash: HASH_A, transactionDate: '2026-05-01', label: 'OUT', amountCents: -500, categoryCode: 'courses' },
    ]).run()

    const result = (await handler(eventWithQuery('month=2026-04'))) as Resp

    expect(result.transactions).toHaveLength(3)
    expect(result.transactions.map(r => r.label)).toEqual(['A', 'B', 'C'])
    expect(result.transactions[0]).toMatchObject({
      label: 'A',
      transactionDate: '2026-04-05',
      amountCents: -1000,
      categoryCode: 'courses',
      isManual: false,
      isDebtRepayment: false,
      debtId: null,
      statementHash: HASH_A,
    })
    expect(typeof result.transactions[0]!.id).toBe('number')
    expect(result.reliability).toBe('reliable')
  })

  it('returns reliability=unreliable if any contributing statement is unreliable', async () => {
    seedStatement()
    dbMod.db.update(schema.bankStatements).set({ reliability: 'unreliable' }).run()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-10', label: 'X', amountCents: -1000, categoryCode: 'courses' },
    ]).run()

    const result = (await handler(eventWithQuery('month=2026-04'))) as Resp
    expect(result.reliability).toBe('unreliable')
  })

  it('returns reliability=unreliable when the period is covered by an unreliable statement with zero transactions', async () => {
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: HASH_A,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      openingBalanceCents: 100_000,
      closingBalanceCents: 50_000,
      reliability: 'unreliable',
    }).run()

    const result = (await handler(eventWithQuery('month=2026-04'))) as Resp
    expect(result.transactions).toEqual([])
    expect(result.reliability).toBe('unreliable')
  })

  it('returns empty array and null reliability for a month with no data', async () => {
    const result = (await handler(eventWithQuery('month=2030-01'))) as Resp
    expect(result.transactions).toEqual([])
    expect(result.reliability).toBeNull()
  })

  it('returns 422 validation_failed for invalid month format', async () => {
    await expect(handler(eventWithQuery('month=not-a-month'))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })

  it('returns 422 validation_failed when month is missing', async () => {
    await expect(handler(eventWithQuery(''))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })

  it('returns 422 for out-of-range month (e.g. 2026-13)', async () => {
    await expect(handler(eventWithQuery('month=2026-13'))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })
})
