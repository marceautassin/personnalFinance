import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-revenues-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
let getHandler: Handler
let putHandler: Handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')

  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(`
    CREATE TABLE revenue_models (
      id INTEGER PRIMARY KEY,
      unemployment_benefit_monthly_cents INTEGER NOT NULL DEFAULT 0,
      unemployment_benefit_end_date TEXT,
      sas_monthly_rent_cents INTEGER NOT NULL DEFAULT 0,
      expense_reimbursements_monthly_cents INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)

  getHandler = (await import('./revenues.get')).default as Handler
  putHandler = (await import('./revenues.put')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  // Reseed le singleton à zéro avec un updated_at volontairement ancien (1000) pour
  // pouvoir détecter sa régénération après PUT.
  dbMod.db.delete(schema.revenueModels).run()
  dbMod.db
    .insert(schema.revenueModels)
    .values({ id: 1, updatedAt: 1000 })
    .run()
})

function makeEvent(opts: { method: string, body?: unknown }): H3Event {
  const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const res = { statusCode: 200 }
  const req = { headers: { 'content-type': 'application/json' }, method: opts.method }
  return {
    _requestBody: rawBody,
    node: { req, res },
    path: '/api/revenues',
    method: opts.method,
    context: { params: {} },
  } as unknown as H3Event
}

interface RevenueRow {
  id: number
  unemploymentBenefitMonthlyCents: number
  unemploymentBenefitEndDate: string | null
  sasMonthlyRentCents: number
  expenseReimbursementsMonthlyCents: number
  updatedAt: number
}

describe('Revenue model singleton API', () => {
  it('GET returns the seeded zero singleton (id=1)', async () => {
    const model = (await getHandler(makeEvent({ method: 'GET' }))) as RevenueRow
    expect(model.id).toBe(1)
    expect(model.unemploymentBenefitMonthlyCents).toBe(0)
    expect(model.unemploymentBenefitEndDate).toBeNull()
    expect(model.sasMonthlyRentCents).toBe(0)
    expect(model.expenseReimbursementsMonthlyCents).toBe(0)
  })

  it('PUT partial updates only provided field, leaves others, regenerates updatedAt', async () => {
    const updated = (await putHandler(makeEvent({
      method: 'PUT',
      body: { unemploymentBenefitMonthlyCents: 110000 },
    }))) as RevenueRow
    expect(updated.id).toBe(1)
    expect(updated.unemploymentBenefitMonthlyCents).toBe(110000)
    // Champs non fournis inchangés.
    expect(updated.sasMonthlyRentCents).toBe(0)
    expect(updated.expenseReimbursementsMonthlyCents).toBe(0)
    expect(updated.unemploymentBenefitEndDate).toBeNull()
    // updated_at régénéré (était 1000).
    expect(updated.updatedAt).toBeGreaterThan(1000)

    // Persistance confirmée par un GET ultérieur.
    const after = (await getHandler(makeEvent({ method: 'GET' }))) as RevenueRow
    expect(after.unemploymentBenefitMonthlyCents).toBe(110000)
  })

  it('PUT accepts endDate + zero amounts and persists null when set explicitly', async () => {
    const updated = (await putHandler(makeEvent({
      method: 'PUT',
      body: { unemploymentBenefitMonthlyCents: 90000, unemploymentBenefitEndDate: '2026-12-31' },
    }))) as RevenueRow
    expect(updated.unemploymentBenefitEndDate).toBe('2026-12-31')

    const cleared = (await putHandler(makeEvent({
      method: 'PUT',
      body: { unemploymentBenefitEndDate: null },
    }))) as RevenueRow
    expect(cleared.unemploymentBenefitEndDate).toBeNull()
    // Le montant posé précédemment reste (patch partiel).
    expect(cleared.unemploymentBenefitMonthlyCents).toBe(90000)
  })

  it('rejects PUT with negative amount → 422', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: { unemploymentBenefitMonthlyCents: -1 } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects PUT with non-existent date → 422', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: { unemploymentBenefitEndDate: '2026-13-01' } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects PUT with empty body → 422 (at least one field required)', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: {} })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects PUT with unknown field → 422 (strict)', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: { bogus: 1 } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })
})
