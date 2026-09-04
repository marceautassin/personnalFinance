import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-dashboard-api-'))
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

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')

  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(TEST_SCHEMA_DDL)
  sqlite.exec(TEST_REFERENTIAL_DDL)

  handler = (await import('./dashboard.get')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.transactions).run()
  dbMod.db.delete(schema.bankStatements).run()
})

function eventWithQuery(query: string): H3Event {
  return { path: `/api/dashboard?${query}` } as unknown as H3Event
}

function seedStatement(opts: {
  hash: string
  periodStart: string
  periodEnd: string
  opening?: number
  closing?: number
  reliability?: 'reliable' | 'unreliable'
}) {
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: opts.hash,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    openingBalanceCents: opts.opening ?? 0,
    closingBalanceCents: opts.closing ?? 0,
    reliability: opts.reliability ?? 'reliable',
  }).run()
}

interface Resp {
  month: string
  balanceCents: number
  totals: { incomeCents: number, expenseCents: number, byCategory: Record<string, number> }
  deltasVsPriorMonths: Array<{
    categoryItemCode: string
    label: string
    currentCents: number
    priorAvgCents: number
    diffCents: number
    pct: number | null
  }>
  phrases: string[]
  reliability: 'reliable' | 'unreliable' | null
}

const H_FEB = 'a'.repeat(64)
const H_MAR = 'b'.repeat(64)
const H_APR = 'c'.repeat(64)

