import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Cents } from '~~/shared/types/money'

/**
 * `debt-balance` — fonction de CALCUL FINANCIER, donc NFR18 (1 nominal + cas limites).
 *
 * Elle n'avait aucun fichier de test dédié (revue du 2026-09-04). Sa couverture était indirecte
 * via `crud.test.ts`, où **tous les cas GET n'avaient qu'une seule dette** : `balanceSumsByDebt`
 * — le chemin de production de `GET /api/debts` — n'était jamais exercé sur plusieurs dettes.
 * Le reviewer a vérifié à la main qu'il fonctionnait ; ce fichier tend le filet.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-debt-balance-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type BalanceModule = typeof import('./debt-balance')

let dbMod: DbModule
let schema: SchemaModule
let mod: BalanceModule
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

const c = (n: number) => n as Cents

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')
  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(`
    CREATE TABLE debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creditor TEXT NOT NULL,
      initial_balance_cents INTEGER NOT NULL,
      repayment_mode TEXT NOT NULL DEFAULT 'free',
      monthly_amount_cents INTEGER,
      lump_sum_date TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE debt_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
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
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)
  mod = await import('./debt-balance')
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  sqlite.exec('DELETE FROM debt_events; DELETE FROM transactions; DELETE FROM debts;')
})

function seedDebt(creditor: string, initialCents: number): number {
  const r = dbMod.db.insert(schema.debts).values({
    creditor, initialBalanceCents: initialCents, repaymentMode: 'free',
  }).run()
  return Number(r.lastInsertRowid)
}

function seedEvent(debtId: number, amountCents: number) {
  dbMod.db.insert(schema.debtEvents).values({
    debtId, amountCents, eventDate: '2026-02-01',
  }).run()
}

/** Remboursement marqué : transaction SORTANTE rattachée. */
function seedRepayment(debtId: number, absCents: number) {
  seedAttached(debtId, -absCents)
}

/** Transaction rattachée à une dette, montant SIGNÉ (négatif = sortie, positif = entrée). */
function seedAttached(debtId: number, signedCents: number) {
  dbMod.db.insert(schema.transactions).values({
    statementHash: 'h', transactionDate: '2026-02-10', label: 'mouvement',
    amountCents: signedCents, categoryCode: 'divers', isDebtRepayment: true, debtId,
  }).run()
}

describe('toCurrentBalance', () => {
  // Le 3e argument est la somme SIGNÉE des transactions rattachées : une sortie y est négative.
  it('nominal : initial + événements + transactions rattachées (sortie négative)', () => {
    expect(mod.toCurrentBalance(c(100_000), c(20_000), c(-50_000))).toBe(70_000)
  })

  it('peut être négatif — une créance, pas une anomalie', () => {
    expect(mod.toCurrentBalance(c(10_000), c(0), c(-40_000))).toBe(-30_000)
  })

  it('événements signés : un événement négatif diminue le solde', () => {
    expect(mod.toCurrentBalance(c(100_000), c(-30_000), c(0))).toBe(70_000)
  })

  /**
   * Le BLOQUANT de la revue du 2026-09-04 : le calcul sommait `abs()` et soustrayait, donc un
   * encaissement rattaché creusait la créance au lieu de la résorber.
   */
  it('une transaction ENTRANTE rattachée rapproche le solde de zéro', () => {
    expect(mod.toCurrentBalance(c(-50_000), c(0), c(20_000))).toBe(-30_000)
  })
})

