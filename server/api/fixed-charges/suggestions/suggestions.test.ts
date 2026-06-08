import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-suggestions-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
let getHandler: Handler
let deleteHandler: Handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

const HASH = 'b'.repeat(64)

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')

  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(`
    CREATE TABLE category_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
      is_variable INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE bank_statements (
      hash_sha256 TEXT PRIMARY KEY, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      opening_balance_cents INTEGER NOT NULL, closing_balance_cents INTEGER NOT NULL,
      reliability TEXT NOT NULL DEFAULT 'reliable', ingested_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_hash TEXT NOT NULL REFERENCES bank_statements(hash_sha256) ON DELETE CASCADE,
      transaction_date TEXT NOT NULL, label TEXT NOT NULL, amount_cents INTEGER NOT NULL,
      category_code TEXT NOT NULL REFERENCES category_definitions(code) ON DELETE RESTRICT,
      is_manual INTEGER NOT NULL DEFAULT 0, is_debt_repayment INTEGER NOT NULL DEFAULT 0,
      debt_id INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE fixed_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, amount_cents INTEGER NOT NULL,
      category_code TEXT NOT NULL REFERENCES category_definitions(code) ON DELETE RESTRICT,
      frequency TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE dismissed_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, normalized_label TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)
  dbMod.db.insert(schema.categoryDefinitions).values([{ code: 'abonnements', label: 'Abonnements' }]).run()
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: HASH, periodStart: '2026-01-01', periodEnd: '2026-03-31',
    openingBalanceCents: 0, closingBalanceCents: 0,
  }).run()

  getHandler = (await import('./index.get')).default as Handler
  deleteHandler = (await import('./[label].delete')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.transactions).run()
  dbMod.db.delete(schema.dismissedSuggestions).run()
})

function seedNetflix() {
  for (const m of ['01', '02', '03']) {
    dbMod.db.insert(schema.transactions).values({
      statementHash: HASH, transactionDate: `2026-${m}-15`, label: 'NETFLIX 12.99',
      amountCents: -1299, categoryCode: 'abonnements',
    }).run()
  }
}

function deleteEvent(label: string): H3Event {
  const res = { statusCode: 200 }
  return {
    node: { req: { method: 'DELETE' }, res },
    method: 'DELETE',
    context: { params: { label } },
  } as unknown as H3Event
}

const emptyEvent = { node: { req: { method: 'GET' }, res: {} }, method: 'GET', context: { params: {} } } as unknown as H3Event

describe('GET /api/fixed-charges/suggestions', () => {
  it('returns empty array when no transactions', async () => {
    expect(await getHandler(emptyEvent)).toEqual({ suggestions: [] })
  })

  it('returns the computed suggestions', async () => {
    seedNetflix()
    const result = (await getHandler(emptyEvent)) as { suggestions: Array<{ normalizedLabel: string }> }
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]!.normalizedLabel).toBe('netflix')
  })

  it('omits a suggestion after it is dismissed via DELETE', async () => {
    seedNetflix()
    const event = deleteEvent('netflix')
    const res = await deleteHandler(event)
    expect(res).toBeNull()
    expect(event.node.res.statusCode).toBe(204)

    const after = (await getHandler(emptyEvent)) as { suggestions: unknown[] }
    expect(after.suggestions).toHaveLength(0)
  })
})

describe('DELETE /api/fixed-charges/suggestions/[normalizedLabel]', () => {
  it('is idempotent (second dismiss still 204, single row)', async () => {
    await deleteHandler(deleteEvent('netflix'))
    await deleteHandler(deleteEvent('netflix'))
    const rows = dbMod.db.select().from(schema.dismissedSuggestions).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.normalizedLabel).toBe('netflix')
  })

  it('returns 422 for an empty/blank normalizedLabel', async () => {
    await expect(deleteHandler(deleteEvent('   '))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })
})
