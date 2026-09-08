import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'
import type { StatementReliability } from '~~/shared/types/statement-reliability'

// Set DATABASE_URL avant tout import du module `db/client` (singleton).
const tmpDir = mkdtempSync(join(tmpdir(), 'pf-tx-api-'))
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

  // Accès à la connexion better-sqlite3 sous-jacente pour exécuter le DDL.
  // @ts-expect-error -- propriété interne drizzle
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(TEST_SCHEMA_DDL)
  sqlite.exec(TEST_REFERENTIAL_DDL)

  handler = (await import('./index.get')).default as Handler
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
  // h3 v1.x : getQuery(event) lit `event.path`. Mock minimal suffisant pour validateQuery.
  return { path: `/api/transactions?${query}` } as unknown as H3Event
}

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

type Row = {
  label: string
  transactionDate: string
  amountCents: number
  isManual: boolean
  isDebtRepayment: boolean
  debtId: number | null
  statementHash: string
  categoryItemCode: string
  id: number
  settlementStatus: 'neutralized' | 'partial' | 'outstanding' | null
  effectiveAmountCents: number
}
type Resp = { transactions: Row[], reliability: StatementReliability | null }

describe('GET /api/transactions', () => {
  it('returns transactions of the requested month sorted by date asc', async () => {
    seedStatement()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-15', label: 'B', amountCents: -2000, categoryItemCode: 'alimentation-courses' },
      { statementHash: HASH_A, transactionDate: '2026-04-05', label: 'A', amountCents: -1000, categoryItemCode: 'alimentation-courses' },
      { statementHash: HASH_A, transactionDate: '2026-04-25', label: 'C', amountCents: -3000, categoryItemCode: 'alimentation-courses' },
      { statementHash: HASH_A, transactionDate: '2026-05-01', label: 'OUT', amountCents: -500, categoryItemCode: 'alimentation-courses' },
    ]).run()

    const result = (await handler(eventWithQuery('month=2026-04'))) as Resp

    expect(result.transactions).toHaveLength(3)
    expect(result.transactions.map(r => r.label)).toEqual(['A', 'B', 'C'])
    expect(result.transactions[0]).toMatchObject({
      label: 'A',
      transactionDate: '2026-04-05',
      amountCents: -1000,
      categoryItemCode: 'alimentation-courses',
      isManual: false,
      statementHash: HASH_A,
    })
    expect(typeof result.transactions[0]!.id).toBe('number')
    // Les soldes de la fixture sont arbitraires : la somme des transactions ne retombe pas
    // dessus, donc le mois porte légitimement un écart que personne n'a examiné.
    expect(result.reliability).toBe('gap_unreviewed')
  })

  it('propage l\'écart assumé d\'un relevé contribuant au mois', async () => {
    seedStatement()
    dbMod.db.update(schema.bankStatements).set({ gapAccepted: true }).run()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-10', label: 'X', amountCents: -1000, categoryItemCode: 'alimentation-courses' },
    ]).run()

    const result = (await handler(eventWithQuery('month=2026-04'))) as Resp
    expect(result.reliability).toBe('gap_accepted')
  })

  it('returns reliability=unreliable when the period is covered by an unreliable statement with zero transactions', async () => {
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: HASH_A,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      openingBalanceCents: 100_000,
      closingBalanceCents: 50_000,
      gapAccepted: true,
    }).run()

    const result = (await handler(eventWithQuery('month=2026-04'))) as Resp
    expect(result.transactions).toEqual([])
    expect(result.reliability).toBe('gap_accepted')
  })

  it('returns empty array and null reliability for a month with no data', async () => {
    const result = (await handler(eventWithQuery('month=2030-01'))) as Resp
    expect(result.transactions).toEqual([])
    expect(result.reliability).toBeNull()
  })

  it('returns 422 validation_failed for invalid month format', async () => {
    await expect(handler(eventWithQuery('month=not-a-month'))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })

  it('returns 422 validation_failed when month is missing', async () => {
    await expect(handler(eventWithQuery(''))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })

  it('returns 422 for out-of-range month (e.g. 2026-13)', async () => {
    await expect(handler(eventWithQuery('month=2026-13'))).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
    })
  })
})

