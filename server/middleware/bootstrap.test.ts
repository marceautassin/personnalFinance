import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-bootstrap-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')

let dbMod: DbModule
let schema: SchemaModule
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
    CREATE TABLE revenue_models (
      id INTEGER PRIMARY KEY,
      unemployment_benefit_monthly_cents INTEGER NOT NULL DEFAULT 0,
      unemployment_benefit_end_date TEXT,
      sas_monthly_rent_cents INTEGER NOT NULL DEFAULT 0,
      expense_reimbursements_monthly_cents INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
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
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

const fakeEvent = {} as H3Event

/**
 * Importe une instance fraîche du middleware (flag `isBootstrapped` réinitialisé) et
 * l'exécute. Permet de simuler deux lancements indépendants du serveur sur la même DB.
 */
async function runBootstrapFresh() {
  vi.resetModules()
  const mod = await import('./0.bootstrap')
  await mod.default(fakeEvent)
}

describe('bootstrap — seed singletons (stories 5.3, 5.4)', () => {
  it('seeds exactly one zero revenue_models row, idempotent across two runs', async () => {
    await runBootstrapFresh()
    await runBootstrapFresh()

    const rows = dbMod.db.select().from(schema.revenueModels).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(1)
    expect(rows[0]!.unemploymentBenefitMonthlyCents).toBe(0)
    expect(rows[0]!.unemploymentBenefitEndDate).toBeNull()
    expect(rows[0]!.sasMonthlyRentCents).toBe(0)
    expect(rows[0]!.expenseReimbursementsMonthlyCents).toBe(0)
  })

  it('seeds exactly one default sas_config row, idempotent across two runs', async () => {
    await runBootstrapFresh()
    await runBootstrapFresh()

    const rows = dbMod.db.select().from(schema.sasConfig).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(1)
    expect(rows[0]!.fiscalYearEndDate).toBe('12-31')
    expect(rows[0]!.revenueForecastCents).toBe(0)
    expect(rows[0]!.expensesForecastCents).toBe(0)
    expect(rows[0]!.currentTreasuryCents).toBe(0)
    expect(rows[0]!.isRatePct).toBe(1500)
  })
})
