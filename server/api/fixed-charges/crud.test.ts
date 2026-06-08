import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-fixed-charges-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
let getHandler: Handler
let postHandler: Handler
let putHandler: Handler
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
    CREATE INDEX fixed_charges_category_idx ON fixed_charges(category_code);
  `)

  dbMod.db.insert(schema.categoryDefinitions).values([
    { code: 'logement', label: 'Logement' },
    { code: 'abonnements', label: 'Abonnements' },
  ]).run()

  getHandler = (await import('./index.get')).default as Handler
  postHandler = (await import('./index.post')).default as Handler
  putHandler = (await import('./[id].put')).default as Handler
  deleteHandler = (await import('./[id].delete')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.fixedCharges).run()
})

function makeEvent(opts: { method: string, body?: unknown, id?: string }): H3Event {
  const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const res = { statusCode: 200 }
  const req = { headers: { 'content-type': 'application/json' }, method: opts.method }
  return {
    _requestBody: rawBody,
    node: { req, res },
    path: opts.id ? `/api/fixed-charges/${opts.id}` : '/api/fixed-charges',
    method: opts.method,
    context: { params: opts.id ? { id: opts.id } : {} },
  } as unknown as H3Event
}

interface ChargeRow {
  id: number
  label: string
  amountCents: number
  categoryCode: string
  frequency: string
  startDate: string
  endDate: string | null
  createdAt: number
}

const LOYER = {
  label: 'Loyer',
  amountCents: -120000,
  categoryCode: 'logement',
  frequency: 'monthly' as const,
  startDate: '2026-01-01',
  endDate: null,
}

describe('Fixed charges CRUD', () => {
  it('round-trips POST → GET → PUT → DELETE → 404', async () => {
    // POST — création
    const created = (await postHandler(makeEvent({ method: 'POST', body: LOYER }))) as ChargeRow
    expect(created.id).toBeGreaterThan(0)
    expect(created.label).toBe('Loyer')
    expect(created.amountCents).toBe(-120000)
    expect(created.categoryCode).toBe('logement')
    expect(created.frequency).toBe('monthly')
    expect(created.endDate).toBeNull()
    expect(created.createdAt).toBeTypeOf('number')

    // GET — présence
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as { charges: ChargeRow[] }
    expect(list.charges).toHaveLength(1)
    expect(list.charges[0]!.id).toBe(created.id)

    // PUT — replace complet (nouveau montant + endDate)
    const updated = (await putHandler(makeEvent({
      method: 'PUT',
      id: String(created.id),
      body: { ...LOYER, label: 'Loyer révisé', amountCents: -130000, endDate: '2026-12-31' },
    }))) as ChargeRow
    expect(updated.id).toBe(created.id)
    expect(updated.label).toBe('Loyer révisé')
    expect(updated.amountCents).toBe(-130000)
    expect(updated.endDate).toBe('2026-12-31')
    expect(updated.createdAt).toBe(created.createdAt) // immuable

    // DELETE — 204
    const event = makeEvent({ method: 'DELETE', id: String(created.id) })
    const result = await deleteHandler(event)
    expect(result).toBeNull()
    expect(event.node.res.statusCode).toBe(204)

    // GET — vide
    const after = (await getHandler(makeEvent({ method: 'GET' }))) as { charges: ChargeRow[] }
    expect(after.charges).toHaveLength(0)

    // PUT/DELETE sur id supprimé → 404
    await expect(
      putHandler(makeEvent({ method: 'PUT', id: String(created.id), body: LOYER })),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: ApiErrorCode.NotFound })
    await expect(
      deleteHandler(makeEvent({ method: 'DELETE', id: String(created.id) })),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: ApiErrorCode.NotFound })
  })

  it('sorts GET by frequency then label ASC', async () => {
    await postHandler(makeEvent({ method: 'POST', body: { ...LOYER, label: 'Zeta', frequency: 'monthly' } }))
    await postHandler(makeEvent({ method: 'POST', body: { ...LOYER, label: 'Alpha', frequency: 'monthly' } }))
    await postHandler(makeEvent({ method: 'POST', body: { ...LOYER, label: 'Impôt', frequency: 'annual' } }))

    const list = (await getHandler(makeEvent({ method: 'GET' }))) as { charges: ChargeRow[] }
    expect(list.charges.map(c => `${c.frequency}:${c.label}`)).toEqual([
      'annual:Impôt',
      'monthly:Alpha',
      'monthly:Zeta',
    ])
  })

  it('rejects POST with endDate < startDate → 422', async () => {
    await expect(
      postHandler(makeEvent({ method: 'POST', body: { ...LOYER, startDate: '2026-06-01', endDate: '2026-01-01' } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
    expect(dbMod.db.select().from(schema.fixedCharges).all()).toHaveLength(0)
  })

  it('rejects POST with amountCents = 0 → 422', async () => {
    await expect(
      postHandler(makeEvent({ method: 'POST', body: { ...LOYER, amountCents: 0 } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects POST with unknown categoryCode → 422 (FK pre-check)', async () => {
    await expect(
      postHandler(makeEvent({ method: 'POST', body: { ...LOYER, categoryCode: 'does-not-exist' } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
    expect(dbMod.db.select().from(schema.fixedCharges).all()).toHaveLength(0)
  })

  it('rejects PUT with unknown categoryCode → 422 (FK pre-check)', async () => {
    const created = (await postHandler(makeEvent({ method: 'POST', body: LOYER }))) as ChargeRow
    await expect(
      putHandler(makeEvent({ method: 'PUT', id: String(created.id), body: { ...LOYER, categoryCode: 'nope' } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('returns 404 for PUT/DELETE on never-existing id', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', id: '999999', body: LOYER })),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: ApiErrorCode.NotFound })
    await expect(
      deleteHandler(makeEvent({ method: 'DELETE', id: '999999' })),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: ApiErrorCode.NotFound })
  })

  it('returns 422 for non-numeric id on PUT and DELETE', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', id: 'abc', body: LOYER })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
    await expect(
      deleteHandler(makeEvent({ method: 'DELETE', id: 'abc' })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })
})
