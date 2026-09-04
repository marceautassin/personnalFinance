import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { resolveNextAgMonth } from '~~/server/utils/period'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-forecast-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>
let dbMod: DbModule
let schema: SchemaModule
let handler: Handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

/** Mois courant (même calcul que l'endpoint) pour les assertions dépendant de l'horloge. */
function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')
  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(`
    CREATE TABLE category_definitions (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL, is_variable INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE bank_statements (hash_sha256 TEXT PRIMARY KEY, period_start TEXT NOT NULL, period_end TEXT NOT NULL, opening_balance_cents INTEGER NOT NULL, closing_balance_cents INTEGER NOT NULL, reliability TEXT NOT NULL DEFAULT 'reliable', ingested_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, statement_hash TEXT NOT NULL, transaction_date TEXT NOT NULL, label TEXT NOT NULL, amount_cents INTEGER NOT NULL, category_code TEXT NOT NULL, is_manual INTEGER NOT NULL DEFAULT 0, is_debt_repayment INTEGER NOT NULL DEFAULT 0, debt_id INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE fixed_charges (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, amount_cents INTEGER NOT NULL, category_code TEXT NOT NULL, frequency TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE revenue_models (id INTEGER PRIMARY KEY, unemployment_benefit_monthly_cents INTEGER NOT NULL DEFAULT 0, unemployment_benefit_end_date TEXT, sas_monthly_rent_cents INTEGER NOT NULL DEFAULT 0, expense_reimbursements_monthly_cents INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE sas_config (id INTEGER PRIMARY KEY, fiscal_year_end_date TEXT NOT NULL DEFAULT '12-31', revenue_forecast_cents INTEGER NOT NULL DEFAULT 0, expenses_forecast_cents INTEGER NOT NULL DEFAULT 0, current_treasury_cents INTEGER NOT NULL DEFAULT 0, is_rate_pct INTEGER NOT NULL DEFAULT 1500, updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE tax_settings (id INTEGER PRIMARY KEY, dividend_tax_rate_pct INTEGER NOT NULL DEFAULT 3000, dividend_tax_mode TEXT NOT NULL DEFAULT 'flat_tax', updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE monthly_overrides (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL, category_code TEXT NOT NULL, amount_cents INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), UNIQUE(month, category_code));
    CREATE TABLE debts (id INTEGER PRIMARY KEY AUTOINCREMENT, creditor TEXT NOT NULL, initial_balance_cents INTEGER NOT NULL, repayment_mode TEXT NOT NULL DEFAULT 'free', monthly_amount_cents INTEGER, lump_sum_date TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE debt_events (id INTEGER PRIMARY KEY AUTOINCREMENT, debt_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL, event_date TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'advance', source_transaction_id INTEGER, note TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
  `)
  handler = (await import('./forecast.get')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

function reset() {
  for (const t of ['debt_events', 'debts', 'monthly_overrides', 'transactions', 'fixed_charges', 'bank_statements', 'sas_config', 'tax_settings', 'revenue_models', 'category_definitions']) {
    sqlite.exec(`DELETE FROM ${t};`)
  }
  dbMod.db.insert(schema.sasConfig).values({ id: 1 }).run()
  dbMod.db.insert(schema.taxSettings).values({ id: 1 }).run()
  dbMod.db.insert(schema.revenueModels).values({ id: 1 }).run()
}

beforeEach(reset)

function makeEvent(query: Record<string, string> = {}): H3Event {
  const qs = new URLSearchParams(query).toString()
  return {
    node: { req: { headers: {}, method: 'GET' }, res: {} },
    path: `/api/forecast${qs ? '?' + qs : ''}`,
    method: 'GET',
    context: { params: {} },
  } as unknown as H3Event
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resp = any

describe('resolveNextAgMonth (unité)', () => {
  it('année courante si mois d\'AG ≥ mois courant, sinon +1', () => {
    expect(resolveNextAgMonth('2026-07', '12-31')).toBe('2026-12')
    expect(resolveNextAgMonth('2026-07', '03-31')).toBe('2027-03')
    expect(resolveNextAgMonth('2026-03', '03-31')).toBe('2026-03')
  })
})

describe('GET /api/forecast', () => {
  it('structure nominale (horizon 12)', async () => {
    const r = (await handler(makeEvent({ horizon: '12' }))) as Resp
    expect(r.horizonMonths).toBe(12)
    expect(r.forecast.months).toHaveLength(12)
    expect(r.startMonth).toMatch(/^\d{4}-\d{2}$/)
    expect(r.agMonth).toMatch(/^\d{4}-\d{2}$/)
    expect(r.dividend).toHaveProperty('requiredNetCents')
    expect(r.capacity).toHaveProperty('dividendableCapacityCents')
    expect(Array.isArray(r.levers)).toBe(true)
  })

  it('horizon par défaut = 12', async () => {
    expect(((await handler(makeEvent())) as Resp).horizonMonths).toBe(12)
  })

  it('horizon hors {6,12,24} → 422', async () => {
    await expect(handler(makeEvent({ horizon: '7' }))).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('reducedReliability : vrai sans historique, faux avec ≥ 3 mois', async () => {
    expect(((await handler(makeEvent())) as Resp).reducedReliability).toBe(true)

    dbMod.db.insert(schema.categoryDefinitions).values({ code: 'courses', label: 'Courses', isVariable: true }).run()
    dbMod.db.insert(schema.bankStatements).values({ hashSha256: 'h', periodStart: '2026-01-01', periodEnd: '2026-03-31', openingBalanceCents: 0, closingBalanceCents: 0 }).run()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: 'h', transactionDate: '2026-01-10', label: 'a', amountCents: -1000, categoryCode: 'courses' },
      { statementHash: 'h', transactionDate: '2026-02-10', label: 'b', amountCents: -1000, categoryCode: 'courses' },
      { statementHash: 'h', transactionDate: '2026-03-10', label: 'c', amountCents: -1000, categoryCode: 'courses' },
    ]).run()
    expect(((await handler(makeEvent())) as Resp).reducedReliability).toBe(false)
  })

  it('leviers non vides quand le dividende requis dépasse la capacité', async () => {
    // Solde de départ négatif → dividende requis > 0 ; capacité 0 (revenue<expenses) → ne tient pas.
    dbMod.db.insert(schema.bankStatements).values({ hashSha256: 'h', periodStart: '2026-01-01', periodEnd: '2026-01-31', openingBalanceCents: 0, closingBalanceCents: -500_000 }).run()
    const r = (await handler(makeEvent())) as Resp
    expect(r.dividend.requiredNetCents).toBeGreaterThan(0)
    expect(r.dividend.fitsCapacity).toBe(false)
    expect(r.levers.length).toBeGreaterThan(0)
  })

  it('areOverlap : AG pendant ARE + dividende requis', async () => {
    const start = currentMonth()
    const agMonth = resolveNextAgMonth(start, '12-31')
    // ARE se termine après l'AG → chevauchement ; solde négatif → dividende requis.
    dbMod.db.update(schema.revenueModels).set({ unemploymentBenefitEndDate: `${agMonth}-28` }).run()
    dbMod.db.insert(schema.bankStatements).values({ hashSha256: 'h', periodStart: '2026-01-01', periodEnd: '2026-01-31', openingBalanceCents: 0, closingBalanceCents: -100_000 }).run()
    const r = (await handler(makeEvent())) as Resp
    expect(r.warnings.areOverlap).toBe(true)
  })
})