describe('currentBalanceForDebt', () => {
  it('dette sans aucun événement ni remboursement = solde initial', () => {
    const id = seedDebt('Ami', 75_000)
    expect(mod.currentBalanceForDebt(id, c(75_000))).toBe(75_000)
  })

  it('agrège événements et remboursements', () => {
    const id = seedDebt('Papa', 100_000)
    seedEvent(id, 50_000)
    seedEvent(id, -10_000)
    seedRepayment(id, 30_000)
    expect(mod.currentBalanceForDebt(id, c(100_000))).toBe(110_000)
  })

  /**
   * BLOQUANT de la revue du 2026-09-04, reproduit avec ses chiffres exacts :
   * créance de 500 €, encaissement de 200 € rattaché → la créance doit tomber à 300 €.
   * Le calcul en `abs()` donnait -70 000. Ce cas n'était couvert par AUCUN test — c'est ce
   * trou qui laissait 468 tests au vert sur un solde faux.
   */
  it('encaissement rattaché à une CRÉANCE : la résorbe, ne la creuse pas', () => {
    const id = seedDebt('Conjointe', -50_000)
    seedAttached(id, 20_000)
    expect(mod.currentBalanceForDebt(id, c(-50_000))).toBe(-30_000)
  })

  it('entrée et sortie rattachées se compensent correctement', () => {
    const id = seedDebt('Conjointe', 0)
    seedAttached(id, 60_000)
    seedAttached(id, -25_000)
    expect(mod.currentBalanceForDebt(id, c(0))).toBe(35_000)
  })

  /** Le calcul filtre sur le FLAG : une ligne `debt_id` non marquée ne compte pas. */
  it('ignore une transaction portant debt_id mais NON marquée', () => {
    const id = seedDebt('Papa', 100_000)
    dbMod.db.insert(schema.transactions).values({
      statementHash: 'h', transactionDate: '2026-02-10', label: 'non marquée',
      amountCents: -40_000, categoryCode: 'divers', isDebtRepayment: false, debtId: id,
    }).run()
    expect(mod.currentBalanceForDebt(id, c(100_000))).toBe(100_000)
  })

  it('sur-remboursement → solde négatif', () => {
    const id = seedDebt('Papa', 50_000)
    seedRepayment(id, 80_000)
    expect(mod.currentBalanceForDebt(id, c(50_000))).toBe(-30_000)
  })
})

describe('balanceSumsByDebt — le chemin de GET /api/debts', () => {
  /**
   * LE trou de couverture identifié en revue : tous les cas existants n'avaient qu'une seule
   * dette, donc l'agrégation `GROUP BY` n'était jamais exercée sur plusieurs.
   */
  it('agrège correctement PLUSIEURS dettes sans mélanger les soldes', () => {
    const a = seedDebt('A', 100_000)
    const b = seedDebt('B', 200_000)
    const d = seedDebt('C', 300_000) // aucun mouvement

    seedEvent(a, 10_000)
    seedRepayment(a, 5_000)
    seedEvent(b, -50_000)
    seedRepayment(b, 20_000)

    const { events, attached } = mod.balanceSumsByDebt()
    expect(events.get(a)).toBe(10_000)
    expect(attached.get(a)).toBe(-5_000)
    expect(events.get(b)).toBe(-50_000)
    expect(attached.get(b)).toBe(-20_000)
    expect(events.get(d)).toBeUndefined()
    expect(attached.get(d)).toBeUndefined()

    const ZERO = c(0)
    expect(mod.toCurrentBalance(c(100_000), events.get(a) ?? ZERO, attached.get(a) ?? ZERO)).toBe(105_000)
    expect(mod.toCurrentBalance(c(200_000), events.get(b) ?? ZERO, attached.get(b) ?? ZERO)).toBe(130_000)
    expect(mod.toCurrentBalance(c(300_000), events.get(d) ?? ZERO, attached.get(d) ?? ZERO)).toBe(300_000)
  })

  it('base vide : deux maps vides, aucune exception', () => {
    const { events, attached } = mod.balanceSumsByDebt()
    expect(events.size).toBe(0)
    expect(attached.size).toBe(0)
  })

  it('agrège en SIGNÉ : une entrée rattachée compense une sortie', () => {
    const a = seedDebt('A', 0)
    seedAttached(a, -30_000)
    seedAttached(a, 10_000)
    expect(mod.balanceSumsByDebt().attached.get(a)).toBe(-20_000)
  })

  it('exclut les transactions non marquées de l\'agrégation en lot', () => {
    const a = seedDebt('A', 100_000)
    dbMod.db.insert(schema.transactions).values({
      statementHash: 'h', transactionDate: '2026-02-10', label: 'non marquée',
      amountCents: -40_000, categoryCode: 'divers', isDebtRepayment: false, debtId: a,
    }).run()
    expect(mod.balanceSumsByDebt().attached.get(a)).toBeUndefined()
  })
})

describe('linkedTransactionCountsByDebt', () => {
  it('compte les transactions rattachées, par dette', () => {
    const a = seedDebt('A', 100_000)
    const b = seedDebt('B', 100_000)
    seedRepayment(a, 1_000)
    seedRepayment(a, 2_000)
    seedRepayment(b, 3_000)

    const counts = mod.linkedTransactionCountsByDebt()
    expect(counts.get(a)).toBe(2)
    expect(counts.get(b)).toBe(1)
  })

  it('dette sans transaction : absente de la map', () => {
    const a = seedDebt('A', 100_000)
    expect(mod.linkedTransactionCountsByDebt().get(a)).toBeUndefined()
  })
})
