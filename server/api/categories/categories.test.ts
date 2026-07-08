import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-categories-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
let getHandler: Handler
let postHandler: Handler
let patchHandler: Handler
let deleteHandler: Handler
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
      period_start TEXT, period_end TEXT
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_hash TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category_code TEXT NOT NULL REFERENCES category_definitions(code) ON DELETE RESTRICT,
      is_manual INTEGER NOT NULL DEFAULT 0,
      is_debt_repayment INTEGER NOT NULL DEFAULT 0,
      debt_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE fixed_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category_code TEXT NOT NULL REFERENCES category_definitions(code) ON DELETE RESTRICT,
      frequency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)

  getHandler = (await import('./index.get')).default as Handler
  postHandler = (await import('./index.post')).default as Handler
  patchHandler = (await import('./[code].patch')).default as Handler
  deleteHandler = (await import('./[code].delete')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.transactions).run()
  dbMod.db.delete(schema.fixedCharges).run()
  dbMod.db.delete(schema.categoryDefinitions).run()
  dbMod.db.insert(schema.categoryDefinitions).values([
    { code: 'courses', label: 'Courses', isVariable: true },
    { code: 'divers', label: 'Divers', isVariable: true },
    { code: 'logement', label: 'Logement', isVariable: false },
  ]).run()
})

function makeEvent(opts: { method: string, body?: unknown, code?: string }): H3Event {
  const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const res = { statusCode: 200 }
  const req = { headers: { 'content-type': 'application/json' }, method: opts.method }
  return {
    _requestBody: rawBody,
    node: { req, res },
    path: '/api/categories',
    method: opts.method,
    context: { params: opts.code ? { code: opts.code } : {} },
  } as unknown as H3Event
}

interface Cat { code: string, label: string, isVariable: boolean, referenceCount: number }

function seedTransaction(code: string) {
  dbMod.db.insert(schema.transactions).values({
    statementHash: 'h', transactionDate: '2026-01-01', label: 'x', amountCents: -100, categoryCode: code,
  }).run()
}

describe('POST /api/categories', () => {
  it('slugifies the label into a code, referenceCount 0', async () => {
    const created = (await postHandler(makeEvent({ method: 'POST', body: { label: 'Carburant', isVariable: true } }))) as Cat
    expect(created.code).toBe('carburant')
    expect(created.label).toBe('Carburant')
    expect(created.isVariable).toBe(true)
    expect(created.referenceCount).toBe(0)
  })

  it('suffixes -2 on code collision', async () => {
    await postHandler(makeEvent({ method: 'POST', body: { label: 'Carburant', isVariable: true } }))
    const second = (await postHandler(makeEvent({ method: 'POST', body: { label: 'Carburant', isVariable: true } }))) as Cat
    expect(second.code).toBe('carburant-2')
  })

  it('strips accents and special chars (Café & Co → cafe-co)', async () => {
    const created = (await postHandler(makeEvent({ method: 'POST', body: { label: 'Café & Co', isVariable: true } }))) as Cat
    expect(created.code).toBe('cafe-co')
  })

  it('rejects a label that slugifies to empty (!!!) → 422', async () => {
    await expect(
      postHandler(makeEvent({ method: 'POST', body: { label: '!!!', isVariable: true } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects unknown field (code provided) → 422 (strict)', async () => {
    await expect(
      postHandler(makeEvent({ method: 'POST', body: { label: 'X', isVariable: true, code: 'x' } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })
})

describe('GET /api/categories', () => {
  it('returns categories with correct referenceCount', async () => {
    seedTransaction('courses')
    seedTransaction('courses')
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as Cat[]
    const courses = list.find(c => c.code === 'courses')!
    expect(courses.referenceCount).toBe(2)
    expect(list.find(c => c.code === 'logement')!.referenceCount).toBe(0)
  })

  it('orders variables first then fixed, alpha inside each group', async () => {
    // Fixture insérée DANS LE DÉSORDRE (≠ sortie attendue) pour exercer réellement le tri,
    // avec 2 catégories par groupe pour vérifier l'ordre alpha intra-groupe.
    dbMod.db.delete(schema.categoryDefinitions).run()
    dbMod.db.insert(schema.categoryDefinitions).values([
      { code: 'logement', label: 'Logement', isVariable: false },
      { code: 'shopping', label: 'Shopping', isVariable: true },
      { code: 'abonnements', label: 'Abonnements', isVariable: false },
      { code: 'courses', label: 'Courses', isVariable: true },
    ]).run()

    const list = (await getHandler(makeEvent({ method: 'GET' }))) as Cat[]
    expect(list.map(c => c.code)).toEqual(['courses', 'shopping', 'abonnements', 'logement'])
  })

  it('sorts accented / lowercase labels with locale collation, not binary', async () => {
    dbMod.db.delete(schema.categoryDefinitions).run()
    dbMod.db.insert(schema.categoryDefinitions).values([
      { code: 'zoo', label: 'Zoo', isVariable: true },
      { code: 'ecole', label: 'École', isVariable: true },
      { code: 'abonnement', label: 'abonnement', isVariable: true },
    ]).run()

    const list = (await getHandler(makeEvent({ method: 'GET' }))) as Cat[]
    // Collation binaire donnerait [Zoo, abonnement, École] (É=U+00C9 après 'z'); attendu alpha fr.
    expect(list.map(c => c.code)).toEqual(['abonnement', 'ecole', 'zoo'])
  })

  it('returns an empty array when no categories exist', async () => {
    dbMod.db.delete(schema.categoryDefinitions).run()
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as Cat[]
    expect(list).toEqual([])
  })
})

describe('PATCH /api/categories/[code]', () => {
  it('renames the label only', async () => {
    const updated = (await patchHandler(makeEvent({ method: 'PATCH', code: 'courses', body: { label: 'Bouffe' } }))) as Cat
    expect(updated.label).toBe('Bouffe')
    expect(updated.code).toBe('courses')
    expect(updated.isVariable).toBe(true)
  })

  it('rejects patch with code or isVariable → 422 (strict)', async () => {
    await expect(
      patchHandler(makeEvent({ method: 'PATCH', code: 'courses', body: { label: 'X', isVariable: false } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('returns 404 for unknown category', async () => {
    await expect(
      patchHandler(makeEvent({ method: 'PATCH', code: 'nope', body: { label: 'X' } })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('DELETE /api/categories/[code]', () => {
  it('deletes an unreferenced category → 204', async () => {
    await deleteHandler(makeEvent({ method: 'DELETE', code: 'logement' }))
    const rows = dbMod.db.select().from(schema.categoryDefinitions).all()
    expect(rows.find(r => r.code === 'logement')).toBeUndefined()
  })

  it('rejects deletion of a referenced category → 409 category_in_use + counts', async () => {
    seedTransaction('courses')
    await expect(
      deleteHandler(makeEvent({ method: 'DELETE', code: 'courses' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: ApiErrorCode.CategoryInUse,
      data: { transactionCount: 1, fixedChargeCount: 0, monthlyOverrideCount: 0 },
    })
  })

  it('rejects deletion of the protected divers category → 409 category_protected', async () => {
    await expect(
      deleteHandler(makeEvent({ method: 'DELETE', code: 'divers' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: ApiErrorCode.CategoryProtected,
      data: { code: 'divers', reason: 'used_as_fallback' },
    })
  })

  it('returns 404 for unknown category', async () => {
    await expect(
      deleteHandler(makeEvent({ method: 'DELETE', code: 'nope' })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
