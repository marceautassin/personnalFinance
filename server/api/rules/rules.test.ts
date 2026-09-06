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
let applyHandler: Handler
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
  applyHandler = (await import('./[id]/apply.post')).default as Handler
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
  pendingCount?: number
}

const create = (pattern: string, code = 'alimentation-courses') =>
  postHandler(makeEvent({ method: 'POST', body: { pattern, categoryItemCode: code } })) as Promise<Rule>

function seedTransaction(
  label: string,
  opts: { code?: string, isManual?: boolean } = {},
) {
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: 'h', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    openingBalanceCents: 0, closingBalanceCents: 0,
  }).onConflictDoNothing().run()
  dbMod.db.insert(schema.transactions).values({
    statementHash: 'h', transactionDate: '2026-01-05', label,
    amountCents: -100,
    categoryItemCode: opts.code ?? 'divers-non-categorise',
    isManual: opts.isManual ?? false,
  }).run()
}

const codesByLabel = () => Object.fromEntries(
  dbMod.db.select().from(schema.transactions).all().map(t => [t.label, t.categoryItemCode]),
)

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
  it('compte un libellé accentué que le motif désaccentué couvre', async () => {
    seedTransaction('CB CRÈCHE LES PETITS EXEMPLES')
    seedTransaction('VIR SALAIRE ACME')
    await create('crèche', 'loisirs-sport')

    const rules = (await getHandler(makeEvent({ method: 'GET' }))) as Rule[]
    // Un compteur à 0 passerait le bouton « Appliquer » en indisponible, sur une règle qui
    // couvre pourtant une ligne : le chiffre doit dire la même chose que le moteur.
    expect(rules[0]!.matchCount).toBe(1)
  })

  it('compte les transactions déjà en base que la règle couvre', async () => {
    seedTransaction('CARTE 01/03 CARREFOUR MARKET')
    seedTransaction('CARTE 04/03 carrefour city')
    seedTransaction('VIR SALAIRE ACME')
    await create('carrefour')

    const rules = (await getHandler(makeEvent({ method: 'GET' }))) as Rule[]
    expect(rules[0]!.matchCount).toBe(2)
  })

  /**
   * Story 17.8 — les jokers `LIKE` du motif sont neutralisés.
   *
   * Sans échappement, `%` et `_` gardaient leur sens de joker : le compteur de portée d'une
   * règle annonçait des correspondances qui n'en étaient pas, et c'est sur ce chiffre que
   * l'utilisateur décide de créer la règle.
   */
  it('traite `_` comme un caractère littéral, pas comme un joker', async () => {
    seedTransaction('PRLV SPOTIFY_PREMIUM')
    seedTransaction('PRLV SPOTIFYXPREMIUM')
    await create('spotify_premium')

    const rules = (await getHandler(makeEvent({ method: 'GET' }))) as Rule[]
    expect(rules[0]!.matchCount).toBe(1)
  })

  it('traite `%` comme un caractère littéral', async () => {
    seedTransaction('REMISE 20% FIDELITE')
    // Ne correspond QUE si `%` est interprété comme joker : c'est ce que le test interdit.
    seedTransaction('REMISE 20 SUPER FIDELITE')
    await create('20% fidelite')

    const rules = (await getHandler(makeEvent({ method: 'GET' }))) as Rule[]
    expect(rules[0]!.matchCount).toBe(1)
  })

  it('rend un compteur nul quand rien ne correspond', async () => {
    seedTransaction('VIR SALAIRE ACME')
    await create('carrefour')
    const rules = (await getHandler(makeEvent({ method: 'GET' }))) as Rule[]
    expect(rules[0]!.matchCount).toBe(0)
  })

  /**
   * Story 18.9 — l'état est CALCULÉ à chaque lecture. Un drapeau stocké divergerait de la
   * réalité dès l'ingestion suivante.
   */
  describe('état d\'application (story 18.9)', () => {
    const firstRule = async () => ((await getHandler(makeEvent({ method: 'GET' }))) as Rule[])[0]!

    it('annonce les lignes en retard quand l\'historique n\'est pas rangé', async () => {
      seedTransaction('CARTE 01/03 CARREFOUR MARKET')
      seedTransaction('CARTE 04/03 carrefour city')
      await create('carrefour', 'alimentation-courses')

      const rule = await firstRule()
      expect(rule.matchCount).toBe(2)
      expect(rule.pendingCount).toBe(2)
    })

    it('tombe à zéro en retard une fois la règle appliquée', async () => {
      seedTransaction('CARTE 01/03 CARREFOUR MARKET')
      const created = await create('carrefour', 'alimentation-courses')
      await applyHandler(makeEvent({ method: 'POST', id: String(created.id) }))

      const rule = await firstRule()
      expect(rule.matchCount).toBe(1)
      expect(rule.pendingCount).toBe(0)
    })

    it('distingue « aucune ligne couverte » de « à jour »', async () => {
      seedTransaction('VIR SALAIRE ACME')
      await create('carrefour', 'alimentation-courses')

      const rule = await firstRule()
      expect(rule.matchCount).toBe(0)
      expect(rule.pendingCount).toBe(0)
    })

    /** Une ligne manuelle ne sera pas déplacée : l'annoncer « à ranger » promettrait du vent. */
    it('ne compte pas une ligne corrigée à la main comme en retard', async () => {
      seedTransaction('CARTE 01/03 CARREFOUR MARKET', { code: 'loisirs-sport', isManual: true })
      await create('carrefour', 'alimentation-courses')

      const rule = await firstRule()
      expect(rule.matchCount).toBe(1)
      expect(rule.pendingCount).toBe(0)
    })

    /** Le départage vaut aussi pour l'état : une règle plus longue décide du poste d'arrivée. */
    it('ne compte pas en retard une ligne qu\'une règle plus longue range déjà bien', async () => {
      seedTransaction('CARTE 01/03 CARREFOUR MARKET', { code: 'style-habillement' })
      await create('carrefour', 'alimentation-courses')
      await create('carrefour market', 'style-habillement')

      const rules = (await getHandler(makeEvent({ method: 'GET' }))) as Rule[]
      expect(rules.find(r => r.pattern === 'carrefour')!.pendingCount).toBe(0)
    })
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

/**
 * Story 18.2 — ré-application d'une règle à l'historique.
 *
 * Une règle ne valait que pour les relevés futurs : l'utilisateur devait reprendre à la main
 * les lignes que sa propre connaissance couvrait déjà. Sur vingt mois, c'est la corvée que le
 * produit existe pour supprimer.
 */
describe('POST /api/rules/:id/apply', () => {
  const apply = (id: number) =>
    applyHandler(makeEvent({ method: 'POST', id: String(id) })) as Promise<{
      updatedCount: number
      unchangedCount: number
      skippedManualCount: number
    }>

  it('reclasse les lignes déjà en base que le motif couvre', async () => {
    seedTransaction('CARTE 01/03 CARREFOUR MARKET')
    seedTransaction('CARTE 04/03 carrefour city')
    seedTransaction('VIR SALAIRE ACME')
    const rule = await create('carrefour', 'alimentation-courses')

    const result = await apply(rule.id)

    expect(result.updatedCount).toBe(2)
    const codes = codesByLabel()
    expect(codes['CARTE 01/03 CARREFOUR MARKET']).toBe('alimentation-courses')
    expect(codes['CARTE 04/03 carrefour city']).toBe('alimentation-courses')
    // La ligne hors motif ne bouge pas : une application est bornée à ce que la règle couvre.
    expect(codes['VIR SALAIRE ACME']).toBe('divers-non-categorise')
  })

  /**
   * À l'ingestion, une règle écrase le modèle : connaissance contre supposition. Ici elle
   * écraserait un choix EXPLICITE de l'utilisateur, ce qui n'est pas la même chose.
   */
  it('ne touche pas une ligne corrigée à la main', async () => {
    seedTransaction('CARTE 01/03 CARREFOUR MARKET', { code: 'loisirs-sport', isManual: true })
    const rule = await create('carrefour', 'alimentation-courses')

    const result = await apply(rule.id)

    expect(result.updatedCount).toBe(0)
    expect(result.skippedManualCount).toBe(1)
    expect(codesByLabel()['CARTE 01/03 CARREFOUR MARKET']).toBe('loisirs-sport')
  })

  /**
   * Le départage de l'ingestion — motif le plus long gagne — doit tenir ici aussi, sans quoi le
   * classement dépendrait de l'ordre des clics.
   */
  it('laisse le motif le plus long trancher, comme à l\'ingestion', async () => {
    seedTransaction('CARTE 01/03 CARREFOUR MARKET')
    const large = await create('carrefour', 'alimentation-courses')
    await create('carrefour market', 'style-habillement')

    await apply(large.id)

    expect(codesByLabel()['CARTE 01/03 CARREFOUR MARKET']).toBe('style-habillement')
  })

  /** Les lignes reclassées ne sont PAS des corrections manuelles (arbitrage du 2026-09-06). */
  it('ne marque pas les lignes reclassées comme corrigées à la main', async () => {
    seedTransaction('CARTE 01/03 CARREFOUR MARKET')
    const rule = await create('carrefour', 'alimentation-courses')

    await apply(rule.id)

    const rows = dbMod.db.select().from(schema.transactions).all()
    expect(rows.every(r => r.isManual === false)).toBe(true)
  })

  it('rend un rapport nul quand aucune ligne n\'est couverte', async () => {
    seedTransaction('VIR SALAIRE ACME')
    const rule = await create('carrefour')

    await expect(apply(rule.id)).resolves.toEqual({
      updatedCount: 0,
      unchangedCount: 0,
      skippedManualCount: 0,
    })
  })

  it('compte à part les lignes déjà au bon poste', async () => {
    seedTransaction('CARTE 01/03 CARREFOUR MARKET', { code: 'alimentation-courses' })
    const rule = await create('carrefour', 'alimentation-courses')

    await expect(apply(rule.id)).resolves.toMatchObject({ updatedCount: 0, unchangedCount: 1 })
  })

  it('traite `_` du motif comme un caractère littéral', async () => {
    seedTransaction('PRLV SPOTIFY_PREMIUM')
    seedTransaction('PRLV SPOTIFYXPREMIUM')
    const rule = await create('spotify_premium', 'abonnements-streaming')

    await expect(apply(rule.id)).resolves.toMatchObject({ updatedCount: 1 })
    expect(codesByLabel()['PRLV SPOTIFYXPREMIUM']).toBe('divers-non-categorise')
  })

  /**
   * Défaut trouvé en revue le 2026-09-06 : la présélection passait par un `LIKE` SQL sur
   * `LOWER(label)`. Le motif étant stocké SANS accents et `LOWER()` de SQLite étant ASCII,
   * un motif `creche` ne trouvait jamais `CRÈCHE` — zéro ligne reclassée, en silence.
   */
  it('couvre les libellés accentués, que le motif stocké ne porte plus', async () => {
    seedTransaction('CB CRÈCHE LES PETITS EXEMPLES')
    seedTransaction('CB PÉAGE AUTOROUTE A00')
    const creche = await create('crèche', 'loisirs-sport')

    await expect(apply(creche.id)).resolves.toMatchObject({ updatedCount: 1 })
    expect(codesByLabel()['CB CRÈCHE LES PETITS EXEMPLES']).toBe('loisirs-sport')
  })

  it('refuse un identifiant inconnu ou invalide', async () => {
    await expect(apply(9999)).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      applyHandler(makeEvent({ method: 'POST', id: 'abc' })),
    ).rejects.toMatchObject({ statusCode: 422 })
  })
})
