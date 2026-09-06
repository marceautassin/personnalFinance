import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-evolution-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')

interface Resp {
  buckets: string[]
  series: Array<{ bucket: string, resultCents: number, cumulativeResultCents: number, incomeCents: number, expenseCents: number }>
  targetSeries: Array<{ bucket: string, totalCents: number }> | null
  targetLabel: string | null
  groups: Array<{ code: string, items: Array<{ code: string }> }>
}

let dbMod: DbModule
let schema: SchemaModule
let handler: (event: H3Event) => Promise<Resp>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')
  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(TEST_SCHEMA_DDL)
  sqlite.exec(TEST_REFERENTIAL_DDL)
  handler = (await import('./evolution.get')).default as typeof handler
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
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: 'h', periodStart: '2025-01-01', periodEnd: '2026-12-31',
    openingBalanceCents: 0, closingBalanceCents: 0,
  }).run()
})

function query(qs: string): H3Event {
  return { path: `/api/evolution?${qs}`, method: 'GET', node: { req: { url: `/api/evolution?${qs}` } } } as unknown as H3Event
}

function seedTx(date: string, amountCents: number, code: string) {
  dbMod.db.insert(schema.transactions).values({
    statementHash: 'h', transactionDate: date, label: 'op', amountCents, categoryItemCode: code,
  }).run()
}

const AUGUST = 'to=2026-08&granularity=month'

