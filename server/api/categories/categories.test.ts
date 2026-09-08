import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-categories-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
let getHandler: Handler
let groupPost: Handler
let groupPatch: Handler
let groupDelete: Handler
let itemPost: Handler
let itemPatch: Handler
let itemDelete: Handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')

  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(TEST_SCHEMA_DDL)

  getHandler = (await import('./index.get')).default as Handler
  groupPost = (await import('./groups/index.post')).default as Handler
  groupPatch = (await import('./groups/[code].patch')).default as Handler
  groupDelete = (await import('./groups/[code].delete')).default as Handler
  itemPost = (await import('./items/index.post')).default as Handler
  itemPatch = (await import('./items/[code].patch')).default as Handler
  itemDelete = (await import('./items/[code].delete')).default as Handler
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
  dbMod.db.delete(schema.categoryItems).run()
  dbMod.db.delete(schema.categoryGroups).run()
  sqlite.exec(TEST_REFERENTIAL_DDL)
})

function makeEvent(opts: { method: string, body?: unknown, code?: string }): H3Event {
  const rawBody = opts.body === undefined ? '' : JSON.stringify(opts.body)
  const res = { statusCode: 200 }
  const req = { headers: { 'content-type': 'application/json' }, method: opts.method }
  return {
    _requestBody: rawBody,
    node: { req, res },
    path: '/api/categories',
    method: opts.method,
    context: { params: opts.code ? { code: opts.code } : {} },
  } as unknown as H3Event
}

interface Item { code: string, groupCode: string, label: string, nature: string, transactionCount: number }
interface Group { code: string, label: string, position: number, items: Item[] }

function seedTransaction(itemCode: string) {
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: 'h', periodStart: '2026-01-01', periodEnd: '2026-01-31',
    openingBalanceCents: 0, closingBalanceCents: -100,
  }).onConflictDoNothing().run()
  dbMod.db.insert(schema.transactions).values({
    statementHash: 'h', transactionDate: '2026-01-01', label: 'x',
    amountCents: -100, categoryItemCode: itemCode,
  }).run()
}

/** Statut HTTP posé par le handler via `setResponseStatus` (défaut 200 si non touché). */
function statusOf(event: H3Event): number {
  return (event as unknown as { node: { res: { statusCode: number } } }).node.res.statusCode
}

async function expectError(promise: Promise<unknown>, code: string, status: number) {
  await expect(promise).rejects.toMatchObject({ statusCode: status, statusMessage: code })
}

const tree = () => getHandler(makeEvent({ method: 'GET' })) as Promise<Group[]>

describe('GET /api/categories', () => {
  it('renvoie les rubriques avec leurs postes et le compteur de transactions', async () => {
    seedTransaction('alimentation-courses')
    const groups = await tree()

    const alimentation = groups.find(g => g.code === 'alimentation')!
    expect(alimentation.label).toBe('Alimentation')
    expect(alimentation.items.map(i => i.code)).toEqual([
      'alimentation-courses',
      'alimentation-restaurant',
    ])
    expect(alimentation.items[0]!.transactionCount).toBe(1)
    expect(alimentation.items[1]!.transactionCount).toBe(0)
  })

  it('porte la nature sur le poste, pas sur la rubrique', async () => {
    const groups = await tree()
    const natures = groups.flatMap(g => g.items.map(i => i.nature))
    expect(new Set(natures)).toEqual(new Set(['expense', 'income', 'internal_transfer']))
    expect(groups[0]).not.toHaveProperty('nature')
  })

  it('trie rubriques et postes par position', async () => {
    const groups = await tree()
    expect(groups.map(g => g.code)).toEqual([
      'alimentation', 'transport', 'loisirs', 'abonnements', 'style', 'revenus', 'internes', 'divers',
      'compte-joint',
    ])
  })
})

describe('POST /api/categories/groups', () => {
  it('slugifie le libellé en code et crée la rubrique vide en dernière position', async () => {
    const event = makeEvent({ method: 'POST', body: { label: 'Animaux' } })
    const created = (await groupPost(event)) as Group
    expect(created.code).toBe('animaux')
    expect(created.items).toEqual([])
    // Neuvième rubrique du référentiel de test depuis l'ajout de « Compte joint » (story 21.1).
    expect(created.position).toBe(9)
    expect(statusOf(event)).toBe(201)
  })

  /**
   * Le code de rubrique préfixe celui de ses postes : le laisser occuper les 32 caractères
   * d'un code rendait la rubrique STÉRILE — toute création de poste y échouait en 422, et le
   * code étant immuable, c'était sans retour (revue du 2026-09-05).
   */
  it('borne le code de rubrique pour laisser la place aux codes de poste', async () => {
    const created = (await groupPost(makeEvent({
      method: 'POST',
      body: { label: 'Abonnements et prelevements divers' },
    }))) as Group
    expect(created.code.length).toBeLessThanOrEqual(16)

    const item = (await itemPost(makeEvent({
      method: 'POST',
      body: { groupCode: created.code, label: 'Telephonie mobile', nature: 'expense' },
    }))) as Item
    expect(item.code.length).toBeLessThanOrEqual(32)
    expect(item.code.startsWith(`${created.code}-`)).toBe(true)
    expect(item.code.replace(`${created.code}-`, '').length).toBeGreaterThan(4)
  })

  it('refuse un libellé déjà pris, à la casse et aux accents près', async () => {
    await expectError(
      groupPost(makeEvent({ method: 'POST', body: { label: '  aLIMENTATION ' } })),
      ApiErrorCode.CategoryLabelTaken,
      409,
    )
  })

  it('refuse un libellé qui ne produit aucun code', async () => {
    await expectError(
      groupPost(makeEvent({ method: 'POST', body: { label: '!!!' } })),
      ApiErrorCode.ValidationFailed,
      422,
    )
  })
})

