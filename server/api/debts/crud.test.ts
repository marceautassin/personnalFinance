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
let eventPostHandler: Handler
let eventGetHandler: Handler
let eventDeleteHandler: Handler
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
      debt_id INTEGER REFERENCES debts(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      -- Story 6.7 : les deux colonnes encodent le même fait, la base rend l'incohérence impossible.
      CONSTRAINT transactions_debt_coherence_check CHECK ((debt_id IS NULL) = (is_debt_repayment = 0))
    );
    PRAGMA foreign_keys = ON;
  `)

  getHandler = (await import('./index.get')).default as Handler
  postHandler = (await import('./index.post')).default as Handler
  putHandler = (await import('./[id].put')).default as Handler
  deleteHandler = (await import('./[id].delete')).default as Handler
  eventPostHandler = (await import('./[id]/events.post')).default as Handler
  eventGetHandler = (await import('./[id]/events.get')).default as Handler
  eventDeleteHandler = (await import('./[id]/events/[event-id].delete')).default as Handler
  impactHandler = (await import('./[id]/impact.get')).default as Handler
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

function makeEvent(opts: { method: string, body?: unknown, id?: string, eventId?: string }): H3Event {
  const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const res = { statusCode: 200 }
  const req = { headers: { 'content-type': 'application/json' }, method: opts.method }
  const params: Record<string, string> = {}
  if (opts.id) params.id = opts.id
  if (opts.eventId) params['event-id'] = opts.eventId
  return {
    _requestBody: rawBody,
    node: { req, res },
    path: '/api/debts',
    method: opts.method,
    context: { params },
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
  linkedTransactionCount: number
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
  it('solde = initial + Σévénements signés', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 500_000, repaymentMode: 'free',
    } }))) as DebtOut
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 100_000, eventDate: '2026-02-01' } }))
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 50_000, eventDate: '2026-03-01' } }))

    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list[0]!.currentBalanceCents).toBe(650_000)
  })

  it('solde décrémenté par un remboursement — cas dette à zéro (NFR9)', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 200_000, repaymentMode: 'free',
    } }))) as DebtOut
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 100_000, eventDate: '2026-02-01' } }))
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
  it('supprime → cascade des événements', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 100_000, repaymentMode: 'free',
    } }))) as DebtOut
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 10_000, eventDate: '2026-02-01' } }))

    await deleteHandler(makeEvent({ method: 'DELETE', id: String(d.id) }))
    expect(dbMod.db.select().from(schema.debts).all()).toHaveLength(0)
    expect(dbMod.db.select().from(schema.debtEvents).all()).toHaveLength(0)
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

  // Story 6.7 : l'UI doit pouvoir CHIFFRER l'avertissement avant suppression.
  it('GET expose linkedTransactionCount pour avertir avant suppression', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 200_000, repaymentMode: 'free',
    } }))) as DebtOut
    seedRepayment(d.id, 10_000)
    seedRepayment(d.id, 20_000)

    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list.find(x => x.id === d.id)!.linkedTransactionCount).toBe(2)
  })

  it('dette sans transaction rattachée : linkedTransactionCount = 0', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Ami', initialBalanceCents: 1_000, repaymentMode: 'free',
    } }))) as DebtOut
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list.find(x => x.id === d.id)!.linkedTransactionCount).toBe(0)
  })

  /**
   * Story 6.7 : la contrainte `transactions_debt_coherence_check` rend IMPOSSIBLE l'état
   * `debt_id` sans flag — celui que produisait le PATCH antérieur à la story 6.3 et qui
   * faisait disparaître silencieusement la ligne du calcul de solde.
   */
  it('la base refuse une transaction avec debt_id sans is_debt_repayment', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Papa', initialBalanceCents: 100_000, repaymentMode: 'free',
    } }))) as DebtOut
    expect(() => {
      dbMod.db.insert(schema.transactions).values({
        statementHash: 'h', transactionDate: '2026-01-01', label: 'incohérente',
        amountCents: -1_000, categoryCode: 'remboursement_dette',
        isDebtRepayment: false, debtId: d.id,
      }).run()
    }).toThrow()
  })

  it('la base refuse le flag sans debt_id', async () => {
    expect(() => {
      dbMod.db.insert(schema.transactions).values({
        statementHash: 'h', transactionDate: '2026-01-01', label: 'incohérente',
        amountCents: -1_000, categoryCode: 'remboursement_dette',
        isDebtRepayment: true, debtId: null,
      }).run()
    }).toThrow()
  })
})

describe('Ledger d\'événements signés (story 6.5, D16)', () => {
  async function makeDebt(initialBalanceCents: number): Promise<DebtOut> {
    return (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Conjointe', initialBalanceCents, repaymentMode: 'free',
    } }))) as DebtOut
  }

  it('événement sur dette inexistante → 404', async () => {
    await expect(eventPostHandler(makeEvent({ method: 'POST', id: '999', body: {
      amountCents: 10_000, eventDate: '2026-02-01',
    } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('événement à 0 → 422 (ni avance ni règlement)', async () => {
    const d = await makeDebt(100_000)
    await expect(eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: {
      amountCents: 0, eventDate: '2026-02-01',
    } }))).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('événement POSITIF augmente le solde dû', async () => {
    const d = await makeDebt(100_000)
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 25_000, eventDate: '2026-02-01' } }))
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list.find(x => x.id === d.id)!.currentBalanceCents).toBe(125_000)
  })

  it('événement NÉGATIF diminue le solde dû', async () => {
    const d = await makeDebt(100_000)
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: -30_000, eventDate: '2026-02-01' } }))
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list.find(x => x.id === d.id)!.currentBalanceCents).toBe(70_000)
  })

  // Le cœur de D16 : c'est ce cas qui était STRUCTURELLEMENT impossible avant la story 6.5 et
  // qui rend FR68 (« solde net créance/dette ») satisfaisable.
  it('le solde peut devenir NÉGATIF — une créance', async () => {
    const d = await makeDebt(50_000)
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: -80_000, eventDate: '2026-02-01' } }))
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list.find(x => x.id === d.id)!.currentBalanceCents).toBe(-30_000)
  })

  /**
   * BLOQUANT de la revue du 2026-09-04 : la story 6.5 avait levé la garde à l'ÉCRITURE
   * (transaction entrante rattachable) sans corriger l'ARITHMÉTIQUE du solde, qui sommait
   * `abs()` et soustrayait. Un encaissement creusait la créance au lieu de la résorber.
   * Aucun test ne seedait de transaction rattachée à montant positif — d'où 468 tests au vert
   * sur un solde faux. Ce cas ferme le trou au niveau endpoint.
   */
  it('encaissement rattaché : le solde se rapproche de zéro (FR66-FR68)', async () => {
    const d = await makeDebt(-50_000)
    dbMod.db.insert(schema.transactions).values({
      statementHash: 'h', transactionDate: '2026-02-10', label: 'virement reçu',
      amountCents: 20_000, categoryCode: 'remboursement_dette', isDebtRepayment: true, debtId: d.id,
    }).run()
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list.find(x => x.id === d.id)!.currentBalanceCents).toBe(-30_000)
  })

  it('accepte un initialBalanceCents NÉGATIF (créance initiale)', async () => {
    const d = await makeDebt(-40_000)
    expect(d.initialBalanceCents).toBe(-40_000)
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list.find(x => x.id === d.id)!.currentBalanceCents).toBe(-40_000)
  })

  it('kind déduit du signe quand il n\'est pas fourni', async () => {
    const d = await makeDebt(100_000)
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 5_000, eventDate: '2026-02-01' } }))
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: -5_000, eventDate: '2026-02-02' } }))
    const events = (await eventGetHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as { kind: string }[]
    expect(events.map(e => e.kind)).toEqual(['advance', 'settlement'])
  })

  it('GET liste les événements triés par date', async () => {
    const d = await makeDebt(0)
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 1_000, eventDate: '2026-03-01' } }))
    await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: { amountCents: 2_000, eventDate: '2026-01-01' } }))
    const events = (await eventGetHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as { eventDate: string }[]
    expect(events.map(e => e.eventDate)).toEqual(['2026-01-01', '2026-03-01'])
  })

  // Une saisie erronée devait pouvoir être corrigée autrement qu'en tordant initialBalanceCents.
  it('DELETE retire un événement et le solde est recalculé', async () => {
    const d = await makeDebt(100_000)
    const created = (await eventPostHandler(makeEvent({ method: 'POST', id: String(d.id), body: {
      amountCents: 250_000, eventDate: '2026-02-01',
    } }))) as { id: number }
    await eventDeleteHandler(makeEvent({ method: 'DELETE', id: String(d.id), eventId: String(created.id) }))
    const list = (await getHandler(makeEvent({ method: 'GET' }))) as DebtOut[]
    expect(list.find(x => x.id === d.id)!.currentBalanceCents).toBe(100_000)
  })

  it('DELETE d\'un eventId inexistant → 404', async () => {
    const d = await makeDebt(100_000)
    await expect(
      eventDeleteHandler(makeEvent({ method: 'DELETE', id: String(d.id), eventId: '999' })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  // On ne supprime pas l'événement d'une AUTRE dette avec un identifiant deviné.
  it('DELETE refuse un événement appartenant à une autre dette → 404', async () => {
    const a = await makeDebt(10_000)
    const b = await makeDebt(20_000)
    const ev = (await eventPostHandler(makeEvent({ method: 'POST', id: String(a.id), body: {
      amountCents: 5_000, eventDate: '2026-02-01',
    } }))) as { id: number }
    await expect(
      eventDeleteHandler(makeEvent({ method: 'DELETE', id: String(b.id), eventId: String(ev.id) })),
    ).rejects.toMatchObject({ statusCode: 404 })
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

  /**
   * Biais 1 (story 6.6) : la projection partait du mois courant ET du solde courant, donc une
   * mensualité déjà réglée ce mois-ci était recomptée.
   *
   *   solde initial 300 000, mensualité 100 000, 100 000 déjà réglés CE MOIS
   *   → solde courant 200 000, série brute [100 000, 100 000] = 200 000
   *   → mais 100 000 sont déjà sortis : il ne reste que 100 000 à sortir sur le mois courant + 1.
   *
   * On déduit du mois 0 ce qui a déjà été réglé → mois 0 à 0, total horizon 6 = 200 000
   * (les 2 mensualités restantes), et non 300 000.
   */
  function seedRepaymentInMonth(debtId: number, absCents: number, month: string) {
    dbMod.db.insert(schema.transactions).values({
      statementHash: 'h', transactionDate: `${month}-05`, label: 'remb', amountCents: -absCents,
      categoryCode: 'remboursement_dette', isDebtRepayment: true, debtId,
    }).run()
  }

  function thisMonth(): string {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  }

  it('ne recompte pas la mensualité déjà réglée ce mois-ci', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Banque', initialBalanceCents: 300_000, repaymentMode: 'monthly', monthlyAmountCents: 100_000,
    } }))) as DebtOut
    seedRepaymentInMonth(d.id, 100_000, thisMonth())

    const impact = (await impactHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as {
      horizonsCents: Record<number, number>
    }
    // Solde courant = 200 000 ; le mois 0 est neutralisé → 200 000 restent à sortir.
    expect(impact.horizonsCents[6]).toBe(200_000)
  })

  it('mensualité NON réglée ce mois-ci : aucun changement (non-régression)', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Banque', initialBalanceCents: 300_000, repaymentMode: 'monthly', monthlyAmountCents: 100_000,
    } }))) as DebtOut
    const impact = (await impactHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as {
      horizonsCents: Record<number, number>
    }
    expect(impact.horizonsCents[6]).toBe(300_000)
  })

  it('paiement PARTIEL du mois : seul le reliquat du mois courant est projeté', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Banque', initialBalanceCents: 300_000, repaymentMode: 'monthly', monthlyAmountCents: 100_000,
    } }))) as DebtOut
    seedRepaymentInMonth(d.id, 40_000, thisMonth())

    const impact = (await impactHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as {
      horizonsCents: Record<number, number>
    }
    // Solde courant 260 000 ; mois 0 plafonné au reliquat (100 000 − 40 000 = 60 000), le reste
    // suit les mois suivants → le solde ENTIER reste projeté, il sort simplement plus tard.
    expect(impact.horizonsCents[6]).toBe(260_000)
  })

  /**
   * Story 6.8 : `lump_sum` est le SEUL mode dont le résultat dépend du mois courant serveur,
   * donc le seul fragile — et il n'était couvert qu'au niveau du service pur, jamais au niveau
   * endpoint (revue du 2026-09-04). On ancre les dates sur le mois courant réel pour que le
   * test reste vrai quel que soit le jour où il tourne.
   */
  function monthOffsetFromNow(n: number): string {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  it('mode lump_sum : échéance DANS l\'horizon 6 mais hors horizon plus court', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Notaire', initialBalanceCents: 400_000, repaymentMode: 'lump_sum',
      lumpSumDate: `${monthOffsetFromNow(4)}-15`,
    } }))) as DebtOut
    const impact = (await impactHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as {
      horizonsCents: Record<number, number>
    }
    expect(impact.horizonsCents[6]).toBe(400_000)
    expect(impact.horizonsCents[24]).toBe(400_000)
  })

  it('mode lump_sum : échéance au-delà de 24 mois → impact nul', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Notaire', initialBalanceCents: 400_000, repaymentMode: 'lump_sum',
      lumpSumDate: `${monthOffsetFromNow(30)}-15`,
    } }))) as DebtOut
    const impact = (await impactHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as {
      horizonsCents: Record<number, number>
    }
    expect(impact.horizonsCents[24]).toBe(0)
  })

  /** Comportement réel de `debt-projection.ts:69-72`, désormais décrit par l'AC#4 amendée. */
  it('mode lump_sum : échéance PASSÉE encore due → imputée au mois courant', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Notaire', initialBalanceCents: 400_000, repaymentMode: 'lump_sum',
      lumpSumDate: `${monthOffsetFromNow(-6)}-15`,
    } }))) as DebtOut
    const impact = (await impactHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as {
      horizonsCents: Record<number, number>
    }
    expect(impact.horizonsCents[6]).toBe(400_000)
  })

  /**
   * Corollaire du bloquant : un encaissement rattaché n'est PAS un remboursement, il ne doit
   * donc pas neutraliser la mensualité projetée du mois courant (revue du 2026-09-04).
   */
  it('un encaissement du mois ne neutralise pas la mensualité projetée', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Banque', initialBalanceCents: 300_000, repaymentMode: 'monthly', monthlyAmountCents: 100_000,
    } }))) as DebtOut
    dbMod.db.insert(schema.transactions).values({
      statementHash: 'h', transactionDate: `${monthOffsetFromNow(0)}-05`, label: 'virement reçu',
      amountCents: 50_000, categoryCode: 'remboursement_dette', isDebtRepayment: true, debtId: d.id,
    }).run()
    const impact = (await impactHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as {
      horizonsCents: Record<number, number>
    }
    // Solde 350 000 (l'encaissement AUGMENTE le dû) ; le mois 0 reste plein.
    expect(impact.horizonsCents[6]).toBe(350_000)
  })

  it('mode free : le déjà-réglé ne crée pas d\'impact négatif', async () => {
    const d = (await postHandler(makeEvent({ method: 'POST', body: {
      creditor: 'Ami', initialBalanceCents: 100_000, repaymentMode: 'free',
    } }))) as DebtOut
    seedRepaymentInMonth(d.id, 50_000, thisMonth())
    const impact = (await impactHandler(makeEvent({ method: 'GET', id: String(d.id) }))) as {
      horizonsCents: Record<number, number>
    }
    expect(impact.horizonsCents[6]).toBe(0)
  })
})
