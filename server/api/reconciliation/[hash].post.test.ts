import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-reconc-api-'))
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

  handler = (await import('./[hash].post')).default as Handler
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

const HASH_A = 'a'.repeat(64)

function seedStatementWithGap(opts: {
  opening: number
  closing: number
  txAmounts: number[]
  gapAccepted?: boolean
}) {
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: HASH_A,
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    openingBalanceCents: opts.opening,
    closingBalanceCents: opts.closing,
    gapAccepted: opts.gapAccepted ?? false,
  }).run()
  if (opts.txAmounts.length > 0) {
    dbMod.db.insert(schema.transactions).values(
      opts.txAmounts.map((a, i) => ({
        statementHash: HASH_A,
        transactionDate: `2026-04-${String(10 + i).padStart(2, '0')}`,
        label: `Tx${i}`,
        amountCents: a,
        categoryItemCode: 'alimentation-courses',
      })),
    ).run()
  }
}

function makeEvent(hash: string, body: unknown): H3Event {
  const rawBody = body === undefined ? '' : JSON.stringify(body)
  const req = { headers: { 'content-type': 'application/json' }, method: 'POST' }
  return {
    _requestBody: rawBody,
    node: { req, res: {} },
    path: `/api/reconciliation/${hash}`,
    method: 'POST',
    context: { params: { hash } },
  } as unknown as H3Event
}

