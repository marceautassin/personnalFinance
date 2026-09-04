import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Cents } from '~~/shared/types/money'
import type { ForecastInput, ForecastRevenue } from './forecast-engine'

// DATABASE_URL fixé avant tout import runtime du module (charge db/client) → import dynamique.
const tmpDir = mkdtempSync(join(tmpdir(), 'pf-forecast-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type Mod = typeof import('./forecast-engine')
type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
let mod: Mod
let dbMod: DbModule
let schema: SchemaModule
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

const c = (n: number) => n as Cents
const NO_REVENUE: ForecastRevenue = {
  unemploymentBenefitMonthlyCents: c(0),
  unemploymentBenefitEndDate: null,
  sasMonthlyRentCents: c(0),
  expenseReimbursementsMonthlyCents: c(0),
}

function mkInput(partial: Partial<ForecastInput>): ForecastInput {
  return {
    startMonth: '2026-01',
    startingTreasuryCents: c(0),
    revenue: NO_REVENUE,
    fixedCharges: [],
    variableProjections: [],
    overrides: [],
    debtRecurringByMonth: new Map(),
    debtPunctualByMonth: new Map(),
    ...partial,
  }
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
    CREATE TABLE monthly_overrides (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL, category_code TEXT NOT NULL, amount_cents INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), UNIQUE(month, category_code));
    CREATE TABLE debts (id INTEGER PRIMARY KEY AUTOINCREMENT, creditor TEXT NOT NULL, initial_balance_cents INTEGER NOT NULL, repayment_mode TEXT NOT NULL DEFAULT 'free', monthly_amount_cents INTEGER, lump_sum_date TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE debt_events (id INTEGER PRIMARY KEY AUTOINCREMENT, debt_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL, event_date TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'advance', source_transaction_id INTEGER, note TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
  `)
  mod = await import('./forecast-engine')
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('computeForecast — pure', () => {
  it('nominal multi-source (revenus + charge fixe + variable + override)', () => {
    const res = mod.computeForecast(mkInput({
      startMonth: '2026-01',
      startingTreasuryCents: c(500_000),
      revenue: { unemploymentBenefitMonthlyCents: c(100_000), unemploymentBenefitEndDate: '2026-02-15', sasMonthlyRentCents: c(50_000), expenseReimbursementsMonthlyCents: c(10_000) },
      fixedCharges: [{ amountCents: c(-80_000), frequency: 'monthly', startDate: '2025-01-01', endDate: null }],
      variableProjections: [{ categoryCode: 'courses', projectedMonthlyCents: c(30_000) }],
      overrides: [{ month: '2026-02', categoryCode: 'courses', amountCents: c(45_000) }],
    }), 3)

    expect(res.months.map(m => m.incomeCents)).toEqual([160_000, 160_000, 60_000]) // ARE coupée en mars
    expect(res.months.map(m => m.variableCents)).toEqual([-30_000, -45_000, -30_000]) // override févr
    expect(res.months.map(m => m.netCents)).toEqual([50_000, 35_000, -50_000])
    expect(res.months.map(m => m.endingBalanceCents)).toEqual([550_000, 585_000, 535_000])
    expect(res.firstNegativeMonth).toBeNull()
  })

  it('FR47 : signale le premier mois à solde négatif', () => {
    const res = mod.computeForecast(mkInput({
      startingTreasuryCents: c(100_000),
      fixedCharges: [{ amountCents: c(-60_000), frequency: 'monthly', startDate: '2025-01-01', endDate: null }],
    }), 3)
    expect(res.months.map(m => m.endingBalanceCents)).toEqual([40_000, -20_000, -80_000])
    expect(res.firstNegativeMonth).toBe('2026-02')
  })

  it('ARE se terminant en milieu de mois : mois entier puis 0', () => {
    const res = mod.computeForecast(mkInput({
      revenue: { ...NO_REVENUE, unemploymentBenefitMonthlyCents: c(100_000), unemploymentBenefitEndDate: '2026-02-20' },
    }), 3)
    expect(res.months.map(m => m.incomeCents)).toEqual([100_000, 100_000, 0])
  })

  it('charge annuelle : uniquement sur l\'anniversaire (2 exercices)', () => {
    const res = mod.computeForecast(mkInput({
      fixedCharges: [{ amountCents: c(-120_000), frequency: 'annual', startDate: '2026-01-10', endDate: null }],
    }), 13)
    const fixedByMonth = res.months.map(m => m.fixedChargesCents)
    expect(fixedByMonth[0]).toBe(-120_000) // 2026-01
    expect(fixedByMonth[12]).toBe(-120_000) // 2027-01
    expect(fixedByMonth.filter(v => v !== 0)).toHaveLength(2)
  })

  it('charge trimestrielle : tous les 3 mois', () => {
    const res = mod.computeForecast(mkInput({
      fixedCharges: [{ amountCents: c(-30_000), frequency: 'quarterly', startDate: '2026-01-01', endDate: null }],
    }), 7)
    expect(res.months.map(m => (m.fixedChargesCents === 0 ? 0 : 1))).toEqual([1, 0, 0, 1, 0, 0, 1])
  })

  it('dette monthly → fixe, lump_sum → ponctuelle', () => {
    const res = mod.computeForecast(mkInput({
      debtRecurringByMonth: new Map([['2026-02', c(50_000)]]),
      debtPunctualByMonth: new Map([['2026-03', c(300_000)]]),
    }), 3)
    expect(res.months.map(m => m.fixedChargesCents)).toEqual([0, -50_000, 0])
    expect(res.months.map(m => m.punctualCents)).toEqual([0, 0, -300_000])
  })

  it('charge ponctuelle : uniquement son mois de début', () => {
    const res = mod.computeForecast(mkInput({
      fixedCharges: [{ amountCents: c(-200_000), frequency: 'punctual', startDate: '2026-02-15', endDate: null }],
    }), 3)
    expect(res.months.map(m => m.punctualCents)).toEqual([0, -200_000, 0])
  })

  it('override sans projection correspondante (historique vide) s\'applique quand même', () => {
    const res = mod.computeForecast(mkInput({
      startingTreasuryCents: c(200_000),
      variableProjections: [], // aucun historique ingéré → aucune projection
      overrides: [{ month: '2026-02', categoryCode: 'courses', amountCents: c(45_000) }],
    }), 3)
    expect(res.months.map(m => m.variableCents)).toEqual([0, -45_000, 0])
    expect(res.months.map(m => m.endingBalanceCents)).toEqual([200_000, 155_000, 155_000])
  })

  it('override sur une catégorie non projetée coexiste avec les catégories projetées', () => {
    const res = mod.computeForecast(mkInput({
      variableProjections: [{ categoryCode: 'courses', projectedMonthlyCents: c(30_000) }],
      overrides: [{ month: '2026-01', categoryCode: 'loisirs', amountCents: c(20_000) }],
    }), 2)
    // mois 1 : projection courses (30k) + override orphelin loisirs (20k) ; mois 2 : projection seule
    expect(res.months.map(m => m.variableCents)).toEqual([-50_000, -30_000])
  })

  it('historique/modèles vides : tout à 0, solde stable', () => {
    const res = mod.computeForecast(mkInput({ startingTreasuryCents: c(250_000) }), 6)
    expect(res.months.every(m => m.netCents === 0)).toBe(true)
    expect(res.months.at(-1)!.endingBalanceCents).toBe(250_000)
  })

  it('longueur = horizon (6/12/24)', () => {
    for (const h of [6, 12, 24]) {
      expect(mod.computeForecast(mkInput({}), h).months).toHaveLength(h)
    }
  })

  it('snapshot d\'un scénario complet (G5)', () => {
    const res = mod.computeForecast(mkInput({
      startMonth: '2026-01',
      startingTreasuryCents: c(1_000_000),
      revenue: { unemploymentBenefitMonthlyCents: c(120_000), unemploymentBenefitEndDate: '2026-03-31', sasMonthlyRentCents: c(80_000), expenseReimbursementsMonthlyCents: c(20_000) },
      fixedCharges: [
        { amountCents: c(-90_000), frequency: 'monthly', startDate: '2025-06-01', endDate: null },
        { amountCents: c(-300_000), frequency: 'annual', startDate: '2026-04-15', endDate: null },
      ],
      variableProjections: [
        { categoryCode: 'courses', projectedMonthlyCents: c(45_000) },
        { categoryCode: 'loisirs', projectedMonthlyCents: c(20_000) },
      ],
      overrides: [{ month: '2026-05', categoryCode: 'loisirs', amountCents: c(90_000) }],
      debtRecurringByMonth: new Map([['2026-02', c(40_000)], ['2026-03', c(40_000)]]),
      debtPunctualByMonth: new Map([['2026-06', c(250_000)]]),
    }), 6)
    expect(res).toMatchSnapshot()
  })
})

describe('buildForecastInput — accès DB', () => {
  beforeEach(() => {
    dbMod.db.delete(schema.transactions).run()
    dbMod.db.delete(schema.bankStatements).run()
    dbMod.db.delete(schema.fixedCharges).run()
    dbMod.db.delete(schema.monthlyOverrides).run()
    dbMod.db.delete(schema.debts).run()
    dbMod.db.delete(schema.categoryDefinitions).run()
    dbMod.db.delete(schema.revenueModels).run()
    dbMod.db.insert(schema.categoryDefinitions).values([{ code: 'courses', label: 'Courses', isVariable: true }]).run()
    dbMod.db.insert(schema.revenueModels).values({ id: 1, sasMonthlyRentCents: 50_000 }).run()
  })

  it('solde de départ = dernier relevé, projection + charges branchées', () => {
    dbMod.db.insert(schema.bankStatements).values([
      { hashSha256: 'a', periodStart: '2026-01-01', periodEnd: '2026-01-31', openingBalanceCents: 0, closingBalanceCents: 300_000 },
      { hashSha256: 'b', periodStart: '2026-02-01', periodEnd: '2026-02-28', openingBalanceCents: 0, closingBalanceCents: 420_000 },
    ]).run()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: 'a', transactionDate: '2026-01-10', label: 'x', amountCents: -30_000, categoryCode: 'courses' },
      { statementHash: 'b', transactionDate: '2026-02-10', label: 'y', amountCents: -50_000, categoryCode: 'courses' },
    ]).run()
    dbMod.db.insert(schema.fixedCharges).values({ label: 'loyer', amountCents: -80_000, categoryCode: 'courses', frequency: 'monthly', startDate: '2025-01-01', endDate: null }).run()

    const input = mod.buildForecastInput('2026-03', 6)
    expect(input.startingTreasuryCents).toBe(420_000) // dernier relevé (févr)
    expect(input.revenue.sasMonthlyRentCents).toBe(50_000)
    expect(input.fixedCharges).toHaveLength(1)
    // moyenne courses (30k, 50k) = 40k
    expect(input.variableProjections.find(p => p.categoryCode === 'courses')!.projectedMonthlyCents).toBe(40_000)
  })

  it('dette monthly alimente debtRecurringByMonth', () => {
    dbMod.db.insert(schema.debts).values({ creditor: 'Banque', initialBalanceCents: 250_000, repaymentMode: 'monthly', monthlyAmountCents: 100_000 }).run()
    const input = mod.buildForecastInput('2026-01', 6)
    expect(input.debtRecurringByMonth.get('2026-01')).toBe(100_000)
    expect(input.debtRecurringByMonth.get('2026-03')).toBe(50_000) // reste du solde
    expect(input.debtPunctualByMonth.size).toBe(0)
  })

  it('dette éteinte : plus aucune sortie après le mois de solde (NFR18 « dette à zéro »)', () => {
    dbMod.db.insert(schema.debts).values({ creditor: 'Banque', initialBalanceCents: 250_000, repaymentMode: 'monthly', monthlyAmountCents: 100_000 }).run()
    const input = mod.buildForecastInput('2026-01', 6)
    // 100k + 100k + 50k = 250k : la dette est soldée en mars, rien au-delà.
    for (const m of ['2026-04', '2026-05', '2026-06']) {
      expect(input.debtRecurringByMonth.get(m)).toBeUndefined()
    }
    const total = [...input.debtRecurringByMonth.values()].reduce((s, v) => s + v, 0)
    expect(total).toBe(250_000)

    // Le forecast ne porte aucune charge de dette sur les mois postérieurs à l'extinction.
    const res = mod.computeForecast(input, 6)
    expect(res.months.slice(3).every(m => m.fixedChargesCents === 0)).toBe(true)
  })
})
