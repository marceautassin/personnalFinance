import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-stmt-list-api-'))
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

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function makeEvent(): H3Event {
  return { path: '/api/statements', method: 'GET' } as unknown as H3Event
}

describe('GET /api/statements', () => {
  it('returns an empty list when no statements exist', async () => {
    const result = (await handler(makeEvent())) as { statements: unknown[] }
    expect(result.statements).toEqual([])
  })

  it('returns one statement with its transaction count and reliability', async () => {
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: HASH_A,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      openingBalanceCents: 100_000,
      closingBalanceCents: 80_000,
      reliability: 'reliable',
    }).run()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-15', label: 'A', amountCents: -10_000, categoryCode: 'courses' },
      { statementHash: HASH_A, transactionDate: '2026-04-20', label: 'B', amountCents: -10_000, categoryCode: 'courses' },
    ]).run()

    const result = (await handler(makeEvent())) as {
      statements: Array<{ hash: string, periodStart: string, reliability: string, transactionCount: number }>
    }
    expect(result.statements).toHaveLength(1)
    expect(result.statements[0]!.hash).toBe(HASH_A)
    expect(result.statements[0]!.reliability).toBe('reliable')
    expect(Number(result.statements[0]!.transactionCount)).toBe(2)
  })

  it('orders statements by periodStart DESC and surfaces unreliable flag', async () => {
    dbMod.db.insert(schema.bankStatements).values([
      {
        hashSha256: HASH_A,
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        openingBalanceCents: 0,
        closingBalanceCents: 0,
        reliability: 'reliable',
      },
      {
        hashSha256: HASH_B,
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        openingBalanceCents: 0,
        closingBalanceCents: 0,
        reliability: 'unreliable',
      },
    ]).run()

    const result = (await handler(makeEvent())) as {
      statements: Array<{ hash: string, periodStart: string, reliability: string }>
    }
    expect(result.statements.map(s => s.periodStart)).toEqual(['2026-04-01', '2026-03-01'])
    expect(result.statements[0]!.reliability).toBe('unreliable')
    expect(result.statements[1]!.reliability).toBe('reliable')
  })
})
