import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

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
  sqlite.exec(TEST_SCHEMA_DDL)
  sqlite.exec(TEST_REFERENTIAL_DDL)

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
})

const HASH_A = 'a'.repeat(64)

function seedStatement(hash = HASH_A) {
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: hash,
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    openingBalanceCents: 100_000,
    closingBalanceCents: 50_000,
    gapAccepted: false,
  }).run()
}

function seedTransaction(): number {
  const result = dbMod.db.insert(schema.transactions).values({
    statementHash: HASH_A,
    transactionDate: '2026-04-15',
    label: 'Carrefour',
    amountCents: -2500,
    categoryItemCode: 'alimentation-courses',
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
  it('updates categoryItemCode and flips is_manual to true', async () => {
    seedStatement()
    const id = seedTransaction()

    const result = (await handler(makeEvent(String(id), { categoryItemCode: 'alimentation-restaurant' }))) as {
      id: number
      categoryItemCode: string
      isManual: boolean
    }

    expect(result.id).toBe(id)
    expect(result.categoryItemCode).toBe('alimentation-restaurant')
    expect(result.isManual).toBe(true)
  })

  it('sets isManual only when the patch touches the category (Story 6.8)', async () => {
    seedStatement()
    const id = seedTransaction()
    const result = (await handler(makeEvent(String(id), { categoryItemCode: 'alimentation-restaurant' }))) as {
      categoryItemCode: string
      isManual: boolean
    }
    expect(result.categoryItemCode).toBe('alimentation-restaurant')
    expect(result.isManual).toBe(true)
  })

  // Contrat CHANGÉ par la story 6.5 (D16) : une transaction ENTRANTE peut être rattachée à une
  // dette — c'est la condition d'un compte-courant conjoint, où un règlement reçu diminue le
  // solde (FR66/FR67). La garde précédente refusait tout `amountCents >= 0`, ce qui rendait ce
  // cas structurellement impossible. FR9 reste vrai pour ce qu'il dit : seule une SORTIE est un
  // « remboursement » ; une entrée rattachée est un mouvement de sens inverse.

  it('returns 404 not_found for unknown id', async () => {
    seedStatement()
    seedTransaction()

    await expect(
      handler(makeEvent('999999', { categoryItemCode: 'alimentation-restaurant' })),
    ).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: ApiErrorCode.NotFound,
    })
  })

  it('returns 422 validation_failed for unknown categoryItemCode (FK pre-check)', async () => {
    seedStatement()
    const id = seedTransaction()

    await expect(
      handler(makeEvent(String(id), { categoryItemCode: 'this-does-not-exist' })),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })

    const rows = dbMod.db.select().from(schema.transactions).all()
    const row = rows.find(r => r.id === id)!
    expect(row.categoryItemCode).toBe('alimentation-courses')
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
      handler(makeEvent('abc', { categoryItemCode: 'alimentation-restaurant' })),
    ).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })
})
