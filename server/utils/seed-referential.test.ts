import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { TEST_SCHEMA_DDL } from '~~/tests/fixtures/test-schema'

/**
 * Story 27.1 (D39) — `seedReferential` sème un profil sans rubrique, et ne sème JAMAIS un
 * profil qui en a déjà (comportement anti-résurrection, revue du 2026-09-05).
 */
const tmpDir = mkdtempSync(join(tmpdir(), 'pf-seed-referential-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type SeedModule = typeof import('./seed-referential')

let dbMod: DbModule
let schema: SchemaModule
let seedReferential: SeedModule['seedReferential']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')
  schema = await import('~~/server/db/schema')
  ;({ seedReferential } = await import('./seed-referential'))

  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(TEST_SCHEMA_DDL)
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.transactions).run()
  dbMod.db.delete(schema.classificationRules).run()
  dbMod.db.delete(schema.bankStatements).run()
  dbMod.db.delete(schema.categoryItems).run()
  dbMod.db.delete(schema.categoryGroups).run()
  dbMod.db.delete(schema.profiles).run()
})

function insertProfile(name: string): number {
  return dbMod.db.insert(schema.profiles).values({ name, defaultBank: 'boursorama' })
    .returning({ id: schema.profiles.id }).get().id
}

describe('seedReferential', () => {
  it('sème le référentiel complet pour un profil sans rubrique', () => {
    const profileId = insertProfile('marceau')

    const { groupsInserted, itemsInserted } = seedReferential(dbMod.db, profileId)

    expect(groupsInserted).toBeGreaterThan(0)
    expect(itemsInserted).toBeGreaterThan(0)
    const groups = dbMod.db.select().from(schema.categoryGroups).all()
    expect(groups.every(g => g.profileId === profileId)).toBe(true)
    const items = dbMod.db.select().from(schema.categoryItems).all()
    expect(items.length).toBe(itemsInserted)
    expect(items.every(i => i.profileId === profileId)).toBe(true)
  })

  it('ne sème JAMAIS un profil qui a déjà au moins une rubrique (anti-résurrection)', () => {
    const profileId = insertProfile('marceau')
    seedReferential(dbMod.db, profileId)

    // L'utilisateur vide puis supprime la quasi-totalité du référentiel par défaut : le
    // prochain démarrage ne doit pas le ressusciter. Seule une rubrique survit, ce qui suffit
    // à prouver que ce n'est pas l'ABSENCE TOTALE de rubrique qui redéclencherait le seed.
    const groups = dbMod.db.select().from(schema.categoryGroups).all()
    const survivor = groups[0]!
    dbMod.db.delete(schema.categoryItems).run()
    for (const g of groups.slice(1)) {
      dbMod.db.delete(schema.categoryGroups).where(eq(schema.categoryGroups.id, g.id)).run()
    }
    expect(dbMod.db.select().from(schema.categoryGroups).all()).toEqual([survivor])

    const second = seedReferential(dbMod.db, profileId)
    expect(second).toEqual({ groupsInserted: 0, itemsInserted: 0 })
    expect(dbMod.db.select().from(schema.categoryGroups).all()).toEqual([survivor])
  })

  it('sème chaque profil indépendamment', () => {
    const marceau = insertProfile('marceau')
    const second = insertProfile('second')

    const r1 = seedReferential(dbMod.db, marceau)
    const r2 = seedReferential(dbMod.db, second)

    expect(r1.groupsInserted).toBe(r2.groupsInserted)
    expect(r1.itemsInserted).toBe(r2.itemsInserted)

    const groupsByProfile = new Map<number, number>()
    for (const g of dbMod.db.select().from(schema.categoryGroups).all()) {
      groupsByProfile.set(g.profileId, (groupsByProfile.get(g.profileId) ?? 0) + 1)
    }
    expect(groupsByProfile.get(marceau)).toBe(r1.groupsInserted)
    expect(groupsByProfile.get(second)).toBe(r2.groupsInserted)

    // Un profil déjà peuplé n'est pas resemé au second appel.
    expect(seedReferential(dbMod.db, marceau)).toEqual({ groupsInserted: 0, itemsInserted: 0 })
  })
})
