import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-analysis-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<Resp>

interface Resp {
  from: string
  to: string
  reliability: string
  unreliableStatements: Array<{ hash: string, gapCents: number }>
  bankBalance: { openingCents: number, closingCents: number, from: string, to: string } | null
  indicators: {
    incomeCents: number
    expenseCents: number
    internalCents: number
    resultCents: number
    spendRate: number | null
    savingsRate: number | null
    cumulativeResultCents: number
  }
  natures: Array<{ nature: string, totalCents: number, groups: Array<{ groupCode: string, totalCents: number }> }>
  series: Array<{ bucket: string, resultCents: number }>
}

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
  handler = (await import('./analysis.get')).default as Handler
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

function query(qs: string): H3Event {
  return {
    path: `/api/analysis?${qs}`,
    method: 'GET',
    // `headers: {}` : sans cookie `pf_profile`, `requireProfile` retombe sur le profil unique
    // de test (story 27.2, AC 10).
    node: { req: { url: `/api/analysis?${qs}`, headers: {} }, res: {} },
  } as unknown as H3Event
}

/** Résout un code de poste vers son id, dans le profil de test (story 27.1, D37). */
function itemId(code: string): number {
  return (sqlite.prepare('SELECT id FROM category_items WHERE code = ? AND profile_id = 1').get(code) as { id: number }).id
}

function seedStatement(opts: {
  hash: string
  periodStart: string
  periodEnd: string
  opening?: number
  closing?: number
}) {
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: opts.hash,
    profileId: 1,
    bank: 'boursorama',
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    openingBalanceCents: opts.opening ?? 0,
    closingBalanceCents: opts.closing ?? 0,
  }).run()
}

function seedTx(hash: string, date: string, amountCents: number, code: string) {
  dbMod.db.insert(schema.transactions).values({
    statementHash: hash, transactionDate: date, label: 'op', amountCents, categoryItemId: itemId(code),
  }).run()
}

const MARCH = 'from=2026-03-01&to=2026-03-31&granularity=month'