/**
 * Descente depuis un agrégat (FR35, AR8).
 *
 * C'est ce qui rend NFR2 satisfaisable sans précalcul : l'arbre d'analyse ne transporte aucune
 * ligne, il porte de quoi construire cette requête.
 */
describe('GET /api/transactions — descente par bornes et par poste', () => {
  beforeEach(() => {
    seedStatement()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-05', label: 'A', amountCents: -1000, categoryItemCode: 'alimentation-courses' },
      { statementHash: HASH_A, transactionDate: '2026-04-15', label: 'B', amountCents: -2000, categoryItemCode: 'alimentation-courses' },
      { statementHash: HASH_A, transactionDate: '2026-04-20', label: 'C', amountCents: -3000, categoryItemCode: 'alimentation-restaurant' },
      { statementHash: HASH_A, transactionDate: '2026-05-02', label: 'HORS', amountCents: -4000, categoryItemCode: 'alimentation-courses' },
    ]).run()
  })

  it('filtre sur les bornes', async () => {
    const r = (await handler(eventWithQuery('from=2026-04-01&to=2026-04-30'))) as Resp
    expect(r.transactions.map(t => t.label)).toEqual(['A', 'B', 'C'])
  })

  it('filtre en plus sur le poste', async () => {
    const r = (await handler(eventWithQuery('from=2026-04-01&to=2026-04-30&item=alimentation-courses'))) as Resp
    expect(r.transactions.map(t => t.label)).toEqual(['A', 'B'])
  })

  /**
   * La somme des lignes de la descente doit valoir le montant du nœud d'où l'on vient : c'est
   * la propriété que NFR2 exige, et la seule qui rende un agrégat vérifiable.
   */
  it('somme exactement le total du poste sur la période', async () => {
    const r = (await handler(eventWithQuery('from=2026-04-01&to=2026-04-30&item=alimentation-courses'))) as Resp
    expect(r.transactions.reduce((s, t) => s + t.amountCents, 0)).toBe(-3000)
  })

  it('rend une liste vide sur un poste sans ligne, sans lever', async () => {
    const r = (await handler(eventWithQuery('from=2026-04-01&to=2026-04-30&item=voyages-restaurant'))) as Resp
    expect(r.transactions).toEqual([])
  })

  it('refuse un mélange des deux formes de requête', async () => {
    await expect(handler(eventWithQuery('month=2026-04&item=alimentation-courses')))
      .rejects.toMatchObject({ statusCode: 422 })
  })

  it('refuse des bornes inversées', async () => {
    await expect(handler(eventWithQuery('from=2026-04-30&to=2026-04-01')))
      .rejects.toMatchObject({ statusCode: 422 })
  })

  /**
   * Filtre par RUBRIQUE — ajouté le 2026-09-06 pour la trajectoire d'une rubrique sur
   * `/evolution` : la suivre sur douze tranches sans pouvoir en ouvrir une seule laissait un
   * graphique invérifiable (NFR2).
   */
  describe('filtre par rubrique', () => {
    // La fixture du bloc parent fournit déjà A et B (courses) et C (restaurant) en avril, plus
    // une ligne de mai. On y ajoute une recette, pour vérifier qu'une AUTRE rubrique est exclue.
    const seedSalaire = () => {
      dbMod.db.insert(schema.transactions).values([
        { statementHash: HASH_A, transactionDate: '2026-04-07', label: 'SALAIRE', amountCents: 300_000, categoryItemCode: 'revenus-salaire' },
      ]).run()
    }

    it('rend les lignes de TOUS les postes de la rubrique', async () => {
      const res = (await handler(eventWithQuery('from=2026-04-01&to=2026-04-30&group=alimentation'))) as Resp

      expect(res.transactions.map(t => t.label)).toEqual(['A', 'B', 'C'])
    })

    it('exclut les lignes des autres rubriques', async () => {
      seedSalaire()
      const res = (await handler(eventWithQuery('from=2026-04-01&to=2026-04-30&group=alimentation'))) as Resp

      expect(res.transactions.some(t => t.label === 'SALAIRE')).toBe(false)
    })

    it('reste borné à la période demandée', async () => {
      const res = (await handler(eventWithQuery('from=2026-04-16&to=2026-04-30&group=alimentation'))) as Resp

      expect(res.transactions.map(t => t.label)).toEqual(['C'])
    })

    it('rend une liste vide sur une rubrique sans ligne', async () => {
      const res = (await handler(eventWithQuery('from=2026-04-01&to=2026-04-30&group=rubrique-fantome'))) as Resp

      expect(res.transactions).toEqual([])
    })

    it('refuse item et group ensemble — leur cumul n\'aurait qu\'un sens, le poste', async () => {
      await expect(
        handler(eventWithQuery('from=2026-04-01&to=2026-04-30&group=alimentation&item=revenus-salaire')),
      ).rejects.toMatchObject({ statusCode: 422 })
    })
  })
})