describe('GET /api/evolution — validation', () => {
  it.each([
    ['tranche absente', 'granularity=month'],
    ['granularité inconnue', 'to=2026-08&granularity=week'],
    ['tranche mal formée', 'to=2026-8&granularity=month'],
    ['cible mal formée', 'to=2026-08&granularity=month&target=alimentation'],
  ])('refuse en 422 : %s', async (_name, qs) => {
    await expect(handler(query(qs))).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('GET /api/evolution — fenêtre fixe', () => {
  it('rend exactement douze tranches, la dernière étant celle demandée', async () => {
    const r = await handler(query(AUGUST))
    expect(r.buckets).toHaveLength(12)
    expect(r.buckets.at(-1)).toBe('2026-08')
    expect(r.buckets[0]).toBe('2025-09')
  })

  /**
   * Une tranche sans mouvement vaut zéro, elle n'est pas omise : une série trouée se lirait
   * comme une accélération, et l'absence d'un mois est en soi une information.
   */
  it('rend les tranches vides à zéro plutôt que de les omettre', async () => {
    seedTx('2026-08-10', -50_000, 'alimentation-courses')
    const r = await handler(query(AUGUST))
    expect(r.series).toHaveLength(12)
    expect(r.series.slice(0, 11).every(p => p.resultCents === 0)).toBe(true)
    expect(r.series.at(-1)!.resultCents).toBe(-50_000)
  })

  it('cumule dans l\'ordre chronologique sur toute la fenêtre', async () => {
    seedTx('2026-06-10', -10_000, 'alimentation-courses')
    seedTx('2026-07-10', -20_000, 'alimentation-courses')
    seedTx('2026-08-10', 5_000, 'revenus-salaire')
    const r = await handler(query(AUGUST))
    const cumuls = r.series.map(p => p.cumulativeResultCents)
    expect(cumuls.at(-3)).toBe(-10_000)
    expect(cumuls.at(-2)).toBe(-30_000)
    expect(cumuls.at(-1)).toBe(-25_000)
  })

  it('sépare recettes et dépenses, hors mouvements internes', async () => {
    seedTx('2026-08-05', 250_000, 'revenus-salaire')
    seedTx('2026-08-10', -40_000, 'alimentation-courses')
    seedTx('2026-08-20', -99_000, 'internes-virement-epargne')
    const last = (await handler(query(AUGUST))).series.at(-1)!
    expect(last.incomeCents).toBe(250_000)
    expect(last.expenseCents).toBe(-40_000)
    expect(last.resultCents).toBe(210_000)
  })

  it('remonte au trimestre précédent en granularité trimestre', async () => {
    const r = await handler(query('to=2026-T3&granularity=quarter'))
    expect(r.buckets.at(-1)).toBe('2026-T3')
    expect(r.buckets[0]).toBe('2023-T4')
  })
})

describe('GET /api/evolution — suivi d\'une cible (FR31)', () => {
  beforeEach(() => {
    seedTx('2026-07-10', -30_000, 'alimentation-courses')
    seedTx('2026-07-15', -10_000, 'alimentation-restaurant')
    seedTx('2026-08-10', -50_000, 'alimentation-courses')
    seedTx('2026-08-12', -20_000, 'transport-carburant')
  })

  it('rend null sans cible demandée', async () => {
    const r = await handler(query(AUGUST))
    expect(r.targetSeries).toBeNull()
    expect(r.targetLabel).toBeNull()
  })

  it('suit un poste et le nomme lisiblement', async () => {
    const r = await handler(query(`${AUGUST}&target=item:alimentation-courses`))
    expect(r.targetLabel).toBe('Alimentation · Courses')
    expect(r.targetSeries!.at(-1)!.totalCents).toBe(-50_000)
    expect(r.targetSeries!.at(-2)!.totalCents).toBe(-30_000)
  })

  it('suit une rubrique entière', async () => {
    const r = await handler(query(`${AUGUST}&target=group:alimentation`))
    expect(r.targetLabel).toBe('Alimentation')
    expect(r.targetSeries!.at(-2)!.totalCents).toBe(-40_000)
  })

  it('aligne la série de la cible sur les mêmes tranches que la vue d\'ensemble', async () => {
    const r = await handler(query(`${AUGUST}&target=group:alimentation`))
    expect(r.targetSeries!.map(p => p.bucket)).toEqual(r.buckets)
  })

  it('rend une série de zéros sur une cible inconnue, sans lever', async () => {
    const r = await handler(query(`${AUGUST}&target=item:poste-fantome`))
    expect(r.targetLabel).toBeNull()
    expect(r.targetSeries!.every(p => p.totalCents === 0)).toBe(true)
  })

  it('expose le référentiel pour peupler le sélecteur sans second appel', async () => {
    const r = await handler(query(AUGUST))
    expect(r.groups.find(g => g.code === 'alimentation')!.items.map(i => i.code))
      .toEqual(['alimentation-courses', 'alimentation-restaurant'])
  })
})

/**
 * Orientation de la cible : les dépenses sont stockées en négatif, et une courbe tracée telle
 * quelle DESCEND quand on dépense plus — l'inverse de ce que tout le monde lit.
 */
describe('GET /api/evolution — nature de la cible', () => {
  beforeEach(() => seedTx('2026-08-10', -50_000, 'alimentation-courses'))

  it('rend la nature d\'un poste', async () => {
    const r = await handler(query(`${AUGUST}&target=item:alimentation-courses`)) as unknown as { targetNature: string | null }
    expect(r.targetNature).toBe('expense')
  })

  it('rend la nature d\'une rubrique homogène', async () => {
    const r = await handler(query(`${AUGUST}&target=group:internes`)) as unknown as { targetNature: string | null }
    expect(r.targetNature).toBe('internal_transfer')
  })

  /** Une rubrique qui mêle plusieurs natures n'a pas d'orientation défendable. */
  it('rend null sur une rubrique aux natures mêlées', async () => {
    dbMod.db.insert(schema.categoryItems).values({
      code: 'alimentation-remboursement', groupCode: 'alimentation',
      label: 'Remboursement', nature: 'income', position: 9,
    }).run()
    const r = await handler(query(`${AUGUST}&target=group:alimentation`)) as unknown as { targetNature: string | null }
    expect(r.targetNature).toBeNull()
    dbMod.db.delete(schema.categoryItems).where(
      (await import('drizzle-orm')).eq(schema.categoryItems.code, 'alimentation-remboursement'),
    ).run()
  })

  it('rend null sans cible', async () => {
    const r = await handler(query(AUGUST)) as unknown as { targetNature: string | null }
    expect(r.targetNature).toBeNull()
  })

  /**
   * Report du patrimoine antérieur — demande du 2026-09-06.
   *
   * La courbe cumulée repartait de zéro à chaque fenêtre : elle décrivait la trésorerie DE LA
   * FENÊTRE, pas la trajectoire du patrimoine. Or c'est la trajectoire qui répond à « est-ce
   * que mon patrimoine a augmenté ou baissé ».
   */
  describe('report du patrimoine antérieur', () => {
    type Resp = {
      priorCumulativeCents: number
      series: Array<{ cumulativeResultCents: number }>
    }
    const call = async (qs: string) => (await handler(query(qs))) as unknown as Resp

    it('amorce le cumul avec ce qui précède la fenêtre', async () => {
      // La fenêtre couvre les douze tranches jusqu'à 2026-04 : mai 2025 en est le début.
      seedTx('2024-01-10', -100_000, 'alimentation-courses')
      seedTx('2026-04-10', -20_000, 'alimentation-courses')

      const r = await call('to=2026-04&granularity=month')

      expect(r.priorCumulativeCents).toBe(-100_000)
      expect(r.series.at(-1)!.cumulativeResultCents).toBe(-120_000)
    })

    it('ignore les mouvements internes dans ce report', async () => {
      seedTx('2024-01-10', -500_000, 'internes-virement-epargne')

      const r = await call('to=2026-04&granularity=month')

      expect(r.priorCumulativeCents).toBe(0)
    })

    it('rend zéro quand rien ne précède la fenêtre', async () => {
      seedTx('2026-04-10', -20_000, 'alimentation-courses')

      const r = await call('to=2026-04&granularity=month')

      expect(r.priorCumulativeCents).toBe(0)
      expect(r.series.at(-1)!.cumulativeResultCents).toBe(-20_000)
    })
  })
})
