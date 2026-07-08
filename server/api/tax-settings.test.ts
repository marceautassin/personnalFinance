import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-tax-settings-api-'))
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
    CREATE TABLE tax_settings (
      id INTEGER PRIMARY KEY,
      dividend_tax_rate_pct INTEGER NOT NULL DEFAULT 3000,
      dividend_tax_mode TEXT NOT NULL DEFAULT 'flat_tax'
        CHECK(dividend_tax_mode IN ('flat_tax','progressive')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)

  getHandler = (await import('./tax-settings.get')).default as Handler
  putHandler = (await import('./tax-settings.put')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.taxSettings).run()
  dbMod.db.insert(schema.taxSettings).values({ id: 1, updatedAt: 1000 }).run()
})

function makeEvent(opts: { method: string, body?: unknown }): H3Event {
  const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const res = { statusCode: 200 }
  const req = { headers: { 'content-type': 'application/json' }, method: opts.method }
  return {
    _requestBody: rawBody,
    node: { req, res },
    path: '/api/tax-settings',
    method: opts.method,
    context: { params: {} },
  } as unknown as H3Event
}

interface TaxRow {
  id: number
  dividendTaxRatePct: number
  dividendTaxMode: string
  updatedAt: number
}

describe('tax_settings singleton API', () => {
  it('GET returns the seeded default singleton (id=1, 30% flat_tax)', async () => {
    const settings = (await getHandler(makeEvent({ method: 'GET' }))) as TaxRow
    expect(settings.id).toBe(1)
    expect(settings.dividendTaxRatePct).toBe(3000)
    expect(settings.dividendTaxMode).toBe('flat_tax')
  })

  it('PUT { dividendTaxRatePct: 1700 } updates the field and regenerates updatedAt', async () => {
    const updated = (await putHandler(makeEvent({
      method: 'PUT',
      body: { dividendTaxRatePct: 1700 },
    }))) as TaxRow
    expect(updated.dividendTaxRatePct).toBe(1700)
    // Champ non fourni inchangé.
    expect(updated.dividendTaxMode).toBe('flat_tax')
    expect(updated.updatedAt).toBeGreaterThan(1000)
  })

  it('PUT { dividendTaxMode: "progressive" } switches the mode', async () => {
    const updated = (await putHandler(makeEvent({
      method: 'PUT',
      body: { dividendTaxMode: 'progressive' },
    }))) as TaxRow
    expect(updated.dividendTaxMode).toBe('progressive')
  })

  it('rejects PUT { dividendTaxMode: "invalid" } → 422', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: { dividendTaxMode: 'invalid' } })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects PUT { dividendTaxRatePct: 12000 } → 422 (max 10000)', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: { dividendTaxRatePct: 12000 } })),
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
