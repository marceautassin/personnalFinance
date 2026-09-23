import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-settlements-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
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

  postHandler = (await import('./index.post')).default as Handler
  deleteHandler = (await import('./[id].delete')).default as unknown as Handler
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
  dbMod.db.delete(schema.settlementGroups).run()
})

function makeEvent(opts: { method: string, body?: unknown, id?: string, profileId?: number }): H3Event {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.profileId !== undefined) headers.cookie = `pf_profile=${opts.profileId}`
  return {
    _requestBody: opts.body === undefined ? '' : JSON.stringify(opts.body),
    node: { req: { headers, method: opts.method }, res: { statusCode: 200 } },
    path: '/api/settlements',
    method: opts.method,
    context: { params: opts.id ? { id: opts.id } : {} },
  } as unknown as H3Event
}

/** Résout un code de poste vers son id, dans le profil de test (story 27.1, D37). */
function itemId(code: string, profileId = 1): number {
  return (sqlite.prepare('SELECT id FROM category_items WHERE code = ? AND profile_id = ?').get(code, profileId) as { id: number }).id
}

function seedStatement(hash: string, profileId = 1) {
  dbMod.db.insert(schema.bankStatements).values({
    hashSha256: hash,
    profileId,
    bank: 'boursorama',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    openingBalanceCents: 0,
    closingBalanceCents: 0,
  }).onConflictDoNothing().run()
}

function seedTransaction(hash: string, amountCents: number, profileId = 1): number {
  seedStatement(hash, profileId)
  const result = dbMod.db.insert(schema.transactions).values({
    statementHash: hash,
    transactionDate: '2026-01-05',
    label: 'x',
    amountCents,
    categoryItemId: itemId('alimentation-courses', profileId),
  }).run()
  return Number(result.lastInsertRowid)
}

describe('POST /api/settlements', () => {
  it('réunit deux lignes du même profil', async () => {
    const a = seedTransaction('h1', -1000)
    const b = seedTransaction('h1', 1000)

    const group = (await postHandler(makeEvent({
      method: 'POST',
      body: { label: 'avance', transactionIds: [a, b] },
      profileId: 1,
    }))) as { id: number, label: string }

    expect(group.label).toBe('avance')
    const rows = dbMod.db.select().from(schema.transactions).all()
    expect(rows.every(r => r.settlementGroupId === group.id)).toBe(true)
  })

  /**
   * AC 4 (story 27.2) : un groupe qui mélange une ligne d'un AUTRE profil est refusé, avec la
   * MÊME erreur qu'un identifiant inexistant — jamais une erreur distincte qui confirmerait
   * l'existence de la ligne chez l'autre profil.
   */
  it('refuse un groupe dont une ligne appartient à un autre profil, comme un id inexistant', async () => {
    const other = sqlite
      .prepare('INSERT INTO profiles (name, default_bank) VALUES (?, ?)')
      .run('conjoint', 'boursorama')
    const otherProfileId = Number(other.lastInsertRowid)
    const otherGroup = sqlite
      .prepare('INSERT INTO category_groups (profile_id, code, label, position) VALUES (?, ?, ?, 0)')
      .run(otherProfileId, 'alimentation', 'Alimentation (B)')
    sqlite
      .prepare('INSERT INTO category_items (profile_id, code, group_id, label, nature, position) VALUES (?, ?, ?, ?, ?, 0)')
      .run(otherProfileId, 'alimentation-courses', Number(otherGroup.lastInsertRowid), 'Courses (B)', 'expense')

    const a = seedTransaction('h1', -1000, 1)
    const b = seedTransaction('hb', 1000, otherProfileId)

    await expect(
      postHandler(makeEvent({
        method: 'POST',
        body: { label: 'avance', transactionIds: [a, b] },
        profileId: 1,
      })),
    ).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: ApiErrorCode.NotFound,
      data: { missing: [b] },
    })

    // Aucun des deux groupes n'a été créé : ni la ligne de A ni celle de B ne portent de groupe.
    const rows = dbMod.db.select().from(schema.transactions).all()
    expect(rows.every(r => r.settlementGroupId === null)).toBe(true)

    // Pas de nettoyage du profil B ici : `bank_statements` le référence sans cascade, et sa
    // suppression lèverait une violation de clé étrangère (comme en production). Les profils
    // de test s'accumulent pour le reste du fichier — chaque test qui suit passe donc son
    // `profileId` explicitement, comme le ferait un cookie posé par l'écran de 27.3.
  })
})

describe('DELETE /api/settlements/:id', () => {
  it('404 : un groupe du profil A n\'existe pas pour B', async () => {
    const a = seedTransaction('h1', -1000)
    const b = seedTransaction('h1', 1000)
    const group = (await postHandler(makeEvent({
      method: 'POST',
      body: { label: 'avance', transactionIds: [a, b] },
      profileId: 1,
    }))) as { id: number }

    const other = sqlite
      .prepare('INSERT INTO profiles (name, default_bank) VALUES (?, ?)')
      .run('conjoint-2', 'boursorama')
    const otherProfileId = Number(other.lastInsertRowid)

    // `[id].delete.ts` n'est pas `async` : un throw survient de façon SYNCHRONE, pas dans une
    // Promise rejetée — `.rejects` ne s'applique donc pas ici, contrairement aux handlers async.
    expect(() =>
      deleteHandler(makeEvent({ method: 'DELETE', id: String(group.id), profileId: otherProfileId })),
    ).toThrowError(expect.objectContaining({ statusCode: 404, statusMessage: ApiErrorCode.NotFound }))

    // Le groupe de A existe toujours, ses lignes toujours rattachées.
    const rows = dbMod.db.select().from(schema.transactions).all()
    expect(rows.every(r => r.settlementGroupId === group.id)).toBe(true)
  })
})
