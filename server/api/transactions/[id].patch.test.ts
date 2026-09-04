import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-tx-patch-api-'))
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
    CREATE INDEX transactions_period_idx ON transactions(transaction_date);
    CREATE INDEX transactions_statement_idx ON transactions(statement_hash);
    CREATE TABLE debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creditor TEXT NOT NULL,
      initial_balance_cents INTEGER NOT NULL,
      repayment_mode TEXT NOT NULL DEFAULT 'free',
      monthly_amount_cents INTEGER,
      lump_sum_date TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)

  dbMod.db.insert(schema.categoryDefinitions).values([
    { code: 'courses', label: 'Courses' },
    { code: 'restaurants', label: 'Restaurants' },
  ]).run()

  handler = (await import('./[id].patch')).default as Handler
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
  dbMod.db.delete(schema.debts).run()
})

/** Seede une dette et retourne son id. */
function seedDebt(): number {
  const r = dbMod.db.insert(schema.debts).values({
    creditor: 'Papa', initialBalanceCents: 500_000, repaymentMode: 'free',
  }).run()
  return Number(r.lastInsertRowid)
}

/** Seede une transaction ENTRANTE (montant positif) et retourne son id. */
function seedIncomingTransaction(): number {
  const r = dbMod.db.insert(schema.transactions).values({
    statementHash: HASH_A, transactionDate: '2026-04-15', label: 'Virement reçu',
    amountCents: 2500, categoryCode: 'courses',
  }).run()
  return Number(r.lastInsertRowid)
}

const HASH_A = 'a'.repeat(64)

function seedStatement(hash = HASH_A) {
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: hash,
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    openingBalanceCents: 100_000,
    closingBalanceCents: 50_000,
    reliability: 'reliable',
  }).run()
}

function seedTransaction(): number {
  const result = dbMod.db.insert(schema.transactions).values({
    statementHash: HASH_A,
    transactionDate: '2026-04-15',
    label: 'Carrefour',
    amountCents: -2500,
    categoryCode: 'courses',
  }).run()
  return Number(result.lastInsertRowid)
}

function makeEvent(id: string, body: unknown): H3Event {
  const rawBody = body === undefined ? '' : JSON.stringify(body)
  const req = { headers: { 'content-type': 'application/json' }, method: 'PATCH' }
  return {
    _requestBody: rawBody,
    node: { req, res: {} },
    path: `/api/transactions/${id}`,
    method: 'PATCH',
    context: { params: { id } },
  } as unknown as H3Event
}

