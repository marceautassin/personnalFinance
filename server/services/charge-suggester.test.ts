import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-charge-suggester-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type ServiceModule = typeof import('./charge-suggester')

let dbMod: DbModule
let schema: SchemaModule
let service: ServiceModule
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

const HASH = 'a'.repeat(64)

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')
  service = await import('./charge-suggester')

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
    CREATE TABLE bank_statements (
      hash_sha256 TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      opening_balance_cents INTEGER NOT NULL,
      closing_balance_cents INTEGER NOT NULL,
      reliability TEXT NOT NULL DEFAULT 'reliable',
      ingested_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_hash TEXT NOT NULL REFERENCES bank_statements(hash_sha256) ON DELETE CASCADE,
      transaction_date TEXT NOT NULL,
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category_code TEXT NOT NULL REFERENCES category_definitions(code) ON DELETE RESTRICT,
      is_manual INTEGER NOT NULL DEFAULT 0,
      is_debt_repayment INTEGER NOT NULL DEFAULT 0,
      debt_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE fixed_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category_code TEXT NOT NULL REFERENCES category_definitions(code) ON DELETE RESTRICT,
      frequency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE dismissed_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_label TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)

  dbMod.db.insert(schema.categoryDefinitions).values([
    { code: 'abonnements', label: 'Abonnements' },
    { code: 'loisirs', label: 'Loisirs', isVariable: true },
    { code: 'divers', label: 'Divers', isVariable: true },
  ]).run()
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: HASH,
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    openingBalanceCents: 0,
    closingBalanceCents: 0,
  }).run()
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.transactions).run()
  dbMod.db.delete(schema.fixedCharges).run()
  dbMod.db.delete(schema.dismissedSuggestions).run()
})

function tx(date: string, label: string, amountCents: number, categoryCode = 'abonnements') {
  dbMod.db.insert(schema.transactions).values({
    statementHash: HASH,
    transactionDate: date,
    label,
    amountCents,
    categoryCode,
  }).run()
}