/**
 * Réconciliation (epic 19) — l'état d'une ligne se calcule sur la PÉRIODE, jamais sur ce qui
 * reste après le filtre de poste.
 *
 * Les deux cas ci-dessous sont ceux qui cassaient l'écran avant la story 19.4 : un badge
 * « à rembourser » posé sur une ligne que le total ne comptait déjà plus, et un pied de
 * descente qui ne retombait pas sur le total du poste (NFR2).
 */
describe('GET /api/transactions — état et poids réel des lignes réconciliées', () => {
  const linkGroup = (label: string) => {
    dbMod.db.insert(schema.settlementGroups).values({ label }).run()
    return dbMod.db.select({ id: schema.settlementGroups.id }).from(schema.settlementGroups).all().at(-1)!.id
  }

  beforeEach(() => {
    seedStatement()
  })

  it('une avance reste neutralisée même quand le filtre de poste exclut son remboursement', async () => {
    const groupId = linkGroup('courses parents')
    dbMod.db.insert(schema.transactions).values([
      // L'avance est en « courses », le virement qui la rembourse en « remboursements ».
      { statementHash: HASH_A, transactionDate: '2026-04-12', label: 'AVANCE', amountCents: -36_750, categoryItemCode: 'alimentation-courses', settlementGroupId: groupId },
      { statementHash: HASH_A, transactionDate: '2026-04-20', label: 'VIREMENT', amountCents: 36_750, categoryItemCode: 'revenus-salaire', settlementGroupId: groupId },
    ]).run()

    const r = (await handler(eventWithQuery('from=2026-04-01&to=2026-04-30&item=alimentation-courses'))) as Resp

    expect(r.transactions).toHaveLength(1)
    expect(r.transactions[0]).toMatchObject({
      label: 'AVANCE',
      amountCents: -36_750,
      settlementStatus: 'neutralized',
      effectiveAmountCents: 0,
    })
  })

  it('la somme des montants effectifs retombe sur le total du poste', async () => {
    const groupId = linkGroup('courses parents')
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-12', label: 'AVANCE', amountCents: -36_750, categoryItemCode: 'alimentation-courses', settlementGroupId: groupId },
      { statementHash: HASH_A, transactionDate: '2026-04-20', label: 'VIREMENT', amountCents: 36_750, categoryItemCode: 'revenus-salaire', settlementGroupId: groupId },
      { statementHash: HASH_A, transactionDate: '2026-04-15', label: 'LIBRE', amountCents: -4_210, categoryItemCode: 'alimentation-courses' },
    ]).run()

    const r = (await handler(eventWithQuery('from=2026-04-01&to=2026-04-30&item=alimentation-courses'))) as Resp

    expect(r.transactions.reduce((s, t) => s + t.effectiveAmountCents, 0)).toBe(-4_210)
  })

  it('un remboursement hors période laisse l\'avance à charge dans son mois', async () => {
    const groupId = linkGroup('avance de janvier')
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: 'b'.repeat(64),
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      openingBalanceCents: 0,
      closingBalanceCents: 0,
      gapAccepted: true,
    }).run()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: 'b'.repeat(64), transactionDate: '2026-01-12', label: 'AVANCE', amountCents: -20_000, categoryItemCode: 'alimentation-courses', settlementGroupId: groupId },
      { statementHash: HASH_A, transactionDate: '2026-04-20', label: 'VIREMENT', amountCents: 20_000, categoryItemCode: 'revenus-salaire', settlementGroupId: groupId },
    ]).run()

    const janvier = (await handler(eventWithQuery('from=2026-01-01&to=2026-01-31'))) as Resp
    expect(janvier.transactions[0]).toMatchObject({ settlementStatus: 'outstanding', effectiveAmountCents: -20_000 })

    // Sur une période qui contient les deux lignes, la même avance est neutralisée.
    const annee = (await handler(eventWithQuery('from=2026-01-01&to=2026-12-31'))) as Resp
    expect(annee.transactions.find(t => t.label === 'AVANCE')).toMatchObject({ settlementStatus: 'neutralized', effectiveAmountCents: 0 })
  })

  /*
   * Portée ÉLARGIE — la trajectoire d'une cible sur `/evolution` neutralise sur la fenêtre
   * entière puis répartit par tranche. Ouvrir une tranche sans le dire remettrait dans son
   * total une avance que le point, lui, ne compte pas (revue du 2026-09-08).
   */
  it('la portée déclarée déborde les lignes demandées et décide de l\'état', async () => {
    const groupId = linkGroup('avance de janvier')
    dbMod.db.insert(schema.bankStatements).values({
      hashSha256: 'b'.repeat(64),
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      openingBalanceCents: 0,
      closingBalanceCents: 0,
      gapAccepted: true,
    }).run()
    dbMod.db.insert(schema.transactions).values([
      { statementHash: 'b'.repeat(64), transactionDate: '2026-01-12', label: 'AVANCE', amountCents: -20_000, categoryItemCode: 'alimentation-courses', settlementGroupId: groupId },
      { statementHash: HASH_A, transactionDate: '2026-04-20', label: 'VIREMENT', amountCents: 20_000, categoryItemCode: 'revenus-salaire', settlementGroupId: groupId },
    ]).run()

    const q = 'from=2026-01-01&to=2026-01-31&settlementFrom=2026-01-01&settlementTo=2026-12-31'
    const r = (await handler(eventWithQuery(q))) as Resp

    expect(r.transactions.map(t => t.label)).toEqual(['AVANCE'])
    expect(r.transactions[0]).toMatchObject({ settlementStatus: 'neutralized', effectiveAmountCents: 0 })
  })

  it('refuse une portée plus ÉTROITE que les lignes demandées', async () => {
    const q = 'from=2026-01-01&to=2026-12-31&settlementFrom=2026-04-01&settlementTo=2026-04-30'
    await expect(handler(eventWithQuery(q))).rejects.toMatchObject({ statusCode: 422 })
  })

  it('refuse une borne de portée orpheline', async () => {
    await expect(handler(eventWithQuery('from=2026-01-01&to=2026-01-31&settlementFrom=2025-01-01')))
      .rejects.toMatchObject({ statusCode: 422 })
  })

  it('une ligne hors groupe pèse son propre montant, sans état', async () => {
    dbMod.db.insert(schema.transactions).values([
      { statementHash: HASH_A, transactionDate: '2026-04-15', label: 'LIBRE', amountCents: -4_210, categoryItemCode: 'alimentation-courses' },
    ]).run()

    const r = (await handler(eventWithQuery('from=2026-04-01&to=2026-04-30'))) as Resp
    expect(r.transactions[0]).toMatchObject({ settlementStatus: null, effectiveAmountCents: -4_210 })
  })
})
