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

/**
 * Dates relatives à l'exécution : l'invariant ARE compare la date de fin au mois courant,
 * une date en dur ("2026-12-31") ferait basculer ces tests de verts à rouges avec le temps.
 */
function isoMonthsFromNow(delta: number): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + delta, 15))
    .toISOString()
    .slice(0, 10)
}
const FUTURE_DATE = isoMonthsFromNow(6)
const PAST_DATE = isoMonthsFromNow(-6)

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
      body: { sasMonthlyRentCents: 110000 },
    }))) as RevenueRow
    expect(updated.id).toBe(1)
    expect(updated.sasMonthlyRentCents).toBe(110000)
    // Champs non fournis inchangés.
    expect(updated.unemploymentBenefitMonthlyCents).toBe(0)
    expect(updated.expenseReimbursementsMonthlyCents).toBe(0)
    expect(updated.unemploymentBenefitEndDate).toBeNull()
    // updated_at régénéré (était 1000).
    expect(updated.updatedAt).toBeGreaterThan(1000)

    // Persistance confirmée par un GET ultérieur.
    const after = (await getHandler(makeEvent({ method: 'GET' }))) as RevenueRow
    expect(after.sasMonthlyRentCents).toBe(110000)
  })

  it('PUT accepts an ARE amount when an end date is provided', async () => {
    const updated = (await putHandler(makeEvent({
      method: 'PUT',
      body: { unemploymentBenefitMonthlyCents: 90000, unemploymentBenefitEndDate: FUTURE_DATE },
    }))) as RevenueRow
    expect(updated.unemploymentBenefitEndDate).toBe(FUTURE_DATE)
    expect(updated.unemploymentBenefitMonthlyCents).toBe(90000)
  })

  /**
   * Invariant ARE (amendement revue 2026-08-04) : le forecast ne compte l'ARE que si
   * `monthOf(endDate) >= month`. Un montant sans date — ou avec une date échue — serait
   * saisi puis silencieusement ignoré sur tout l'horizon → refus explicite, erreur métier
   * 400 avec code dédié (et non 422 `validation_failed`, réservé à la forme du payload).
   */
  it('rejects an ARE amount > 0 without an end date → 400', async () => {
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: { unemploymentBenefitMonthlyCents: 110000 } })),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: ApiErrorCode.UnemploymentEndDateRequired })
  })

  it('rejects an ARE amount > 0 with an already-past end date → 400', async () => {
    await expect(
      putHandler(makeEvent({
        method: 'PUT',
        body: { unemploymentBenefitMonthlyCents: 110000, unemploymentBenefitEndDate: PAST_DATE },
      })),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: ApiErrorCode.UnemploymentEndDatePast })
  })

  it('accepts an end date within the current month (boundary of the past-date guard)', async () => {
    const thisMonth = `${new Date().toISOString().slice(0, 7)}-01`
    const updated = (await putHandler(makeEvent({
      method: 'PUT',
      body: { unemploymentBenefitMonthlyCents: 90000, unemploymentBenefitEndDate: thisMonth },
    }))) as RevenueRow
    expect(updated.unemploymentBenefitEndDate).toBe(thisMonth)
  })

  it('rejects clearing the end date while an ARE amount remains → 400', async () => {
    await putHandler(makeEvent({
      method: 'PUT',
      body: { unemploymentBenefitMonthlyCents: 90000, unemploymentBenefitEndDate: FUTURE_DATE },
    }))
    await expect(
      putHandler(makeEvent({ method: 'PUT', body: { unemploymentBenefitEndDate: null } })),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: ApiErrorCode.UnemploymentEndDateRequired })
  })

  it('allows clearing the end date once the ARE amount is back to zero', async () => {
    await putHandler(makeEvent({
      method: 'PUT',
      body: { unemploymentBenefitMonthlyCents: 90000, unemploymentBenefitEndDate: FUTURE_DATE },
    }))
    const cleared = (await putHandler(makeEvent({
      method: 'PUT',
      body: { unemploymentBenefitMonthlyCents: 0, unemploymentBenefitEndDate: null },
    }))) as RevenueRow
    expect(cleared.unemploymentBenefitMonthlyCents).toBe(0)
    expect(cleared.unemploymentBenefitEndDate).toBeNull()
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

  /**
   * Ligne seedée absente : le handler doit échouer explicitement. Renvoyer `undefined`
   * produirait un 200 à corps vide côté client (page blanche sans diagnostic) et, sur le
   * PUT, un `{ok: true}` alors que rien n'a été écrit.
   */
  describe('when the seeded singleton row is missing', () => {
    beforeEach(() => {
      dbMod.db.delete(schema.revenueModels).run()
    })

    it('GET fails with singleton_missing instead of returning an empty body', async () => {
      await expect(
        getHandler(makeEvent({ method: 'GET' })),
      ).rejects.toMatchObject({ statusCode: 500, statusMessage: ApiErrorCode.SingletonMissing })
    })

    it('PUT fails with singleton_missing instead of reporting a phantom success', async () => {
      await expect(
        putHandler(makeEvent({ method: 'PUT', body: { sasMonthlyRentCents: 1000 } })),
      ).rejects.toMatchObject({ statusCode: 500, statusMessage: ApiErrorCode.SingletonMissing })
    })
  })
})