describe('PATCH /api/categories/groups/[code]', () => {
  it('renomme sans toucher au code ni aux postes rattachés', async () => {
    await groupPatch(makeEvent({ method: 'PATCH', code: 'alimentation', body: { label: 'Nourriture' } }))
    const groups = await tree()
    const g = groups.find(x => x.code === 'alimentation')!
    expect(g.label).toBe('Nourriture')
    expect(g.items).toHaveLength(2)
  })

  it('reste idempotent quand on renomme vers son propre libellé', async () => {
    await expect(
      groupPatch(makeEvent({ method: 'PATCH', code: 'alimentation', body: { label: 'Alimentation' } })),
    ).resolves.toMatchObject({ label: 'Alimentation' })
  })

  it('404 sur une rubrique inconnue', async () => {
    await expectError(
      groupPatch(makeEvent({ method: 'PATCH', code: 'inconnue', body: { label: 'X' } })),
      ApiErrorCode.GroupNotFound,
      404,
    )
  })
})

describe('DELETE /api/categories/groups/[code]', () => {
  it('supprime une rubrique vide', async () => {
    await groupPost(makeEvent({ method: 'POST', body: { label: 'Animaux' } }))
    const event = makeEvent({ method: 'DELETE', code: 'animaux' })
    await groupDelete(event)
    expect(statusOf(event)).toBe(204)
    expect((await tree()).map(g => g.code)).not.toContain('animaux')
  })

  it('refuse une rubrique peuplée, en indiquant le nombre de postes', async () => {
    await expect(
      groupDelete(makeEvent({ method: 'DELETE', code: 'alimentation' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: ApiErrorCode.GroupNotEmpty,
      data: { itemCount: 2 },
    })
  })

  it('refuse une rubrique système même vide', async () => {
    dbMod.db.delete(schema.categoryItems).run()
    await expectError(
      groupDelete(makeEvent({ method: 'DELETE', code: 'internes' })),
      ApiErrorCode.CategoryProtected,
      409,
    )
  })
})

describe('POST /api/categories/items', () => {
  it('préfixe le code par la rubrique et démarre à 0 transaction', async () => {
    const event = makeEvent({
      method: 'POST',
      body: { groupCode: 'alimentation', label: 'Boulangerie', nature: 'expense' },
    })
    const created = (await itemPost(event)) as Item
    expect(created.code).toBe('alimentation-boulangerie')
    expect(created.transactionCount).toBe(0)
    expect(statusOf(event)).toBe(201)
  })

  it('accepte le MÊME libellé sous une autre rubrique (FR19)', async () => {
    const created = (await itemPost(makeEvent({
      method: 'POST',
      body: { groupCode: 'divers', label: 'Restaurant', nature: 'expense' },
    }))) as Item
    expect(created.code).toBe('divers-restaurant')

    const groups = await tree()
    const labels = groups.flatMap(g => g.items.filter(i => i.label === 'Restaurant').map(i => i.code))
    expect(labels).toEqual(['alimentation-restaurant', 'divers-restaurant'])
  })

  it('refuse un doublon de libellé DANS la même rubrique', async () => {
    await expectError(
      itemPost(makeEvent({
        method: 'POST',
        body: { groupCode: 'alimentation', label: 'restaurant', nature: 'expense' },
      })),
      ApiErrorCode.CategoryLabelTaken,
      409,
    )
  })

  it('404 sur une rubrique inconnue', async () => {
    await expectError(
      itemPost(makeEvent({
        method: 'POST',
        body: { groupCode: 'fantome', label: 'X', nature: 'expense' },
      })),
      ApiErrorCode.GroupNotFound,
      404,
    )
  })

  it('exige une nature (FR17)', async () => {
    await expectError(
      itemPost(makeEvent({ method: 'POST', body: { groupCode: 'alimentation', label: 'X' } })),
      ApiErrorCode.ValidationFailed,
      422,
    )
  })

  it('rejette une nature hors énumération', async () => {
    await expectError(
      itemPost(makeEvent({
        method: 'POST',
        body: { groupCode: 'alimentation', label: 'X', nature: 'depense' },
      })),
      ApiErrorCode.ValidationFailed,
      422,
    )
  })

  it('borne le code complet à 32 caractères, suffixe de collision compris', async () => {
    const group = (await groupPost(makeEvent({
      method: 'POST', body: { label: 'Frais professionnels' },
    }))) as Group
    const body = {
      groupCode: group.code,
      label: 'Telephonie mobile et internet',
      nature: 'expense',
    }
    const first = (await itemPost(makeEvent({ method: 'POST', body }))) as Item
    expect(first.code.length).toBeLessThanOrEqual(32)

    // Second poste au même libellé sous une AUTRE rubrique, puis collision réelle dans
    // celle-ci via un libellé qui slugifie pareil : le suffixe doit tenir dans la borne.
    const second = (await itemPost(makeEvent({
      method: 'POST',
      body: { ...body, label: 'Telephonie mobile et internet !' },
    }))) as Item
    expect(second.code.length).toBeLessThanOrEqual(32)
    expect(second.code).not.toBe(first.code)
    expect(second.code.startsWith(`${group.code}-`)).toBe(true)
  })
})

describe('PATCH /api/categories/items/[code]', () => {
  it('change la nature du poste, ce qui reclasse toutes ses transactions d\'un coup', async () => {
    seedTransaction('alimentation-courses')
    const updated = (await itemPatch(makeEvent({
      method: 'PATCH', code: 'alimentation-courses', body: { nature: 'internal_transfer' },
    }))) as Item
    expect(updated.nature).toBe('internal_transfer')
    expect(updated.transactionCount).toBe(1)
  })

  it('renomme sans changer la nature', async () => {
    const updated = (await itemPatch(makeEvent({
      method: 'PATCH', code: 'alimentation-courses', body: { label: 'Supermarché' },
    }))) as Item
    expect(updated).toMatchObject({ label: 'Supermarché', nature: 'expense' })
  })

  it('refuse un patch vide', async () => {
    await expectError(
      itemPatch(makeEvent({ method: 'PATCH', code: 'alimentation-courses', body: {} })),
      ApiErrorCode.ValidationFailed,
      422,
    )
  })

  it('refuse un libellé déjà pris dans la même rubrique', async () => {
    await expectError(
      itemPatch(makeEvent({
        method: 'PATCH', code: 'alimentation-courses', body: { label: 'Restaurant' },
      })),
      ApiErrorCode.CategoryLabelTaken,
      409,
    )
  })
})

describe('DELETE /api/categories/items/[code]', () => {
  it('supprime un poste non référencé', async () => {
    const event = makeEvent({ method: 'DELETE', code: 'alimentation-restaurant' })
    await itemDelete(event)
    expect(statusOf(event)).toBe(204)
  })

  it('refuse un poste référencé, en indiquant le nombre de transactions', async () => {
    seedTransaction('alimentation-courses')
    await expect(
      itemDelete(makeEvent({ method: 'DELETE', code: 'alimentation-courses' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: ApiErrorCode.CategoryInUse,
      data: { transactionCount: 1 },
    })
  })

  it('refuse le poste de repli, même sans transaction', async () => {
    await expectError(
      itemDelete(makeEvent({ method: 'DELETE', code: 'divers-non-categorise' })),
      ApiErrorCode.CategoryProtected,
      409,
    )
  })

  /*
   * Les postes du compte joint (story 21.1) ont besoin de cette protection PLUS que les autres :
   * « Part remboursée » est CALCULÉ, il ne porte jamais de ligne, donc le garde-fou habituel —
   * « on ne supprime pas un poste qui contient des transactions » — ne le protège de rien. Sa
   * suppression faisait disparaître silencieusement la moitié coupée de tous les agrégats, puis
   * empêchait l'application de redémarrer (revue du 2026-09-08).
   */
  it('refuse les postes du compte joint, qui ne portent aucune ligne', async () => {
    for (const code of ['compte-joint-part-remboursee', 'internes-virement-joint']) {
      await expectError(
        itemDelete(makeEvent({ method: 'DELETE', code })),
        ApiErrorCode.CategoryProtected,
        409,
      )
    }
  })

  it('refuse de changer la nature des postes du compte joint', async () => {
    for (const code of ['compte-joint-part-remboursee', 'internes-virement-joint']) {
      await expectError(
        itemPatch(makeEvent({ method: 'PATCH', code, body: { nature: 'income' } })),
        ApiErrorCode.CategoryProtected,
        409,
      )
    }
  })

  it('la FK ON DELETE RESTRICT bloque aussi une suppression directe en base', () => {
    seedTransaction('alimentation-courses')
    sqlite.exec('PRAGMA foreign_keys = ON')
    expect(() =>
      sqlite.exec('DELETE FROM category_items WHERE code = \'alimentation-courses\''),
    ).toThrow(/FOREIGN KEY/i)
  })
})
