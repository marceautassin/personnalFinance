import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-current-profile-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type RequireProfile = (event: H3Event) => number

let dbMod: DbModule
let requireProfile: RequireProfile
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')

  // @ts-expect-error -- accès interne drizzle pour DDL de test
  sqlite = dbMod.db.$client ?? dbMod.db.session?.client
  sqlite.exec(TEST_SCHEMA_DDL)
  sqlite.exec(TEST_REFERENTIAL_DDL)

  requireProfile = (await import('./current-profile')).requireProfile as unknown as RequireProfile
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

/** `H3Event` minimal, portant (ou non) le cookie `pf_profile` — `getCookie` lit `node.req.headers.cookie`. */
function makeEvent(cookie?: string): H3Event {
  const headers: Record<string, string> = {}
  if (cookie !== undefined) headers.cookie = `pf_profile=${cookie}`
  return {
    node: { req: { headers }, res: {} },
    path: '/api/analysis',
    method: 'GET',
    context: {},
  } as unknown as H3Event
}

// `TEST_REFERENTIAL_DDL` sème le profil 1 (`marceau`). Un second profil est ajouté ligne par
// ligne, en SQL direct, dans les scénarios qui en ont besoin — l'écran de création arrive en
// 27.3, la story ne dépend pas de la suivante.
function seedSecondProfile(): number {
  const result = sqlite
    .prepare('INSERT INTO profiles (name, default_bank) VALUES (?, ?)')
    .run('conjoint', 'boursorama')
  return Number(result.lastInsertRowid)
}

describe('requireProfile', () => {
  it('cookie valide : renvoie le profil désigné', () => {
    expect(requireProfile(makeEvent('1'))).toBe(1)
  })

  it('absent avec un seul profil en base : repli sur ce profil (AC 10)', () => {
    expect(requireProfile(makeEvent(undefined))).toBe(1)
  })

  it('absent avec deux profils en base : 400 profile_required, pas de repli', () => {
    const secondId = seedSecondProfile()
    try {
      expect(() => requireProfile(makeEvent(undefined))).toThrowError(
        expect.objectContaining({ statusCode: 400, statusMessage: ApiErrorCode.ProfileRequired }),
      )
    }
    finally {
      sqlite.prepare('DELETE FROM profiles WHERE id = ?').run(secondId)
    }
  })

  it('cookie désignant un profil inexistant : 400 profile_required, jamais de repli silencieux', () => {
    expect(() => requireProfile(makeEvent('999'))).toThrowError(
      expect.objectContaining({ statusCode: 400, statusMessage: ApiErrorCode.ProfileRequired }),
    )
  })

  it('cookie non entier : 400 profile_required', () => {
    expect(() => requireProfile(makeEvent('abc'))).toThrowError(
      expect.objectContaining({ statusCode: 400, statusMessage: ApiErrorCode.ProfileRequired }),
    )
  })

  it('cookie négatif ou nul : 400 profile_required (pas un identifiant valide)', () => {
    expect(() => requireProfile(makeEvent('0'))).toThrowError(
      expect.objectContaining({ statusCode: 400, statusMessage: ApiErrorCode.ProfileRequired }),
    )
    expect(() => requireProfile(makeEvent('-1'))).toThrowError(
      expect.objectContaining({ statusCode: 400, statusMessage: ApiErrorCode.ProfileRequired }),
    )
  })
})