describe('GET /api/dashboard', () => {
  // Cas (a) — mois nominal avec 2 mois précédents et 3 catégories en delta significatif.
  it('returns top 3 deltas vs prior 2 months in nominal case', async () => {
    seedStatement({ hash: H_FEB, periodStart: '2026-02-01', periodEnd: '2026-02-28', closing: 1_000_000 })
    seedStatement({ hash: H_MAR, periodStart: '2026-03-01', periodEnd: '2026-03-31', closing: 950_000 })
    seedStatement({ hash: H_APR, periodStart: '2026-04-01', periodEnd: '2026-04-30', closing: 500_000 })

    // Février : courses -200 €, restaurants -100 €, transports -50 €, salaire +3000 €
    dbMod.db.insert(schema.transactions).values([
      { statementHash: H_FEB, transactionDate: '2026-02-10', label: 'Carrefour', amountCents: -20_000, categoryItemCode: 'alimentation-courses' },
      { statementHash: H_FEB, transactionDate: '2026-02-15', label: 'Resto', amountCents: -10_000, categoryItemCode: 'alimentation-restaurant' },
      { statementHash: H_FEB, transactionDate: '2026-02-20', label: 'Métro', amountCents: -5_000, categoryItemCode: 'transport-carburant' },
      { statementHash: H_FEB, transactionDate: '2026-02-28', label: 'Paye', amountCents: 300_000, categoryItemCode: 'revenus-salaire' },
    ]).run()
    // Mars : courses -200 €, restaurants -100 €, transports -50 €, salaire +3000 €
    dbMod.db.insert(schema.transactions).values([
      { statementHash: H_MAR, transactionDate: '2026-03-10', label: 'Carrefour', amountCents: -20_000, categoryItemCode: 'alimentation-courses' },
      { statementHash: H_MAR, transactionDate: '2026-03-15', label: 'Resto', amountCents: -10_000, categoryItemCode: 'alimentation-restaurant' },
      { statementHash: H_MAR, transactionDate: '2026-03-20', label: 'Métro', amountCents: -5_000, categoryItemCode: 'transport-carburant' },
      { statementHash: H_MAR, transactionDate: '2026-03-31', label: 'Paye', amountCents: 300_000, categoryItemCode: 'revenus-salaire' },
    ]).run()
    // Avril : courses -480 € (hausse marquée), restaurants -250 € (hausse), transports -50 € (idem), salaire +3000 €
    dbMod.db.insert(schema.transactions).values([
      { statementHash: H_APR, transactionDate: '2026-04-05', label: 'Carrefour', amountCents: -48_000, categoryItemCode: 'alimentation-courses' },
      { statementHash: H_APR, transactionDate: '2026-04-10', label: 'Resto', amountCents: -25_000, categoryItemCode: 'alimentation-restaurant' },
      { statementHash: H_APR, transactionDate: '2026-04-15', label: 'Métro', amountCents: -5_000, categoryItemCode: 'transport-carburant' },
      { statementHash: H_APR, transactionDate: '2026-04-30', label: 'Paye', amountCents: 300_000, categoryItemCode: 'revenus-salaire' },
    ]).run()

    const r = (await handler(eventWithQuery('month=2026-04'))) as Resp

    expect(r.month).toBe('2026-04')
    expect(r.balanceCents).toBe(500_000)
    expect(r.totals.incomeCents).toBe(300_000)
    expect(r.totals.expenseCents).toBe(-78_000) // -480 - 250 - 50
    expect(r.totals.byCategory['alimentation-courses']).toBe(-48_000)
    expect(r.totals.byCategory['alimentation-restaurant']).toBe(-25_000)
    expect(r.totals.byCategory['revenus-salaire']).toBe(300_000)

    // Deltas attendus : courses +28 000c (62%) prime, restaurants +15 000c (150%), transports +0 → exclu (< seuil).
    expect(r.deltasVsPriorMonths.length).toBeGreaterThanOrEqual(2)
    const codes = r.deltasVsPriorMonths.map(d => d.categoryItemCode)
    expect(codes).toContain('alimentation-courses')
    expect(codes).toContain('alimentation-restaurant')
    expect(codes).not.toContain('transport-carburant') // diff = 0 → exclu
    // Top par |diff| → courses (-28 000) avant restaurants (-15 000)
    expect(r.deltasVsPriorMonths[0]!.categoryItemCode).toBe('alimentation-courses')
    expect(r.deltasVsPriorMonths[0]!.diffCents).toBe(-28_000)
    expect(r.deltasVsPriorMonths[0]!.priorAvgCents).toBe(-20_000)
    expect(r.deltasVsPriorMonths[0]!.pct).toBeCloseTo(1.4, 1)

    expect(r.phrases).toHaveLength(r.deltasVsPriorMonths.length)
    expect(r.phrases[0]).toContain('courses')
    expect(r.phrases[0]).toMatch(/augmenté/i)
    expect(r.phrases[0]).toContain('principal facteur')
    expect(r.phrases[1]).not.toContain('principal facteur')

    expect(r.reliability).toBe('reliable')
  })

  // Cas (b) — mois sans transactions ni statement → tous zéros, deltas vide, phrases vide.
  it('returns zeros and empty deltas when month has no transactions and no statement', async () => {
    const r = (await handler(eventWithQuery('month=2026-07'))) as Resp

    expect(r.month).toBe('2026-07')
    expect(r.balanceCents).toBe(0)
    expect(r.totals).toEqual({ incomeCents: 0, expenseCents: 0, byCategory: {} })
    expect(r.deltasVsPriorMonths).toEqual([])
    expect(r.phrases).toEqual([])
    expect(r.reliability).toBeNull()
  })

  // Cas (c) — mois unreliable propagé via les statements chevauchants.
  it('propagates unreliable reliability when at least one covering statement is unreliable', async () => {
    seedStatement({ hash: H_APR, periodStart: '2026-04-01', periodEnd: '2026-04-30', closing: 100_000, reliability: 'unreliable' })

    const r = (await handler(eventWithQuery('month=2026-04'))) as Resp
    expect(r.reliability).toBe('unreliable')
  })

  // Cas (d) — nouvelle catégorie (priorAvg = 0) → incluse, pct = null.
  it('includes a brand-new category as a delta with pct=null', async () => {
    seedStatement({ hash: H_MAR, periodStart: '2026-03-01', periodEnd: '2026-03-31', closing: 0 })
    seedStatement({ hash: H_APR, periodStart: '2026-04-01', periodEnd: '2026-04-30', closing: 0 })
    // Mars : aucune transaction. Avril : une dépense voyages... pardon, une dépense `loisirs` (priorAvg = 0).
    dbMod.db.insert(schema.transactions).values([
      { statementHash: H_APR, transactionDate: '2026-04-15', label: 'Cinéma', amountCents: -35_000, categoryItemCode: 'loisirs-sport' },
    ]).run()

    const r = (await handler(eventWithQuery('month=2026-04'))) as Resp
    expect(r.deltasVsPriorMonths).toHaveLength(1)
    const d = r.deltasVsPriorMonths[0]!
    expect(d.categoryItemCode).toBe('loisirs-sport')
    expect(d.priorAvgCents).toBe(0)
    expect(d.pct).toBeNull()
    expect(r.phrases[0]).toMatch(/nouvelle dépense/i)
    expect(r.phrases[0]).toContain('Sport')
  })

  // Cas (e) — deltas tous sous le seuil → array vide.
  it('returns empty deltas when all month-over-month diffs are below thresholds', async () => {
    seedStatement({ hash: H_MAR, periodStart: '2026-03-01', periodEnd: '2026-03-31', closing: 0 })
    seedStatement({ hash: H_APR, periodStart: '2026-04-01', periodEnd: '2026-04-30', closing: 0 })
    // Diff de 5 € (500 cents) sur courses → sous le seuil 10 €.
    dbMod.db.insert(schema.transactions).values([
      { statementHash: H_MAR, transactionDate: '2026-03-10', label: 'A', amountCents: -10_000, categoryItemCode: 'alimentation-courses' },
      { statementHash: H_APR, transactionDate: '2026-04-10', label: 'A', amountCents: -10_500, categoryItemCode: 'alimentation-courses' },
    ]).run()

    const r = (await handler(eventWithQuery('month=2026-04'))) as Resp
    expect(r.deltasVsPriorMonths).toEqual([])
    expect(r.phrases).toEqual([])
  })

  // Cas (f) — `month` Zod-invalid → 422 validation_failed.
  it('returns 422 validation_failed for an invalid month query', async () => {
    await expect(handler(eventWithQuery('month=2026-13'))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })

  // Cas (g) — `phrases[0]` contient "principal facteur", `phrases[1]` non.
  it('marks only the first phrase as the primary contributor', async () => {
    seedStatement({ hash: H_FEB, periodStart: '2026-02-01', periodEnd: '2026-02-28', closing: 0 })
    seedStatement({ hash: H_MAR, periodStart: '2026-03-01', periodEnd: '2026-03-31', closing: 0 })
    seedStatement({ hash: H_APR, periodStart: '2026-04-01', periodEnd: '2026-04-30', closing: 0 })
    // Crée 2 deltas significatifs sur courses + restaurants pour avril.
    dbMod.db.insert(schema.transactions).values([
      { statementHash: H_FEB, transactionDate: '2026-02-10', label: 'A', amountCents: -10_000, categoryItemCode: 'alimentation-courses' },
      { statementHash: H_FEB, transactionDate: '2026-02-12', label: 'B', amountCents: -10_000, categoryItemCode: 'alimentation-restaurant' },
      { statementHash: H_MAR, transactionDate: '2026-03-10', label: 'A', amountCents: -10_000, categoryItemCode: 'alimentation-courses' },
      { statementHash: H_MAR, transactionDate: '2026-03-12', label: 'B', amountCents: -10_000, categoryItemCode: 'alimentation-restaurant' },
      { statementHash: H_APR, transactionDate: '2026-04-10', label: 'A', amountCents: -50_000, categoryItemCode: 'alimentation-courses' },
      { statementHash: H_APR, transactionDate: '2026-04-12', label: 'B', amountCents: -30_000, categoryItemCode: 'alimentation-restaurant' },
    ]).run()

    const r = (await handler(eventWithQuery('month=2026-04'))) as Resp
    expect(r.phrases.length).toBeGreaterThanOrEqual(2)
    expect(r.phrases[0]).toContain('principal facteur')
    expect(r.phrases[1]).not.toContain('principal facteur')
  })

  // Cas supplémentaire — moyenne PAR CATÉGORIE : une catégorie présente dans un seul des deux
  // mois précédents non-vides est divisée par 1 (le mois où elle existe), pas par 2 (story 4.1 D1).
  it('averages priorAvg per category, dividing only by months where the category exists', async () => {
    seedStatement({ hash: H_FEB, periodStart: '2026-02-01', periodEnd: '2026-02-28', closing: 0 })
    seedStatement({ hash: H_MAR, periodStart: '2026-03-01', periodEnd: '2026-03-31', closing: 0 })
    seedStatement({ hash: H_APR, periodStart: '2026-04-01', periodEnd: '2026-04-30', closing: 0 })
    // Février (non-vide) : courses -300 € + restaurants -100 €. Mars (non-vide) : restaurants -100 €
    // seulement (PAS de courses). Avril : courses -100 €.
    dbMod.db.insert(schema.transactions).values([
      { statementHash: H_FEB, transactionDate: '2026-02-10', label: 'A', amountCents: -30_000, categoryItemCode: 'alimentation-courses' },
      { statementHash: H_FEB, transactionDate: '2026-02-12', label: 'B', amountCents: -10_000, categoryItemCode: 'alimentation-restaurant' },
      { statementHash: H_MAR, transactionDate: '2026-03-12', label: 'B', amountCents: -10_000, categoryItemCode: 'alimentation-restaurant' },
      { statementHash: H_APR, transactionDate: '2026-04-10', label: 'A', amountCents: -10_000, categoryItemCode: 'alimentation-courses' },
    ]).run()

    const r = (await handler(eventWithQuery('month=2026-04'))) as Resp
    const courses = r.deltasVsPriorMonths.find(x => x.categoryItemCode === 'alimentation-courses')!
    // courses n'existe qu'en février → priorAvg = -300 € (÷1), PAS -150 € (÷2 mois non-vides).
    expect(courses.priorAvgCents).toBe(-30_000)
    expect(courses.diffCents).toBe(20_000) // -10_000 - (-30_000)
  })

  // Cas supplémentaire — un seul mois précédent disponible (couvre AC#5).
  it('handles a single prior month with valid average', async () => {
    seedStatement({ hash: H_MAR, periodStart: '2026-03-01', periodEnd: '2026-03-31', closing: 0 })
    seedStatement({ hash: H_APR, periodStart: '2026-04-01', periodEnd: '2026-04-30', closing: 0 })
    dbMod.db.insert(schema.transactions).values([
      { statementHash: H_MAR, transactionDate: '2026-03-10', label: 'A', amountCents: -10_000, categoryItemCode: 'alimentation-courses' },
      { statementHash: H_APR, transactionDate: '2026-04-10', label: 'A', amountCents: -50_000, categoryItemCode: 'alimentation-courses' },
    ]).run()

    const r = (await handler(eventWithQuery('month=2026-04'))) as Resp
    expect(r.deltasVsPriorMonths.length).toBeGreaterThanOrEqual(1)
    const d = r.deltasVsPriorMonths.find(x => x.categoryItemCode === 'alimentation-courses')!
    // Seul mars a des données → priorAvg = -10_000 (moyenne sur 1 seul mois actif).
    expect(d.priorAvgCents).toBe(-10_000)
    expect(d.diffCents).toBe(-40_000) // -50_000 - (-10_000)
  })
})
