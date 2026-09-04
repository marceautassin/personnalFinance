import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Cents } from '~~/shared/types/money'
import type { VariableCategoryHistory } from './variable-projection'

// DATABASE_URL fixé avant tout import runtime du module (qui charge db/client) : on charge donc
// `variable-projection` dynamiquement dans beforeAll, jamais en statique.
const tmpDir = mkdtempSync(join(tmpdir(), 'pf-var-proj-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type Mod = typeof import('./variable-projection')
type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')

let mod: Mod
let dbMod: DbModule
let schema: SchemaModule
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

const c = (n: number) => n as Cents
const hist = (categoryCode: string, totals: number[]): VariableCategoryHistory => ({
  categoryCode,
  monthlyTotalsCents: totals.map(c),
})

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
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, statement_hash TEXT NOT NULL, transaction_date TEXT NOT NULL,
      label TEXT NOT NULL, amount_cents INTEGER NOT NULL, category_code TEXT NOT NULL,
      is_manual INTEGER NOT NULL DEFAULT 0, is_debt_repayment INTEGER NOT NULL DEFAULT 0,
      debt_id INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)
  mod = await import('./variable-projection')
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('projectVariableCategories — fonction pure', () => {
  it('défaut N=3', () => {
    expect(mod.DEFAULT_PROJECTION_WINDOW_MONTHS).toBe(3)
  })

  it('nominal : moyenne exacte des 3 derniers mois, historique suffisant', () => {
    const [r] = mod.projectVariableCategories([hist('courses', [30_000, 40_000, 50_000])], 3)
    expect(r).toMatchObject({ projectedMonthlyCents: 40_000, monthsUsed: 3, sufficientHistory: true })
  })

  it('k < N : moyenne sur les mois disponibles, fiabilité réduite (FR45)', () => {
    const [r] = mod.projectVariableCategories([hist('loisirs', [20_000, 30_000])], 3)
    expect(r).toMatchObject({ projectedMonthlyCents: 25_000, monthsUsed: 2, sufficientHistory: false })
  })

  it('historique vide → 0, pas de division par zéro', () => {
    const [r] = mod.projectVariableCategories([hist('vide', [])], 3)
    expect(r).toMatchObject({ projectedMonthlyCents: 0, monthsUsed: 0, sufficientHistory: false })
  })

  it('plus de N mois : ne garde que les N derniers', () => {
    const [r] = mod.projectVariableCategories([hist('courses', [10_000, 10_000, 40_000, 50_000, 60_000])], 3)
    expect(r).toMatchObject({ projectedMonthlyCents: 50_000, monthsUsed: 3, sufficientHistory: true })
  })

  it('arrondi au centime le plus proche (moyenne non entière)', () => {
    const [a] = mod.projectVariableCategories([hist('x', [100, 101, 100])], 3) // 100.33 → 100
    expect(a!.projectedMonthlyCents).toBe(100)
    const [b] = mod.projectVariableCategories([hist('y', [100, 101, 101])], 3) // 100.67 → 101
    expect(b!.projectedMonthlyCents).toBe(101)
  })

  it('N=1 : dernier mois uniquement', () => {
    const [r] = mod.projectVariableCategories([hist('courses', [30_000, 99_000])], 1)
    expect(r).toMatchObject({ projectedMonthlyCents: 99_000, monthsUsed: 1, sufficientHistory: true })
  })

  it('multi-catégories indépendantes', () => {
    const res = mod.projectVariableCategories([
      hist('courses', [30_000, 30_000, 30_000]),
      hist('loisirs', [0, 0, 60_000]),
    ], 3)
    expect(res.map(r => r.projectedMonthlyCents)).toEqual([30_000, 20_000])
  })

  it('mois à 0 comptés dans la moyenne', () => {
    const [r] = mod.projectVariableCategories([hist('courses', [60_000, 0, 0])], 3)
    expect(r).toMatchObject({ projectedMonthlyCents: 20_000, monthsUsed: 3, sufficientHistory: true })
  })
})

describe('buildVariableHistory — accès DB', () => {
  beforeEach(() => {
    dbMod.db.delete(schema.transactions).run()
    dbMod.db.delete(schema.categoryDefinitions).run()
    dbMod.db.insert(schema.categoryDefinitions).values([
      { code: 'courses', label: 'Courses', isVariable: true },
      { code: 'loisirs', label: 'Loisirs', isVariable: true },
      { code: 'logement', label: 'Logement', isVariable: false }, // fixe → ignorée
    ]).run()
  })

  function tx(date: string, code: string, amountCents: number) {
    dbMod.db.insert(schema.transactions).values({
      statementHash: 'h', transactionDate: date, label: 'x', amountCents, categoryCode: code,
    }).run()
  }

  it('aligne les mois ingérés, 0-fill, exclut les fixes, nette un avoir', () => {
    tx('2026-01-05', 'courses', -30_000)
    tx('2026-01-20', 'courses', 10_000) // avoir → net janvier 200
    tx('2026-02-10', 'courses', -40_000)
    tx('2026-02-11', 'loisirs', -60_000)
    tx('2026-02-12', 'logement', -120_000) // fixe → exclue

    const history = mod.buildVariableHistory(3)
    expect(history.map(h => h.categoryCode).sort()).toEqual(['courses', 'loisirs'])
    expect(history.find(h => h.categoryCode === 'courses')!.monthlyTotalsCents).toEqual([20_000, 40_000])
    expect(history.find(h => h.categoryCode === 'loisirs')!.monthlyTotalsCents).toEqual([0, 60_000])
  })

  it('borne aux windowMonths derniers mois ingérés', () => {
    tx('2026-01-01', 'courses', -10_000)
    tx('2026-02-01', 'courses', -20_000)
    tx('2026-03-01', 'courses', -30_000)
    tx('2026-04-01', 'courses', -40_000)
    expect(mod.buildVariableHistory(2).find(h => h.categoryCode === 'courses')!.monthlyTotalsCents)
      .toEqual([30_000, 40_000])
  })

  it('aucune transaction → historique vide', () => {
    expect(mod.buildVariableHistory(3)).toEqual([])
  })

  /**
   * Biais 2 (story 6.6) : un remboursement de dette marqué mais laissé dans une catégorie
   * VARIABLE entrait dans la moyenne mobile, alors que `projectDebt` le reprojette déjà —
   * double comptage direct dans le forecast. L'exclusion porte sur le flag, pas sur la
   * catégorie : c'est ce qui la rend correcte quand l'utilisateur n'utilise pas
   * `remboursement_dette`.
   */
  it('exclut un remboursement marqué resté dans une catégorie variable', () => {
    tx('2026-01-05', 'courses', -30_000)
    dbMod.db.insert(schema.transactions).values({
      statementHash: 'h', transactionDate: '2026-01-20', label: 'remb conjointe',
      amountCents: -50_000, categoryCode: 'courses', isDebtRepayment: true, debtId: 1,
    }).run()

    const courses = mod.buildVariableHistory(3).find(h => h.categoryCode === 'courses')!
    // 30 000 seulement : sans l'exclusion, on lirait 80 000 et le dividende serait gonflé.
    expect(courses.monthlyTotalsCents).toEqual([30_000])
  })
})
