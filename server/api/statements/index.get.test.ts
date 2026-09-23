import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-stmt-list-api-'))
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

  handler = (await import('./index.get')).default as Handler
})

/** Résout un code de poste vers son id, dans le profil de test (story 27.1, D37). */
function itemId(code: string): number {
  return (sqlite.prepare('SELECT id FROM category_items WHERE code = ? AND profile_id = 1').get(code) as { id: number }).id
}

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
const HASH_B = 'b'.repeat(64)

function makeEvent(): H3Event {
  return { path: '/api/statements', method: 'GET', node: { req: { headers: {} }, res: {} } } as unknown as H3Event
}

describe('GET /api/statements', () => {
  it('returns an empty list when no statements exist', async () => {
    const result = (await handler(makeEvent())) as { statements: unknown[] }
    expect(result.statements).toEqual([])
  })

  it('returns one statement with its transaction count and reliability', async () => {
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: HASH_A,
      profileId: 1,
      bank: 'boursorama',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      openingBalanceCents: 100_000,
      closingBalanceCents: 80_000,
      gapAccepted: false,
    }).run()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-15', label: 'A', amountCents: -10_000, categoryItemId: itemId('alimentation-courses') },
      { statementHash: HASH_A, transactionDate: '2026-04-20', label: 'B', amountCents: -10_000, categoryItemId: itemId('alimentation-courses') },
    ]).run()

    const result = (await handler(makeEvent())) as {
      statements: Array<{ hash: string, periodStart: string, reliability: string, transactionCount: number }>
    }
    expect(result.statements).toHaveLength(1)
    expect(result.statements[0]!.hash).toBe(HASH_A)
    expect(result.statements[0]!.reliability).toBe('reliable')
    expect(Number(result.statements[0]!.transactionCount)).toBe(2)
  })

  it('trie par periodStart DESC et expose la fiabilité dérivée', async () => {
    dbMod.db.insert(schema.bankStatements).values([
      {
        hashSha256: HASH_A,
        profileId: 1,
        bank: 'boursorama',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        openingBalanceCents: 0,
        closingBalanceCents: 0,
        gapAccepted: false,
      },
      {
        hashSha256: HASH_B,
        profileId: 1,
        bank: 'boursorama',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        openingBalanceCents: 0,
        closingBalanceCents: 0,
        gapAccepted: true,
      },
    ]).run()

    const result = (await handler(makeEvent())) as {
      statements: Array<{ hash: string, periodStart: string, reliability: string }>
    }
    expect(result.statements.map(s => s.periodStart)).toEqual(['2026-04-01', '2026-03-01'])
    expect(result.statements[0]!.reliability).toBe('gap_accepted')
    expect(result.statements[1]!.reliability).toBe('reliable')
  })
})

/**
 * FR24 — le taux de correction manuelle par relevé. C'est le chiffre observé au jalon de
 * décision de l'epic 14 : au-delà de 10 %, la construction des vues d'analyse s'arrête.
 */
describe('GET /api/statements — taux de correction manuelle (FR24)', () => {
  function seedStatement(hash: string, periodStart: string) {
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: hash,
      profileId: 1,
      bank: 'boursorama',
      periodStart,
      periodEnd: periodStart.slice(0, 8) + '28',
      openingBalanceCents: 0,
      closingBalanceCents: 0,
    }).run()
  }

  function seedTransactions(hash: string, total: number, manual: number) {
    for (let i = 0; i < total; i++) {
      dbMod.db.insert(schema.transactions).values({
        statementHash: hash,
        transactionDate: '2026-04-05',
        label: `op-${i}`,
        amountCents: -1000,
        categoryItemId: itemId('alimentation-courses'),
        isManual: i < manual,
      }).run()
    }
  }

  it('compte les lignes corrigées et rend le taux', async () => {
    seedStatement(HASH_A, '2026-04-01')
    seedTransactions(HASH_A, 20, 3)

    const { statements } = (await handler(makeEvent())) as {
      statements: { transactionCount: number, manualCount: number, correctionRate: number | null }[]
    }
    expect(statements[0]).toMatchObject({ transactionCount: 20, manualCount: 3 })
    expect(statements[0]!.correctionRate).toBeCloseTo(0.15, 5)
  })

  it('rend 0 — et non « — » — quand aucune ligne n\'a été corrigée', async () => {
    seedStatement(HASH_A, '2026-04-01')
    seedTransactions(HASH_A, 10, 0)

    const { statements } = (await handler(makeEvent())) as {
      statements: { correctionRate: number | null }[]
    }
    expect(statements[0]!.correctionRate).toBe(0)
  })

  /**
   * Cas limite imposé par NFR3 : dénominateur nul. Un relevé sans transaction n'a pas un taux
   * de correction de 0 %, il n'en a pas — et l'afficher à 0 % laisserait croire à une
   * catégorisation parfaite.
   */
  it('rend null sur un relevé sans transaction, jamais 0', async () => {
    seedStatement(HASH_A, '2026-04-01')

    const { statements } = (await handler(makeEvent())) as {
      statements: { correctionRate: number | null, transactionCount: number }[]
    }
    expect(statements[0]!.transactionCount).toBe(0)
    expect(statements[0]!.correctionRate).toBeNull()
  })

  it('calcule le taux par relevé, sans mélanger deux relevés', async () => {
    seedStatement(HASH_A, '2026-04-01')
    seedStatement(HASH_B, '2026-03-01')
    seedTransactions(HASH_A, 10, 1)
    seedTransactions(HASH_B, 10, 9)

    const { statements } = (await handler(makeEvent())) as {
      statements: { hash: string, correctionRate: number | null }[]
    }
    const byHash = new Map(statements.map(s => [s.hash, s.correctionRate]))
    expect(byHash.get(HASH_A)).toBeCloseTo(0.1, 5)
    expect(byHash.get(HASH_B)).toBeCloseTo(0.9, 5)
  })
})