describe('charge-suggester', () => {
  it('detects one monthly netflix suggestion across 3 months of varied raw labels (AC#9)', async () => {
    tx('2026-01-15', 'NETFLIX 12.99 EUR', -1299)
    tx('2026-02-15', 'Netflix Sub 12,99', -1299)
    tx('2026-03-15', 'NETFLIX 12,99', -1299)

    const suggestions = await service.suggestRecurringCharges(dbMod.db)
    expect(suggestions).toHaveLength(1)
    const s = suggestions[0]!
    expect(s.normalizedLabel).toBe('netflix')
    expect(s.suggestedFrequency).toBe('monthly')
    expect(s.averageAmountCents).toBe(-1299)
    expect(s.occurrences).toBe(3)
    expect(s.categoryCode).toBe('abonnements')
    expect(s.transactionIds).toHaveLength(3)
  })

  it('returns no suggestion when present on only 2 months (below threshold) (AC#9)', async () => {
    tx('2026-01-15', 'NETFLIX 12.99', -1299)
    tx('2026-02-15', 'NETFLIX 12.99', -1299)

    expect(await service.suggestRecurringCharges(dbMod.db)).toHaveLength(0)
  })

  it('includes a 3-month group with amplitude > 15% via active-recurrence (variant: included) (AC#9)', async () => {
    // Les 3 mois SONT les 3 derniers ingérés → active-recurrence l'emporte sur l'amplitude.
    tx('2026-01-15', 'NETFLIX 12.99', -1299)
    tx('2026-02-15', 'NETFLIX 12.99', -1299)
    tx('2026-03-15', 'NETFLIX 25.99', -2599)

    const suggestions = await service.suggestRecurringCharges(dbMod.db)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.averageAmountCents).toBe(-1732) // round(-5197/3)
  })

  it('excludes a label already declared in fixed_charges (AC#5)', async () => {
    tx('2026-01-15', 'NETFLIX 12.99', -1299)
    tx('2026-02-15', 'NETFLIX 12.99', -1299)
    tx('2026-03-15', 'NETFLIX 12.99', -1299)
    dbMod.db.insert(schema.fixedCharges).values({
      label: 'Netflix abo 12,99',
      amountCents: -1299,
      categoryCode: 'abonnements',
      frequency: 'monthly',
      startDate: '2026-01-01',
    }).run()

    expect(await service.suggestRecurringCharges(dbMod.db)).toHaveLength(0)
  })

  it('excludes a dismissed label (AC#4)', async () => {
    tx('2026-01-15', 'NETFLIX 12.99', -1299)
    tx('2026-02-15', 'NETFLIX 12.99', -1299)
    tx('2026-03-15', 'NETFLIX 12.99', -1299)
    dbMod.db.insert(schema.dismissedSuggestions).values({ normalizedLabel: 'netflix' }).run()

    expect(await service.suggestRecurringCharges(dbMod.db)).toHaveLength(0)
  })

  it('takes the modal category among matched transactions (AC#3)', async () => {
    tx('2026-01-15', 'SPOTIFY 9.99', -999, 'abonnements')
    tx('2026-02-15', 'SPOTIFY 9.99', -999, 'abonnements')
    tx('2026-03-15', 'SPOTIFY 9.99', -999, 'loisirs')

    const suggestions = await service.suggestRecurringCharges(dbMod.db)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.categoryCode).toBe('abonnements')
  })

  it('sorts by occurrences desc then |amount| desc (AC#6)', async () => {
    // spotify : 4 mois ; loyer : 3 mois mais montant plus gros
    for (const m of ['01', '02', '03', '04']) tx(`2026-${m}-10`, 'SPOTIFY 9.99', -999)
    for (const m of ['02', '03', '04']) tx(`2026-${m}-05`, 'LOYER appart', -90000, 'abonnements')

    const suggestions = await service.suggestRecurringCharges(dbMod.db)
    expect(suggestions.map(s => s.normalizedLabel)).toEqual(['spotify', 'loyer appart'])
  })

  it('detects an annual charge seen once per year over 2 years (AC#34)', async () => {
    tx('2025-06-12', 'ASSUR HABITATION', -12000)
    tx('2026-06-15', 'ASSUR HABITATION', -12000)

    const suggestions = await service.suggestRecurringCharges(dbMod.db)
    expect(suggestions).toHaveLength(1)
    const s = suggestions[0]!
    expect(s.normalizedLabel).toBe('assur habitation')
    expect(s.suggestedFrequency).toBe('annual')
    expect(s.occurrences).toBe(2)
    expect(s.startDate).toBe('2025-06-01')
  })

  it('does not merge distinct merchants sharing only generic tokens (3-letter brands)', async () => {
    // PRLV/FACTURE sont des mots-outils retirés ; EDF et SFR (3 lettres) restent distincts.
    for (const m of ['01', '02', '03']) tx(`2026-${m}-05`, 'PRLV EDF FACTURE', -8000)
    for (const m of ['01', '02', '03']) tx(`2026-${m}-06`, 'PRLV SFR FACTURE', -3000)

    const suggestions = await service.suggestRecurringCharges(dbMod.db)
    expect(suggestions).toHaveLength(2)
    expect(new Set(suggestions.map(s => s.normalizedLabel))).toEqual(new Set(['edf', 'sfr']))
  })

  it('excludes a degenerate group whose amounts net to a zero average', async () => {
    // Un débit et son remboursement de même libellé sur les 3 derniers mois → moyenne 0.
    tx('2026-01-15', 'OPER NEUTRE', -5000)
    tx('2026-02-15', 'OPER NEUTRE', 5000)
    tx('2026-03-10', 'OPER NEUTRE', -3000)
    tx('2026-03-20', 'OPER NEUTRE', 3000)

    expect(await service.suggestRecurringCharges(dbMod.db)).toHaveLength(0)
  })
})
