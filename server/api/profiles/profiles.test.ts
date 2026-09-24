import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ne } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { DEFAULT_REFERENTIAL } from '~~/shared/constants/default-referential'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

/**
 * `seedReferential` réel par défaut — remplacé UNE FOIS par un échec forcé (test d'atomicité).
 * `importOriginal` charge le vrai module pour que toutes les autres routes de ce fichier
 * seedent réellement le référentiel.
 */
vi.mock('~~/server/utils/seed-referential', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/seed-referential')>()
  return { ...actual, seedReferential: vi.fn(actual.seedReferential) }
})

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-profiles-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type SeedModule = typeof import('~~/server/utils/seed-referential')
type Handler = (event: H3Event) => Promise<unknown>

let dbMod: DbModule
let schema: SchemaModule
let seedReferential: SeedModule['seedReferential']
let getHandler: Handler
let postHandler: Handler
let currentGetHandler: Handler
let currentPutHandler: Handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')
  ;({ seedReferential } = await import('~~/server/utils/seed-referential'))

  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(TEST_SCHEMA_DDL)
  sqlite.exec(TEST_REFERENTIAL_DDL)

  getHandler = (await import('./index.get')).default as Handler
  postHandler = (await import('./index.post')).default as Handler
  currentGetHandler = (await import('./current.get')).default as Handler
  currentPutHandler = (await import('./current.put')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(seedReferential).mockClear()
  // Le profil 1 (« marceau », seedé par TEST_REFERENTIAL_DDL) survit d'un test à l'autre : il
  // porte le repli « exactement un profil » qu'utilisent les scénarios `current.get`/`.put`.
  // Seuls les profils créés PENDANT les tests sont nettoyés.
  dbMod.db.delete(schema.categoryItems).where(ne(schema.categoryItems.profileId, 1)).run()
  dbMod.db.delete(schema.categoryGroups).where(ne(schema.categoryGroups.profileId, 1)).run()
  dbMod.db.delete(schema.profiles).where(ne(schema.profiles.id, 1)).run()
})

function makeEvent(opts: { method: string, body?: unknown, cookie?: string } = { method: 'GET' }): H3Event {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.cookie !== undefined) headers.cookie = `pf_profile=${opts.cookie}`
  return {
    _requestBody: opts.body === undefined ? '' : JSON.stringify(opts.body),
    node: { req: { headers, method: opts.method }, res: { statusCode: 200, setHeader: vi.fn(), getHeader: vi.fn() } },
    path: '/api/profiles',
    method: opts.method,
    context: {},
  } as unknown as H3Event
}

interface Profile { id: number, name: string, defaultBank: string }

const create = (name: string, defaultBank = 'boursorama') =>
  postHandler(makeEvent({ method: 'POST', body: { name, defaultBank } })) as Promise<Profile>

describe('POST /api/profiles', () => {
  it('crée le profil AVEC le référentiel initial, dans une seule transaction (AC 1)', async () => {
    const profile = await create('Camille')

    expect(profile).toMatchObject({ name: 'Camille', defaultBank: 'boursorama' })

    const groups = dbMod.db.select().from(schema.categoryGroups).all()
      .filter(g => g.profileId === profile.id)
    const items = dbMod.db.select().from(schema.categoryItems).all()
      .filter(i => i.profileId === profile.id)
    expect(groups.length).toBe(DEFAULT_REFERENTIAL.length)
    expect(items.length).toBe(DEFAULT_REFERENTIAL.reduce((n, g) => n + g.items.length, 0))

    // Aucun relevé, transaction ni règle : un profil neuf ne porte que le référentiel.
    const statements = dbMod.db.select().from(schema.bankStatements).all()
      .filter(s => s.profileId === profile.id)
    expect(statements).toEqual([])
  })

  it('refuse un nom déjà pris, même écrit différemment (AC 2)', async () => {
    await create('Camille')
    await expect(create('  camille  ')).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: ApiErrorCode.ProfileNameTaken,
    })

    // Aucune ligne ajoutée par la tentative refusée.
    const profiles = dbMod.db.select().from(schema.profiles).all()
    expect(profiles.filter(p => p.name.toLowerCase().trim() === 'camille').length).toBe(1)
  })

  it('422 sur un nom vide ou une banque inconnue', async () => {
    await expect(create('')).rejects.toMatchObject({ statusCode: 422 })
    await expect(create('Test', 'inconnue')).rejects.toMatchObject({ statusCode: 422 })
  })

  /**
   * Atomicité (D39, AR36) : un échec du seed — ici simulé — ne doit laisser AUCUN profil à
   * moitié créé. `db.transaction` étant synchrone (better-sqlite3), l'exception fait rollback
   * l'INSERT du profil comme celui du référentiel.
   */
  it('ne crée aucun profil si le seed échoue (atomicité)', async () => {
    vi.mocked(seedReferential).mockImplementationOnce(() => {
      throw new Error('seed en échec, simulé')
    })

    await expect(create('Atomicite')).rejects.toThrow('seed en échec, simulé')

    const profiles = dbMod.db.select().from(schema.profiles).all()
    expect(profiles.some(p => p.name === 'Atomicite')).toBe(false)
  })
})

