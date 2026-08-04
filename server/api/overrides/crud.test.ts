import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-overrides-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
let getHandler: Handler
let postHandler: Handler
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
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
      is_variable INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE monthly_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL,
      category_code TEXT NOT NULL REFERENCES category_definitions(code) ON DELETE RESTRICT,
      amount_cents INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(month, category_code)
    );
  `)
  getHandler = (await import('./index.get')).default as Handler
  postHandler = (await import('./index.post')).default as Handler
  deleteHandler = (await import('./[id].delete')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.monthlyOverrides).run()
  dbMod.db.delete(schema.categoryDefinitions).run()
  dbMod.db.insert(schema.categoryDefinitions).values([
    { code: 'courses', label: 'Courses', isVariable: true },
    { code: 'loisirs', label: 'Loisirs', isVariable: true },
    { code: 'logement', label: 'Logement', isVariable: false },
  ]).run()
})

function makeEvent(opts: { method: string, body?: unknown, id?: string, query?: Record<string, string> }): H3Event {
  const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const req = { headers: { 'content-type': 'application/json' }, method: opts.method }
  const qs = opts.query ? '?' + new URLSearchParams(opts.query).toString() : ''
  return {
    _requestBody: rawBody,
    node: { req, res: {} },
    path: `/api/overrides${qs}`,
    method: opts.method,
    context: { params: opts.id ? { id: opts.id } : {} },
  } as unknown as H3Event
}

interface Ov { id: number, month: string, categoryCode: string, amountCents: number }

describe('POST /api/overrides', () => {
  it('crée un override (201)', async () => {
    const o = (await postHandler(makeEvent({ method: 'POST', body: { month: '2026-05', categoryCode: 'courses', amountCents: 30_000 } }))) as Ov
    expect(o).toMatchObject({ month: '2026-05', categoryCode: 'courses', amountCents: 30_000 })
    expect(o.id).toBeGreaterThan(0)
  })

  it('re-poster le même (mois, catégorie) remplace (upsert, pas de doublon)', async () => {
    await postHandler(makeEvent({ method: 'POST', body: { month: '2026-05', categoryCode: 'courses', amountCents: 30_000 } }))
    const o2 = (await postHandler(makeEvent({ method: 'POST', body: { month: '2026-05', categoryCode: 'courses', amountCents: 45_000 } }))) as Ov
    expect(o2.amountCents).toBe(45_000)
    expect(dbMod.db.select().from(schema.monthlyOverrides).all()).toHaveLength(1)
  })

  it('catégorie fixe → 422', async () => {
    await expect(postHandler(makeEvent({ method: 'POST', body: { month: '2026-05', categoryCode: 'logement', amountCents: 30_000 } })))
      .rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('catégorie inconnue → 422', async () => {
    await expect(postHandler(makeEvent({ method: 'POST', body: { month: '2026-05', categoryCode: 'nope', amountCents: 30_000 } })))
      .rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('mois invalide → 422', async () => {
    await expect(postHandler(makeEvent({ method: 'POST', body: { month: '2026-13', categoryCode: 'courses', amountCents: 30_000 } })))
      .rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })
})

describe('GET /api/overrides', () => {
  it('liste + filtre ?month', async () => {
    await postHandler(makeEvent({ method: 'POST', body: { month: '2026-05', categoryCode: 'courses', amountCents: 10_000 } }))
    await postHandler(makeEvent({ method: 'POST', body: { month: '2026-06', categoryCode: 'loisirs', amountCents: 20_000 } }))
    const all = (await getHandler(makeEvent({ method: 'GET' }))) as Ov[]
    expect(all).toHaveLength(2)
    const may = (await getHandler(makeEvent({ method: 'GET', query: { month: '2026-05' } }))) as Ov[]
    expect(may.map(o => o.categoryCode)).toEqual(['courses'])
  })
})

describe('DELETE /api/overrides/[id]', () => {
  it('supprime → 204', async () => {
    const o = (await postHandler(makeEvent({ method: 'POST', body: { month: '2026-05', categoryCode: 'courses', amountCents: 10_000 } }))) as Ov
    await deleteHandler(makeEvent({ method: 'DELETE', id: String(o.id) }))
    expect(dbMod.db.select().from(schema.monthlyOverrides).all()).toHaveLength(0)
  })

  it('inexistant → 404', async () => {
    await expect(deleteHandler(makeEvent({ method: 'DELETE', id: '999' }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('id non entier positif → 422 (AC5)', async () => {
    for (const id of ['abc', '1.5', '0', '-3']) {
      await expect(deleteHandler(makeEvent({ method: 'DELETE', id })))
        .rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
    }
  })
})