describe('POST /api/reconciliation/[hash]', () => {
  describe('add_transaction', () => {
    it('balances a positive gap by adding the right transaction (gap +200 → tx -200)', async () => {
      // closing - opening = -200, sum = 0, gap = -200 - 0 = -200 ; mais on veut illustrer
      // un cas où une dépense manquante équilibre. Ici opening 1000, closing 800, sum 0
      // → gap = -200 - 0 = -200. Pour équilibrer il faut amountCents = -200.
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [] })

      const result = (await handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-04-15',
          label: 'Carrefour',
          amountCents: -20_000,
          categoryItemCode: 'alimentation-courses',
        },
      }))) as { isBalanced: boolean, gapCents: number, reliability: string }

      expect(result.isBalanced).toBe(true)
      expect(result.gapCents).toBe(0)
      expect(result.reliability).toBe('reliable')

      const rows = dbMod.db.select().from(schema.transactions).all()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.isManual).toBe(true)
      expect(rows[0]!.amountCents).toBe(-20_000)
    })

    it('balances a negative gap by adding the right credit (sum surplus → add positive)', async () => {
      // opening 100_000, closing 100_000, sum -150 → gap = 0 - (-150) = +150
      // Pour équilibrer, il faut amountCents = +150 (un revenu manquant)
      seedStatementWithGap({ opening: 100_000, closing: 100_000, txAmounts: [-150] })

      const result = (await handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-04-15',
          label: 'Remboursement',
          amountCents: 150,
          categoryItemCode: 'alimentation-courses',
        },
      }))) as { isBalanced: boolean, gapCents: number }

      expect(result.isBalanced).toBe(true)
      expect(result.gapCents).toBe(0)
    })

    it('reduces gap without balancing it', async () => {
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [] })

      const result = (await handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-04-15',
          label: 'Partial',
          amountCents: -10_000,
          categoryItemCode: 'alimentation-courses',
        },
      }))) as { isBalanced: boolean, gapCents: number, reliability: string }

      expect(result.isBalanced).toBe(false)
      // gap = (80_000 - 100_000) - (-10_000) = -20_000 + 10_000 = -10_000
      expect(result.gapCents).toBe(-10_000)
      expect(result.reliability).toBe('gap_unreviewed')
    })

    /**
     * Accepter un écart insère une transaction d'équilibrage : l'écart courant retombe donc
     * à zéro immédiatement. C'est la DÉCISION, et non l'écart, qui maintient le relevé
     * signalé — sans quoi le trou assumé disparaîtrait de l'écran.
     */
    it('garde l\'état « écart accepté » quand un ajout referme l\'écart', async () => {
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [], gapAccepted: true })

      const result = (await handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-04-15',
          label: 'Tx',
          amountCents: -20_000,
          categoryItemCode: 'alimentation-courses',
        },
      }))) as { reliability: string }

      expect(result.reliability).toBe('gap_accepted')
    })

    it('rejects unknown categoryItemCode with 422 and writes nothing', async () => {
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [] })

      await expect(handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-04-15',
          label: 'Tx',
          amountCents: -20_000,
          categoryItemCode: 'nope',
        },
      }))).rejects.toMatchObject({
        statusCode: 422,
        statusMessage: ApiErrorCode.ValidationFailed,
      })

      const rows = dbMod.db.select().from(schema.transactions).all()
      expect(rows).toHaveLength(0)
    })
  })

  describe('accept_gap', () => {
    it('insère une transaction de repli du montant de l\'écart et pose la décision', async () => {
      // opening 100_000, closing 80_000, sum = -19_990 → gap = -20_000 - (-19_990) = -10
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [-19_990] })

      const result = (await handler(makeEvent(HASH_A, { action: 'accept_gap' }))) as {
        isBalanced: boolean
        gapCents: number
        reliability: string
      }

      expect(result.isBalanced).toBe(true)
      expect(result.gapCents).toBe(0)
      expect(result.reliability).toBe('gap_accepted')

      const rows = dbMod.db.select().from(schema.transactions).all()
      expect(rows).toHaveLength(2)
      const accepted = rows.find(r => r.label === 'Écart accepté (réconciliation)')!
      expect(accepted.amountCents).toBe(-10)
      expect(accepted.categoryItemCode).toBe('divers-non-categorise')
      expect(accepted.isManual).toBe(true)
      expect(accepted.transactionDate).toBe('2026-04-30')

      const stmt = dbMod.db.select().from(schema.bankStatements).all()
      expect(stmt[0]!.gapAccepted).toBe(true)
    })

    it('returns 400 reconciliation_failed when statement is already balanced', async () => {
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [-20_000] })

      await expect(handler(makeEvent(HASH_A, { action: 'accept_gap' }))).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: ApiErrorCode.ReconciliationFailed,
      })

      const rows = dbMod.db.select().from(schema.transactions).all()
      expect(rows).toHaveLength(1)
      const stmt = dbMod.db.select().from(schema.bankStatements).all()
      expect(stmt[0]!.gapAccepted).toBe(false)
    })

    it('refuses accept_gap on an already-unreliable statement (one-shot remediation)', async () => {
      // Une seconde acceptation après un add_transaction qui re-déséquilibre serait sinon possible.
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [-19_990], gapAccepted: true })

      await expect(handler(makeEvent(HASH_A, { action: 'accept_gap' }))).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: ApiErrorCode.ReconciliationFailed,
      })

      const rows = dbMod.db.select().from(schema.transactions).all()
      expect(rows).toHaveLength(1) // pas de "Écart accepté" inséré
    })
  })

  describe('add_transaction — date bounds', () => {
    it('rejects transactionDate before period start', async () => {
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [] })

      await expect(handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-03-31', // hors période 2026-04-01..2026-04-30
          label: 'Tx',
          amountCents: -20_000,
          categoryItemCode: 'alimentation-courses',
        },
      }))).rejects.toMatchObject({
        statusCode: 422,
        statusMessage: ApiErrorCode.ValidationFailed,
      })

      const rows = dbMod.db.select().from(schema.transactions).all()
      expect(rows).toHaveLength(0)
    })

    it('rejects transactionDate after period end', async () => {
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [] })

      await expect(handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-05-01',
          label: 'Tx',
          amountCents: -20_000,
          categoryItemCode: 'alimentation-courses',
        },
      }))).rejects.toMatchObject({
        statusCode: 422,
        statusMessage: ApiErrorCode.ValidationFailed,
      })
    })

    it('accepts transactionDate exactly on periodStart and periodEnd', async () => {
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [] })

      const r1 = (await handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-04-01',
          label: 'Tx',
          amountCents: -10_000,
          categoryItemCode: 'alimentation-courses',
        },
      }))) as { isBalanced: boolean }
      expect(r1.isBalanced).toBe(false)

      const r2 = (await handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-04-30',
          label: 'Tx',
          amountCents: -10_000,
          categoryItemCode: 'alimentation-courses',
        },
      }))) as { isBalanced: boolean }
      expect(r2.isBalanced).toBe(true)
    })
  })

  describe('add_transaction — schema validation', () => {
    it('rejects amountCents = 0', async () => {
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [] })

      await expect(handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-04-15',
          label: 'Tx',
          amountCents: 0,
          categoryItemCode: 'alimentation-courses',
        },
      }))).rejects.toMatchObject({
        statusCode: 422,
        statusMessage: ApiErrorCode.ValidationFailed,
      })
    })
  })

  describe('error handling', () => {
    it('returns 404 not_found for unknown hash', async () => {
      await expect(handler(makeEvent(HASH_A, { action: 'accept_gap' }))).rejects.toMatchObject({
        statusCode: 404,
        statusMessage: ApiErrorCode.NotFound,
      })
    })

    it('returns 422 validation_failed for invalid hash format', async () => {
      await expect(handler(makeEvent('not-hash', { action: 'accept_gap' }))).rejects.toMatchObject({
        statusCode: 422,
        statusMessage: ApiErrorCode.ValidationFailed,
      })
    })

    it('returns 422 validation_failed when body action is missing', async () => {
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [] })

      await expect(handler(makeEvent(HASH_A, {}))).rejects.toMatchObject({
        statusCode: 422,
        statusMessage: ApiErrorCode.ValidationFailed,
      })
    })

    it('returns 422 validation_failed when add_transaction body is malformed', async () => {
      seedStatementWithGap({ opening: 100_000, closing: 80_000, txAmounts: [] })

      await expect(handler(makeEvent(HASH_A, {
        action: 'add_transaction',
        transaction: {
          transactionDate: '2026-02-30', // date inexistante
          label: 'Tx',
          amountCents: -1000,
          categoryItemCode: 'alimentation-courses',
        },
      }))).rejects.toMatchObject({
        statusCode: 422,
        statusMessage: ApiErrorCode.ValidationFailed,
      })
    })
  })
})