describe('PATCH /api/transactions/[id]', () => {
  it('updates categoryCode and flips is_manual to true', async () => {
    seedStatement()
    const id = seedTransaction()

    const result = (await handler(makeEvent(String(id), { categoryCode: 'restaurants' }))) as {
      id: number
      categoryCode: string
      isManual: boolean
      isDebtRepayment: boolean
      debtId: number | null
    }

    expect(result.id).toBe(id)
    expect(result.categoryCode).toBe('restaurants')
    expect(result.isManual).toBe(true)
    expect(result.isDebtRepayment).toBe(false)
    expect(result.debtId).toBeNull()
  })

  it('marks an outgoing transaction as repayment of an existing debt (Story 6.3)', async () => {
    seedStatement()
    const debtId = seedDebt()
    const id = seedTransaction() // -2500 (sortante)

    const result = (await handler(makeEvent(String(id), { isDebtRepayment: true, debtId }))) as {
      isDebtRepayment: boolean
      debtId: number | null
      isManual: boolean
    }

    expect(result.isDebtRepayment).toBe(true)
    expect(result.debtId).toBe(debtId)
    // Contrat CHANGÉ par la story 6.8 : `isManual` signifie « catégorie saisie ou CORRIGÉE à la
    // main ». Rattacher une transaction à une dette ne touche pas sa catégorisation, donc ne
    // doit plus lever ce flag (revue du 2026-09-04).
    expect(result.isManual).toBe(false)
  })

  it('sets isManual only when the patch touches the category (Story 6.8)', async () => {
    seedStatement()
    const id = seedTransaction()
    const result = (await handler(makeEvent(String(id), { categoryCode: 'restaurants' }))) as {
      categoryCode: string
      isManual: boolean
    }
    expect(result.categoryCode).toBe('restaurants')
    expect(result.isManual).toBe(true)
  })

  it('rejects marking against a non-existent debt → 422', async () => {
    seedStatement()
    const id = seedTransaction()
    await expect(
      handler(makeEvent(String(id), { isDebtRepayment: true, debtId: 999 })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  // Contrat CHANGÉ par la story 6.5 (D16) : une transaction ENTRANTE peut être rattachée à une
  // dette — c'est la condition d'un compte-courant conjoint, où un règlement reçu diminue le
  // solde (FR66/FR67). La garde précédente refusait tout `amountCents >= 0`, ce qui rendait ce
  // cas structurellement impossible. FR9 reste vrai pour ce qu'il dit : seule une SORTIE est un
  // « remboursement » ; une entrée rattachée est un mouvement de sens inverse.
  it('accepts attaching an incoming (positive) transaction to a debt (D16)', async () => {
    seedStatement()
    const debtId = seedDebt()
    const id = seedIncomingTransaction()
    const updated = (await handler(makeEvent(String(id), { isDebtRepayment: true, debtId }))) as {
      isDebtRepayment: boolean
      debtId: number | null
    }
    expect(updated.isDebtRepayment).toBe(true)
    expect(updated.debtId).toBe(debtId)
  })

  it('rejects attaching a zero-amount transaction to a debt → 422', async () => {
    seedStatement()
    const debtId = seedDebt()
    const r = dbMod.db.insert(schema.transactions).values({
      statementHash: HASH_A, transactionDate: '2026-04-15', label: 'Écriture nulle',
      amountCents: 0, categoryCode: 'courses',
    }).run()
    await expect(
      handler(makeEvent(String(Number(r.lastInsertRowid)), { isDebtRepayment: true, debtId })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects isDebtRepayment:true without a debtId → 422', async () => {
    seedStatement()
    const id = seedTransaction()
    await expect(
      handler(makeEvent(String(id), { isDebtRepayment: true })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('rejects a debtId without isDebtRepayment:true → 422 (schéma resserré)', async () => {
    seedStatement()
    const debtId = seedDebt()
    const id = seedTransaction()
    await expect(
      handler(makeEvent(String(id), { debtId })),
    ).rejects.toMatchObject({ statusCode: 422, statusMessage: ApiErrorCode.ValidationFailed })
  })

  it('unmarking clears is_debt_repayment AND debt_id', async () => {
    seedStatement()
    const debtId = seedDebt()
    const id = seedTransaction()
    await handler(makeEvent(String(id), { isDebtRepayment: true, debtId }))

    const result = (await handler(makeEvent(String(id), { isDebtRepayment: false }))) as {
      isDebtRepayment: boolean
      debtId: number | null
    }
    expect(result.isDebtRepayment).toBe(false)
    expect(result.debtId).toBeNull()
  })

  it('category-only patch leaves debt columns untouched', async () => {
    seedStatement()
    const debtId = seedDebt()
    const id = seedTransaction()
    await handler(makeEvent(String(id), { isDebtRepayment: true, debtId }))

    const result = (await handler(makeEvent(String(id), { categoryCode: 'restaurants' }))) as {
      categoryCode: string
      isDebtRepayment: boolean
      debtId: number | null
    }
    expect(result.categoryCode).toBe('restaurants')
    expect(result.isDebtRepayment).toBe(true)
    expect(result.debtId).toBe(debtId)
  })

  it('returns 404 not_found for unknown id', async () => {
    seedStatement()
    seedTransaction()

    await expect(
      handler(makeEvent('999999', { categoryCode: 'restaurants' })),
    ).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: ApiErrorCode.NotFound,
    })
  })

  it('returns 422 validation_failed for unknown categoryCode (FK pre-check)', async () => {
    seedStatement()
    const id = seedTransaction()

    await expect(
      handler(makeEvent(String(id), { categoryCode: 'this-does-not-exist' })),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })

    const rows = dbMod.db.select().from(schema.transactions).all()
    const row = rows.find(r => r.id === id)!
    expect(row.categoryCode).toBe('courses')
    expect(row.isManual).toBe(false)
  })

  it('returns 422 validation_failed when body is empty (refine: at least one field required)', async () => {
    seedStatement()
    const id = seedTransaction()

    await expect(
      handler(makeEvent(String(id), {})),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })

  it('returns 422 validation_failed for non-numeric id', async () => {
    await expect(
      handler(makeEvent('abc', { categoryCode: 'restaurants' })),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })
})
