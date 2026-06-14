import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-sas-config-api-'))
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
    CREATE TABLE sas_config (
      id INTEGER PRIMARY KEY,
      fiscal_year_end_date TEXT NOT NULL DEFAULT '12-31',
      revenue_forecast_cents INTEGER NOT NULL DEFAULT 0,
      expenses_forecast_cents INTEGER NOT NULL DEFAULT 0,
      current_treasury_cents INTEGER NOT NULL DEFAULT 0,
      is_rate_pct INTEGER NOT NULL DEFAULT 1500,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)

  getHandler = (await import('./sas-config.get')).default as Handler
  putHandler = (await import('./sas-config.put')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.sasConfig).run()
  dbMod.db.insert(schema.sasConfig).values({ id: 1, updatedAt: 1000 }).run()
})

function makeEvent(opts: { method: string, body?: unknown }): H3Event {
  const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const res = { statusCode: 200 }
  const req = { headers: { 'content-type': 'application/json' }, method: opts.method }
  return {
    _requestBody: rawBody,
    node: { req, res },
    path: '/api/sas-config',
    method: opts.method,
    context: { params: {} },
  } as unknown as H3Event
}

interface SasRow {
  id: number
  fiscalYearEndDate: string
  revenueForecastCents: number
  expensesForecastCents: number
  currentTreasuryCents: number
  isRatePct: number
  updatedAt: number
}

describe('SAS config singleton API', () => {
  it('GET returns the seeded default singleton (id=1)', async () => {
    const config = (await getHandler(makeEvent({ method: 'GET' }))) as SasRow
    expect(config.id).toBe(1)
    expect(config.fiscalYearEndDate).toBe('12-31')
    expect(config.revenueForecastCents).toBe(0)
    expect(config.isRatePct).toBe(1500)
  })

  it('PUT partial updates only provided fields, regenerates updatedAt', async () => {
    const updated = (await putHandler(makeEvent({
      method: 'PUT',
      body: { revenueForecastCents: 10_000_000, isRatePct: 2500 },
    }))) as SasRow
    expect(updated.revenueForecastCents).toBe(10_000_000)
    expect(updated.isRatePct).toBe(2500)
    // Champs non fournis inchangés.
    expect(updated.expensesForecastCents).toBe(0)
    expect(updated.fiscalYearEndDate).toBe('12-31')
    expect(updated.updatedAt).toBeGreaterThan(1000)
  })

  it('PUT accepts a valid fiscalYearEndDate', async () => {
    const updated = (await putHandler(makeEvent({
      method: 'PUT',
      body: { fiscalYearEndDate: '06-30' },
    }))) as SasRow
    expect(updated.fiscalYearEndDate).toBe('06-30')
  })

  it('rejects PUT with invalid fiscalYearEndDate (13-01) → 422', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: { fiscalYearEndDate: '13-01' } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects PUT with semantically invalid date (02-30) → 422', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: { fiscalYearEndDate: '02-30' } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects PUT with negative isRatePct → 422', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: { isRatePct: -1 } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects PUT with empty body → 422', async () => {
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
