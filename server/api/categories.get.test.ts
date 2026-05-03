import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { H3Event } from 'h3'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-cat-api-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')
type SchemaModule = typeof import('~~/server/db/schema')
type Handler = (event: H3Event) => Promise<unknown>

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
  sqlite.exec(`
    CREATE TABLE category_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      is_variable INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)

  handler = (await import('./categories.get')).default as Handler
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  dbMod.db.delete(schema.categoryDefinitions).run()
})

describe('GET /api/categories', () => {
  it('returns variables first then fixed, alphabetical inside each group', async () => {
    dbMod.db.insert(schema.categoryDefinitions).values([
      { code: 'logement', label: 'Logement', isVariable: false },
      { code: 'shopping', label: 'Shopping', isVariable: true },
      { code: 'abonnements', label: 'Abonnements', isVariable: false },
      { code: 'courses', label: 'Courses', isVariable: true },
    ]).run()

    const result = (await handler({} as H3Event)) as Array<{ code: string, isVariable: boolean }>

    expect(result.map(r => r.code)).toEqual(['courses', 'shopping', 'abonnements', 'logement'])
  })

  it('returns empty array when no categories', async () => {
    const result = (await handler({} as H3Event)) as unknown[]
    expect(result).toEqual([])
  })
})
