import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-debts-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
let getHandler: Handler
let postHandler: Handler
let putHandler: Handler
let deleteHandler: Handler
let advanceHandler: Handler
let impactHandler: Handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

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
      repayment_mode TEXT NOT NULL DEFAULT 'free'
        CHECK(repayment_mode IN ('free','monthly','lump_sum')),
      monthly_amount_cents INTEGER,
      lump_sum_date TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE debt_advances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      advance_date TEXT NOT NULL,
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
    PRAGMA foreign_keys = ON;
  `)

  getHandler = (await import('./index.get')).default as Handler
  postHandler = (await import('./index.post')).default as Handler
  putHandler = (await import('./[id].put')).default as Handler
  deleteHandler = (await import('./[id].delete')).default as Handler
  advanceHandler = (await import('./[id]/advances.post')).default as Handler
  impactHandler = (await import('./[id]/impact.get')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  sqlite.exec('DELETE FROM debt_advances; DELETE FROM transactions; DELETE FROM debts;')
})

function makeEvent(opts: { method: string, body?: unknown, id?: string }): H3Event {
  const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const res = { statusCode: 200 }
  const req = { headers: { 'content-type': 'application/json' }, method: opts.method }
  return {
    _requestBody: rawBody,
    node: { req, res },
    path: '/api/debts',
    method: opts.method,
    context: { params: opts.id ? { id: opts.id } : {} },
  } as unknown as H3Event
}

interface DebtOut {
  id: number
  creditor: string
  initialBalanceCents: number
  repaymentMode: string
  monthlyAmountCents: number | null
  lumpSumDate: string | null
  currentBalanceCents: number
}

function seedRepayment(debtId: number, absCents: number) {
  dbMod.db.insert(schema.transactions).values({
    statementHash: 'h', transactionDate: '2026-01-01', label: 'remb', amountCents: -absCents,
    categoryCode: 'remboursement_dette', isDebtRepayment: true, debtId,
  }).run()
}

describe('POST /api/debts — modes & validation croisée', () => {
  it('crée une dette mode free sans montants → 201, solde = initial', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 500_000, repaymentMode: 'free',
    } }))) as DebtOut
    expect(d.id).toBeGreaterThan(0)
    expect(d.currentBalanceCents).toBe(500_000)
    expect(d.monthlyAmountCents).toBeNull()
  })

  it('mode monthly avec mensualité → 201 ; sans → 422', async () => {
    const ok = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Banque', initialBalanceCents: 1_200_000, repaymentMode: 'monthly', monthlyAmountCents: 50_000,
    } }))) as DebtOut
    expect(ok.monthlyAmountCents).toBe(50_000)
    await expect(postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Banque', initialBalanceCents: 1_200_000, repaymentMode: 'monthly',
    } }))).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('mode lump_sum avec date → 201 ; sans → 422', async () => {
    const ok = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Ami', initialBalanceCents: 300_000, repaymentMode: 'lump_sum', lumpSumDate: '2026-12-01',
    } }))) as DebtOut
    expect(ok.lumpSumDate).toBe('2026-12-01')
    await expect(postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Ami', initialBalanceCents: 300_000, repaymentMode: 'lump_sum',
    } }))).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('mode monthly AVEC lumpSumDate en plus → 422 (champ interdit)', async () => {
    await expect(postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'X', initialBalanceCents: 100_000, repaymentMode: 'monthly',
      monthlyAmountCents: 10_000, lumpSumDate: '2026-12-01',
    } }))).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('mode monthly avec mensualité à 0 → 422 (strictement positive)', async () => {
    await expect(postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Banque', initialBalanceCents: 1_200_000, repaymentMode: 'monthly', monthlyAmountCents: 0,
    } }))).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('creditor vide → 422', async () => {
    await expect(postHandler(makeEvent({ method: 'POST', body: {
      creditor: '  ', initialBalanceCents: 100_000, repaymentMode: 'free',
    } }))).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })
})

describe('GET /api/debts — solde courant calculé', () => {
  it('solde = initial + Σavances', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 500_000, repaymentMode: 'free',
    } }))) as DebtOut
    await advanceHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 100_000, advanceDate: '2026-02-01' } }))
    await advanceHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 50_000, advanceDate: '2026-03-01' } }))

    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list[0]!.currentBalanceCents).toBe(650_000)
  })

  it('solde décrémenté par un remboursement — cas dette à zéro (NFR9)', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 200_000, repaymentMode: 'free',
    } }))) as DebtOut
    await advanceHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 100_000, advanceDate: '2026-02-01' } }))
    // Remboursement de 300 000 (sortie signée -300000) → solde 200000 + 100000 - 300000 = 0.
    seedRepayment(d.id, 300_000)

    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list[0]!.currentBalanceCents).toBe(0)
  })

  it('historique vide → solde = initial', async () => {
    await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 420_000, repaymentMode: 'free',
    } }))
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list[0]!.currentBalanceCents).toBe(420_000)
  })
})

describe('PUT /api/debts/[id] — changement de mode', () => {
  it('free → monthly valide', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Banque', initialBalanceCents: 900_000, repaymentMode: 'free',
    } }))) as DebtOut
    const updated = (await putHandler(makeEvent({ method: 'PUT', id: String(d.id), body: {
      creditor: 'Banque', initialBalanceCents: 900_000, repaymentMode: 'monthly', monthlyAmountCents: 30_000,
    } }))) as DebtOut
    expect(updated.repaymentMode).toBe('monthly')
    expect(updated.monthlyAmountCents).toBe(30_000)
  })

  it('free → monthly sans mensualité → 422', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Banque', initialBalanceCents: 900_000, repaymentMode: 'free',
    } }))) as DebtOut
    await expect(putHandler(makeEvent({ method: 'PUT', id: String(d.id), body: {
      creditor: 'Banque', initialBalanceCents: 900_000, repaymentMode: 'monthly',
    } }))).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('id inexistant → 404 ; id non entier → 422', async () => {
    await expect(putHandler(makeEvent({ method: 'PUT', id: '999', body: {
      creditor: 'X', initialBalanceCents: 1, repaymentMode: 'free',
    } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(putHandler(makeEvent({ method: 'PUT', id: 'abc', body: {
      creditor: 'X', initialBalanceCents: 1, repaymentMode: 'free',
    } }))).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('DELETE /api/debts/[id]', () => {
  it('supprime → cascade des avances', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 100_000, repaymentMode: 'free',
    } }))) as DebtOut
    await advanceHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 10_000, advanceDate: '2026-02-01' } }))

    await deleteHandler(makeEvent({ method: 'DELETE', id: String(d.id) }))
    expect(dbMod.db.select().from(schema.debts).all()).toHaveLength(0)
    expect(dbMod.db.select().from(schema.debtAdvances).all()).toHaveLength(0)
  })

  it('délie les transactions de remboursement rattachées (pas de référence pendante)', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 200_000, repaymentMode: 'free',
    } }))) as DebtOut
    seedRepayment(d.id, 50_000)

    await deleteHandler(makeEvent({ method: 'DELETE', id: String(d.id) }))

    const txs = dbMod.db.select().from(schema.transactions).all()
    expect(txs).toHaveLength(1) // la transaction survit
    expect(txs[0]!.debtId).toBeNull()
    expect(txs[0]!.isDebtRepayment).toBe(false)
  })

  it('id inexistant → 404', async () => {
    await expect(deleteHandler(makeEvent({ method: 'DELETE', id: '999' }))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('POST /api/debts/[id]/advances', () => {
  it('avance sur dette inexistante → 404', async () => {
    await expect(advanceHandler(makeEvent({ method: 'POST', id: '999', body: {
      amountCents: 10_000, advanceDate: '2026-02-01',
    } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('avance à 0 → 422', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 100_000, repaymentMode: 'free',
    } }))) as DebtOut
    await expect(advanceHandler(makeEvent({ method: 'POST', id: String(d.id), body: {
      amountCents: 0, advanceDate: '2026-02-01',
    } }))).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })
})

describe('GET /api/debts/[id]/impact', () => {
  it('mode monthly : dépense projetée = solde sur chaque horizon (déterministe)', async () => {
    // Solde 250 000, mensualité 100 000 → remboursé en 3 mois → total = 250 000 sur 6/12/24.
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Banque', initialBalanceCents: 250_000, repaymentMode: 'monthly', monthlyAmountCents: 100_000,
    } }))) as DebtOut
    const impact = (await impactHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as {
      debtId: number
      horizonsCents: Record<number, number>
    }
    expect(impact.debtId).toBe(d.id)
    expect(impact.horizonsCents[6]).toBe(250_000)
    expect(impact.horizonsCents[12]).toBe(250_000)
    expect(impact.horizonsCents[24]).toBe(250_000)
  })

  it('mode free : impact nul sur tous les horizons', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Ami', initialBalanceCents: 500_000, repaymentMode: 'free',
    } }))) as DebtOut
    const impact = (await impactHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as {
      horizonsCents: Record<number, number>
    }
    expect(impact.horizonsCents[6]).toBe(0)
    expect(impact.horizonsCents[24]).toBe(0)
  })

  it('dette inexistante → 404', async () => {
    await expect(impactHandler(makeEvent({ method: 'GET', id: '999' }))).rejects.toMatchObject({ statusCode: 404 })
  })
})
