import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-db-'))
const previousDatabaseUrl = process.env.DATABASE_URL

beforeAll(() => {
  process.env.DATABASE_URL = join(tmpDir, 'test.db')
})

afterAll(async () => {
  const { db } = await import('./client')
  // @ts-expect-error -- accès à la connexion better-sqlite3 sous-jacente pour fermeture propre
  const sqlite = db.$client ?? db.session?.client
  sqlite?.close?.()

  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl

  rmSync(tmpDir, { recursive: true, force: true })
})

describe('db client singleton', () => {
  it('returns the same instance from two separate imports', async () => {
    const a = await import('./client')
    const b = await import('./client')
    expect(a.db).toBe(b.db)
  })
})
