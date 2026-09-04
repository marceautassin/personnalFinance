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

/** Statut HTTP posé par le handler via `setResponseStatus` (défaut 200 si non touché). */
function statusOf(event: H3Event): number {
  return (event as unknown as { node: { res: { statusCode: number } } }).node.res.statusCode
}

describe('POST /api/categories', () => {
  it('slugifies the label into a code, referenceCount 0', async () => {
    const created = (await postHandler(makeEvent({ method: 'POST', body: { label: 'Carburant', isVariable: true } }))) as Cat
    expect(created.code).toBe('carburant')
    expect(created.label).toBe('Carburant')
    expect(created.isVariable).toBe(true)
    expect(created.referenceCount).toBe(0)
  })

  // Deux libellés DISTINCTS qui slugifient vers le même code : c'est la seule collision de
  // code encore atteignable depuis que le libellé est unique (décision de revue 2026-09-03).
  // Reposter le même libellé, comme le faisait ce test avant, est désormais un 409.
  it('suffixes -2 on code collision between two distinct labels', async () => {
    const first = (await postHandler(makeEvent({ method: 'POST', body: { label: 'Café & Co', isVariable: true } }))) as Cat
    expect(first.code).toBe('cafe-co')
    const second = (await postHandler(makeEvent({ method: 'POST', body: { label: 'Cafe Co', isVariable: true } }))) as Cat
    expect(second.code).toBe('cafe-co-2')
    expect(second.label).toBe('Cafe Co')
  })

  it('rejects a duplicate label → 409 (case- and accent-insensitive)', async () => {
    await postHandler(makeEvent({ method: 'POST', body: { label: 'Carburant', isVariable: true } }))
    await expect(
      postHandler(makeEvent({ method: 'POST', body: { label: '  cARbûrant ', isVariable: true } })),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: ApiErrorCode.CategoryLabelTaken })
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

  // Le contrat HTTP lui-même n'était asserté nulle part : seul le corps l'était (revue
  // 2026-08-04). Un handler qui oublierait `setResponseStatus` passait au vert.
  it('responds 201 Created', async () => {
    const event = makeEvent({ method: 'POST', body: { label: 'Carburant', isVariable: true } })
    await postHandler(event)
    expect(statusOf(event)).toBe(201)
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

  // Le 409 `category_label_taken` n'était couvert que sur le POST. Surtout, l'auto-exclusion
  // `excludeCode` ne l'était pas : un `excludeCode` oublié ferait échouer tout rename
  // idempotent et passerait au vert (revue 2026-09-04).
  it('rejects a rename toward a label already taken → 409', async () => {
    await expect(
      patchHandler(makeEvent({ method: 'PATCH', code: 'courses', body: { label: 'Logement' } })),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: ApiErrorCode.CategoryLabelTaken })
  })

  it('allows renaming a category to its own label (idempotent)', async () => {
    const updated = (await patchHandler(makeEvent({ method: 'PATCH', code: 'courses', body: { label: 'Courses' } }))) as Cat
    expect(updated.label).toBe('Courses')
  })

  it('allows a case-only rename of a category (self-exclusion)', async () => {
    const updated = (await patchHandler(makeEvent({ method: 'PATCH', code: 'courses', body: { label: 'COURSES' } }))) as Cat
    expect(updated.label).toBe('COURSES')
  })

  // Seul `isVariable` était testé : l'immuabilité du `code` — celle qui protège les FK
  // transactions/charges/overrides — n'était assertée nulle part (revue 2026-08-04).
  it('rejects patch trying to change the code → 422 (strict)', async () => {
    await expect(
      patchHandler(makeEvent({ method: 'PATCH', code: 'courses', body: { label: 'X', code: 'autre' } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
    const rows = dbMod.db.select().from(schema.categoryDefinitions).all()
    expect(rows.find(r => r.code === 'courses')).toBeDefined()
    expect(rows.find(r => r.code === 'autre')).toBeUndefined()
  })

  it('returns 404 for unknown category', async () => {
    await expect(
      patchHandler(makeEvent({ method: 'PATCH', code: 'nope', body: { label: 'X' } })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('DELETE /api/categories/[code]', () => {
  it('deletes an unreferenced category → 204 with no body', async () => {
    const event = makeEvent({ method: 'DELETE', code: 'logement' })
    const result = await deleteHandler(event)
    const rows = dbMod.db.select().from(schema.categoryDefinitions).all()
    expect(rows.find(r => r.code === 'logement')).toBeUndefined()
    // Le 204 n'était pas asserté malgré le nom du test (revue 2026-08-04).
    expect(statusOf(event)).toBe(204)
    expect(result).toBeNull()
  })

  it('rejects deletion of a referenced category → 409 category_in_use + counts', async () => {
    seedTransaction('courses')
    await expect(
      deleteHandler(makeEvent({ method: 'DELETE', code: 'courses' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: ApiErrorCode.CategoryInUse,
      data: { transactionCount: 1 },
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