describe('GET /api/analysis — validation des paramètres', () => {
  it.each([
    ['bornes manquantes', 'granularity=month'],
    ['granularité inconnue', 'from=2026-03-01&to=2026-03-31&granularity=week'],
    ['date mal formée', 'from=2026-3-1&to=2026-03-31&granularity=month'],
    ['date inexistante au calendrier', 'from=2026-02-30&to=2026-03-31&granularity=month'],
    ['bornes inversées', 'from=2026-03-31&to=2026-03-01&granularity=month'],
  ])('refuse en 422 : %s', async (_name, qs) => {
    await expect(handler(query(qs))).rejects.toMatchObject({ statusCode: 422 })
  })

  /** AR9 : jamais d'identifiant de période composite — les bornes et le découpage sont distincts. */
  it('refuse un identifiant de période au lieu de bornes', async () => {
    await expect(handler(query('period=2026-Q1&granularity=quarter'))).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('GET /api/analysis — agrégation', () => {
  beforeEach(() => {
    seedStatement({ hash: 'mar', periodStart: '2026-03-01', periodEnd: '2026-03-31', opening: 47_841, closing: 102_398 })
    seedTx('mar', '2026-03-05', 250_000, 'revenus-salaire')
    seedTx('mar', '2026-03-10', -40_000, 'alimentation-courses')
    seedTx('mar', '2026-03-12', -15_000, 'alimentation-restaurant')
    seedTx('mar', '2026-03-20', -50_000, 'internes-virement-epargne')
  })

  it('rend l\'arbre, les indicateurs et la série', async () => {
    const r = await handler(query(MARCH))
    expect(r.from).toBe('2026-03-01')
    expect(r.natures.map(n => n.nature).sort()).toEqual(['expense', 'income', 'internal_transfer'])
    expect(r.series.map(s => s.bucket)).toEqual(['2026-03'])
  })

  /**
   * NFR4 — le résultat exclut les mouvements internes, le solde bancaire les inclut. Les deux
   * doivent se recontrôler : c'est la garantie que rien n'a été perdu en route.
   */
  it('sépare le résultat du solde bancaire, et les deux se recontrôlent', async () => {
    const r = await handler(query(MARCH))
    expect(r.indicators.resultCents).toBe(195_000)
    expect(r.indicators.internalCents).toBe(-50_000)
    expect(r.bankBalance).toMatchObject({ openingCents: 47_841, closingCents: 102_398 })
    expect(r.indicators.resultCents + r.indicators.internalCents).toBe(145_000)
  })

  /** AR8 — l'arbre ne transporte jamais les transactions : le chemin suffit. */
  it('ne renvoie aucune transaction', async () => {
    const r = await handler(query(MARCH)) as unknown as Record<string, unknown>
    expect(r.transactions).toBeUndefined()
    expect(JSON.stringify(r)).not.toContain('"label":"op"')
  })

  it('rend des indicateurs neutres sur une période vide', async () => {
    const r = await handler(query('from=2026-07-01&to=2026-07-31&granularity=month'))
    expect(r.natures).toEqual([])
    expect(r.indicators.resultCents).toBe(0)
    expect(r.indicators.spendRate).toBeNull()
  })
})

describe('GET /api/analysis — fiabilité au niveau période (D23)', () => {
  it('rend « reliable » quand tous les relevés tombent juste', async () => {
    seedStatement({ hash: 'ok', periodStart: '2026-03-01', periodEnd: '2026-03-31', opening: 0, closing: -40_000 })
    seedTx('ok', '2026-03-10', -40_000, 'alimentation-courses')
    const r = await handler(query(MARCH))
    expect(r.reliability).toBe('reliable')
    expect(r.unreliableStatements).toEqual([])
  })

  /** Un seul relevé bancal contamine tout le mois — la fiabilité est portée par la PÉRIODE. */
  it('signale l\'écart d\'un relevé qui contribue à la période', async () => {
    seedStatement({ hash: 'bad', periodStart: '2026-03-01', periodEnd: '2026-03-31', opening: 0, closing: 200_000 })
    const r = await handler(query(MARCH))
    expect(r.reliability).toBe('gap_unreviewed')
    expect(r.unreliableStatements).toEqual([
      expect.objectContaining({ hash: 'bad', gapCents: 200_000 }),
    ])
  })
})

describe('GET /api/analysis — solde bancaire (D25)', () => {
  it('rend null quand aucun relevé ne couvre la période', async () => {
    const r = await handler(query(MARCH))
    expect(r.bankBalance).toBeNull()
  })

  it('rend null quand les relevés ne couvrent pas toute la période', async () => {
    seedStatement({ hash: 'partiel', periodStart: '2026-03-10', periodEnd: '2026-03-31' })
    const r = await handler(query(MARCH))
    expect(r.bankBalance).toBeNull()
  })

  /**
   * Un trou dans l'historique rend le solde de clôture indéterminé : on ne sait pas ce qui
   * s'est passé entre les deux. Mieux vaut ne rien afficher qu'un chiffre qu'on croirait exact.
   */
  it('rend null sur un historique troué, même si les bornes sont couvertes', async () => {
    seedStatement({ hash: 'a', periodStart: '2026-03-01', periodEnd: '2026-03-10', opening: 1000, closing: 2000 })
    seedStatement({ hash: 'b', periodStart: '2026-03-20', periodEnd: '2026-03-31', opening: 5000, closing: 6000 })
    const r = await handler(query(MARCH))
    expect(r.bankBalance).toBeNull()
  })

  it('recolle deux relevés contigus', async () => {
    seedStatement({ hash: 'a', periodStart: '2026-03-01', periodEnd: '2026-03-15', opening: 1000, closing: 2000 })
    seedStatement({ hash: 'b', periodStart: '2026-03-16', periodEnd: '2026-03-31', opening: 2000, closing: 6000 })
    const r = await handler(query(MARCH))
    expect(r.bankBalance).toMatchObject({ openingCents: 1000, closingCents: 6000 })
  })
})

describe('GET /api/analysis — comparaison à la période précédente (D24)', () => {
  it('compare au mois calendaire précédent, pas aux 31 jours d\'avant', async () => {
    seedStatement({ hash: 'feb', periodStart: '2026-02-01', periodEnd: '2026-02-28' })
    seedStatement({ hash: 'mar', periodStart: '2026-03-01', periodEnd: '2026-03-31' })
    seedTx('feb', '2026-02-10', -20_000, 'alimentation-courses')
    seedTx('mar', '2026-03-10', -50_000, 'alimentation-courses')

    const r = await handler(query(MARCH)) as unknown as {
      natures: Array<{ nature: string, groups: Array<{ previousTotalCents: number }> }>
    }
    const expense = r.natures.find(n => n.nature === 'expense')!
    expect(expense.groups[0]!.previousTotalCents).toBe(-20_000)
  })

  it('compare au trimestre précédent en granularité trimestre', async () => {
    seedStatement({ hash: 'q4', periodStart: '2025-10-01', periodEnd: '2025-12-31' })
    seedStatement({ hash: 'q1', periodStart: '2026-01-01', periodEnd: '2026-03-31' })
    seedTx('q4', '2025-11-10', -10_000, 'alimentation-courses')
    seedTx('q1', '2026-02-10', -30_000, 'alimentation-courses')

    const r = await handler(query('from=2026-01-01&to=2026-03-31&granularity=quarter')) as unknown as {
      natures: Array<{ nature: string, groups: Array<{ previousTotalCents: number }> }>
    }
    expect(r.natures.find(n => n.nature === 'expense')!.groups[0]!.previousTotalCents).toBe(-10_000)
  })
})

/**
 * Fenêtre d'évolution (FR31).
 *
 * L'arbre décrit la période choisie ; la série n'a de sens que sur plusieurs tranches. Les
 * confondre donnait, en granularité mois, un graphique d'évolution d'un seul point.
 */
describe('GET /api/analysis — fenêtre d\'évolution', () => {
  beforeEach(() => {
    for (const month of ['01', '02', '03']) {
      seedStatement({ hash: `m${month}`, periodStart: `2026-${month}-01`, periodEnd: `2026-${month}-28` })
      seedTx(`m${month}`, `2026-${month}-10`, -10_000 * Number(month), 'alimentation-courses')
    }
  })

  it('couvre plusieurs tranches, pas la seule période analysée', async () => {
    const r = await handler(query(MARCH))
    expect(r.series.map(s => s.bucket)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('borne l\'arbre à la période demandée, malgré la série élargie', async () => {
    const r = await handler(query(MARCH))
    expect(r.natures.find(n => n.nature === 'expense')!.totalCents).toBe(-30_000)
  })

  it('cumule sur toute la fenêtre, pas sur la seule période', async () => {
    const r = await handler(query(MARCH))
    expect(r.series.at(-1)!.resultCents).toBe(-30_000)
    expect(r.indicators.cumulativeResultCents).toBe(-60_000)
  })

  it('annonce la première tranche couverte', async () => {
    const r = await handler(query(MARCH)) as unknown as { seriesFrom: string }
    expect(r.seriesFrom).toBe('2025-04-01')
  })
})

describe('GET /api/analysis — solde bancaire, débordement', () => {
  /**
   * Cycle bancaire 26→25 : les relevés couvrent mars sans lui correspondre. Le solde reste
   * exploitable, mais il DOIT annoncer ce qu'il couvre — sinon l'écran affiche une variation
   * sur deux mois sous le titre « mars ».
   */
  it('annonce la période réellement couverte quand les relevés débordent', async () => {
    seedStatement({ hash: 'a', periodStart: '2026-02-26', periodEnd: '2026-03-25', opening: 1000, closing: 2000 })
    seedStatement({ hash: 'b', periodStart: '2026-03-26', periodEnd: '2026-04-25', opening: 2000, closing: 9000 })
    const r = await handler(query(MARCH))
    expect(r.bankBalance).toEqual({
      openingCents: 1000,
      closingCents: 9000,
      from: '2026-02-26',
      to: '2026-04-25',
    })
  })

  /**
   * Le cas réel : un relevé Boursobank court du 28/02 au 31/03. Exiger une coïncidence exacte
   * avec les bornes du mois rendait `null` sur TOUTES les données réelles.
   */
  it('accepte un relevé bancaire décalé du calendrier', async () => {
    seedStatement({ hash: 'bourso', periodStart: '2026-02-28', periodEnd: '2026-03-31', opening: 47_841, closing: 102_398 })
    const r = await handler(query(MARCH))
    expect(r.bankBalance).toMatchObject({ openingCents: 47_841, closingCents: 102_398, from: '2026-02-28' })
  })
})
