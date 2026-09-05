import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-rules-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
let getHandler: Handler
let postHandler: Handler
let deleteHandler: Handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')
  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(TEST_SCHEMA_DDL)
  sqlite.exec(TEST_REFERENTIAL_DDL)

  getHandler = (await import('./index.get')).default as Handler
  postHandler = (await import('./index.post')).default as Handler
  deleteHandler = (await import('./[id].delete')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.classificationRules).run()
  dbMod.db.delete(schema.transactions).run()
  dbMod.db.delete(schema.bankStatements).run()
})

function makeEvent(opts: { method: string, body?: unknown, id?: string }): H3Event {
  return {
    _requestBody: opts.body === undefined ? '' : JSON.stringify(opts.body),
    node: { req: { headers: { 'content-type': 'application/json' }, method: opts.method }, res: { statusCode: 200 } },
    path: '/api/rules',
    method: opts.method,
    context: { params: opts.id ? { id: opts.id } : {} },
  } as unknown as H3Event
}

interface Rule {
  id: number
  pattern: string
  categoryItemCode: string
  itemLabel: string
  groupLabel: string
  matchCount: number
}

const create = (pattern: string, code = 'alimentation-courses') =>
  postHandler(makeEvent({ method: 'POST', body: { pattern, categoryItemCode: code } })) as Promise<Rule>

function seedTransaction(label: string) {
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: 'h', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    openingBalanceCents: 0, closingBalanceCents: 0,
  }).onConflictDoNothing().run()
  dbMod.db.insert(schema.transactions).values({
    statementHash: 'h', transactionDate: '2026-01-05', label,
    amountCents: -100, categoryItemCode: 'divers-non-categorise',
  }).run()
}

describe('POST /api/rules', () => {
  /**
   * Le motif est stocké normalisé — celui-là même que le moteur compare. Stocker la saisie
   * brute laisserait croire que la casse compte, et autoriserait deux règles jumelles.
   */
  it('normalise le motif à l\'enregistrement', async () => {
    const rule = await create('  CARREFOUR  Market ')
    expect(rule.pattern).toBe('carrefour market')
  })

  it('efface les accents du motif', async () => {
    expect((await create('PÉAGE')).pattern).toBe('peage')
  })

  it('renvoie la rubrique et le poste de destination', async () => {
    const rule = await create('carrefour')
    expect(rule).toMatchObject({ groupLabel: 'Alimentation', itemLabel: 'Courses' })
  })

  it('refuse deux règles au même motif, même écrites différemment', async () => {
    await create('Carrefour')
    await expect(create('CARREFOUR')).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: ApiErrorCode.RuleAlreadyExists,
    })
  })

  it('refuse un motif trop court', async () => {
    await expect(create('a')).rejects.toMatchObject({ statusCode: 422 })
  })

  /** Un motif qui ne survit pas à la normalisation attraperait tout ou rien. */
  it('refuse un motif qui se réduit à moins de deux caractères', async () => {
    await expect(create('  é ')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('refuse un poste inexistant', async () => {
    await expect(create('carrefour', 'poste-fantome')).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('GET /api/rules', () => {
  it('rend une liste vide quand aucune règle n\'existe', async () => {
    await expect(getHandler(makeEvent({ method: 'GET' }))).resolves.toEqual([])
  })

  /**
   * `matchCount` rend une règle jugeable AVANT qu'elle ne serve : un motif trop large se voit
   * à son compteur.
   */
  it('compte les transactions déjà en base que la règle couvre', async () => {
    seedTransaction('CARTE 01/03 CARREFOUR MARKET')
    seedTransaction('CARTE 04/03 carrefour city')
    seedTransaction('VIR SALAIRE ACME')
    await create('carrefour')

    const rules = (await getHandler(makeEvent({ method: 'GET' }))) as Rule[]
    expect(rules[0]!.matchCount).toBe(2)
  })

  it('rend un compteur nul quand rien ne correspond', async () => {
    seedTransaction('VIR SALAIRE ACME')
    await create('carrefour')
    const rules = (await getHandler(makeEvent({ method: 'GET' }))) as Rule[]
    expect(rules[0]!.matchCount).toBe(0)
  })

  it('ordonne par ancienneté, ce qui fixe le départage à motifs de longueur égale', async () => {
    await create('abcdef')
    await create('uvwxyz')
    const rules = (await getHandler(makeEvent({ method: 'GET' }))) as Rule[]
    expect(rules.map(r => r.pattern)).toEqual(['abcdef', 'uvwxyz'])
  })
})

describe('DELETE /api/rules/[id]', () => {
  it('supprime la règle', async () => {
    const rule = await create('carrefour')
    await deleteHandler(makeEvent({ method: 'DELETE', id: String(rule.id) }))
    await expect(getHandler(makeEvent({ method: 'GET' }))).resolves.toEqual([])
  })

  it('404 sur une règle inconnue', async () => {
    await expect(deleteHandler(makeEvent({ method: 'DELETE', id: '9999' }))).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('422 sur un identifiant non numérique', async () => {
    await expect(deleteHandler(makeEvent({ method: 'DELETE', id: 'abc' }))).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  /**
   * Supprimer une règle ne reclasse rien : réécrire silencieusement des mois déjà analysés
   * serait pire que de laisser un classement obsolète, qui reste corrigeable à la main.
   */
  it('laisse les transactions déjà classées en place', async () => {
    seedTransaction('CARTE 01/03 CARREFOUR MARKET')
    const rule = await create('carrefour')
    await deleteHandler(makeEvent({ method: 'DELETE', id: String(rule.id) }))
    const rows = dbMod.db.select().from(schema.transactions).all()
    expect(rows[0]!.categoryItemCode).toBe('divers-non-categorise')
  })
})