describe('GET /api/profiles', () => {
  it('rend les profils triés par nom', async () => {
    await create('Zoe')
    await create('Anna')

    const profiles = (await getHandler(makeEvent())) as Profile[]
    expect(profiles.map(p => p.name)).toEqual(['Anna', 'marceau', 'Zoe'])
  })
})

describe('GET /api/profiles/current', () => {
  /**
   * Réponse dans une enveloppe `{ profile }` (revue de la story 27.3, BLOQUANT 2) : h3
   * sérialise un handler qui renvoie `null` NU en `204 sans corps`, que le client ne distingue
   * jamais de « rien encore reçu ». Toujours un objet JSON, même sans profil courant.
   */
  it('rend `{ profile: null }` sans cookie, avec plusieurs profils (AC 7)', async () => {
    await create('Camille')
    await expect(currentGetHandler(makeEvent())).resolves.toEqual({ profile: null })
  })

  it('repli sur l\'unique profil, sans cookie (cohérence 27.2)', async () => {
    await expect(currentGetHandler(makeEvent())).resolves.toMatchObject({ profile: { id: 1, name: 'marceau' } })
  })

  it('rend `{ profile: null }` sur un cookie désignant un profil inexistant, sans lever (AC 7)', async () => {
    await expect(currentGetHandler(makeEvent({ method: 'GET', cookie: '9999' }))).resolves.toEqual({ profile: null })
  })
})

describe('PUT /api/profiles/current', () => {
  it('bascule et pose le cookie httpOnly SameSite=Strict (AC 3)', async () => {
    const profile = await create('Camille')
    const setHeader = vi.fn()
    const event = {
      _requestBody: JSON.stringify({ profileId: profile.id }),
      node: { req: { headers: { 'content-type': 'application/json' }, method: 'PUT' }, res: { statusCode: 200, setHeader, getHeader: vi.fn() } },
      path: '/api/profiles/current',
      method: 'PUT',
      context: {},
    } as unknown as H3Event

    const result = await currentPutHandler(event) as Profile
    expect(result).toMatchObject({ id: profile.id, name: 'Camille' })

    expect(setHeader).toHaveBeenCalled()
    const [headerName, headerValue] = setHeader.mock.calls[0] as [string, string | string[]]
    expect(headerName.toLowerCase()).toBe('set-cookie')
    const cookieStr = Array.isArray(headerValue) ? headerValue.join(';') : headerValue
    expect(cookieStr).toContain('HttpOnly')
    expect(cookieStr).toContain('SameSite=Strict')
  })

  it('404 sur un profil inconnu', async () => {
    await expect(
      currentPutHandler(makeEvent({ method: 'PUT', body: { profileId: 9999 } })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('422 sur un payload invalide', async () => {
    await expect(
      currentPutHandler(makeEvent({ method: 'PUT', body: { profileId: 'abc' } })),
    ).rejects.toMatchObject({ statusCode: 422 })
  })
})
