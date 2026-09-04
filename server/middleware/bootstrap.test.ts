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
    CREATE TABLE tax_settings (
      id INTEGER PRIMARY KEY,
      dividend_tax_rate_pct INTEGER NOT NULL DEFAULT 3000,
      dividend_tax_mode TEXT NOT NULL DEFAULT 'flat_tax'
        CHECK(dividend_tax_mode IN ('flat_tax','progressive')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    -- Repères vérifiés par assertSchemaUpToDate (story 6.7) : sans eux le bootstrap refuse
    -- de démarrer, ce qui est précisément son rôle sur une base périmée.
    CREATE TABLE debt_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      event_date TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'advance',
      source_transaction_id INTEGER,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_hash TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category_code TEXT NOT NULL,
      is_manual INTEGER NOT NULL DEFAULT 0,
      is_debt_repayment INTEGER NOT NULL DEFAULT 0,
      debt_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      CONSTRAINT transactions_debt_coherence_check CHECK ((debt_id IS NULL) = (is_debt_repayment = 0))
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

describe('bootstrap — seed singletons (stories 5.3, 5.4, 5.5)', () => {
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

  it('seeds exactly one default tax_settings row, idempotent across two runs', async () => {
    await runBootstrapFresh()
    await runBootstrapFresh()

    const rows = dbMod.db.select().from(schema.taxSettings).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(1)
    expect(rows[0]!.dividendTaxRatePct).toBe(3000)
    expect(rows[0]!.dividendTaxMode).toBe('flat_tax')
  })
})

describe('assertSchemaUpToDate — détection d\'un schéma périmé', () => {
  /**
   * La sonde ne testait que `category_definitions` : une base antérieure au lot 6.5/6.7 passait
   * le bootstrap sans bruit, puis échouait en 500 à l'usage — ou tournait sans la contrainte
   * d'intégrité sur laquelle la story 6.7 s'appuie (revue du 2026-09-04).
   */
  it('refuse de démarrer si `debt_events` manque', async () => {
    const mod = await import('./0.bootstrap')
    expect(() => mod.assertSchemaUpToDate()).not.toThrow()

    sqlite.exec('DROP TABLE debt_events')
    expect(() => mod.assertSchemaUpToDate()).toThrow(/schéma de base périmé/i)

    // Remise en état : les autres cas du fichier partagent cette base.
    sqlite.exec(`
      CREATE TABLE debt_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debt_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        event_date TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'advance',
        source_transaction_id INTEGER,
        note TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `)
    expect(() => mod.assertSchemaUpToDate()).not.toThrow()
  })

  it('refuse de démarrer si la contrainte de cohérence dette manque', async () => {
    const mod = await import('./0.bootstrap')
    sqlite.exec('ALTER TABLE transactions RENAME TO transactions_backup')
    sqlite.exec(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        statement_hash TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        label TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        category_code TEXT NOT NULL,
        is_manual INTEGER NOT NULL DEFAULT 0,
        is_debt_repayment INTEGER NOT NULL DEFAULT 0,
        debt_id INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `)
    expect(() => mod.assertSchemaUpToDate()).toThrow(/schéma de base périmé/i)

    sqlite.exec('DROP TABLE transactions')
    sqlite.exec('ALTER TABLE transactions_backup RENAME TO transactions')
    expect(() => mod.assertSchemaUpToDate()).not.toThrow()
  })
})
