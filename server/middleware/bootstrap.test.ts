import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'pf-bootstrap-'))
const previousDatabaseUrl = process.env.DATABASE_URL
process.env.DATABASE_URL = join(tmpDir, 'test.db')

type DbModule = typeof import('~~/server/db/client')

let dbMod: DbModule
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite: any

beforeAll(async () => {
  dbMod = await import('~~/server/db/client')

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
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_hash TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      label TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category_code TEXT NOT NULL,
      is_manual INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `)
})

afterAll(() => {
  sqlite?.close?.()
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('assertSchemaUpToDate — refus d\'un schéma périmé', () => {
  /**
   * La sonde vérifiait la PRÉSENCE des tables de dette. Depuis la suppression du périmètre
   * forecast (2026-09-04), elle vérifie l'INVERSE : une base antérieure, porteuse de ces
   * tables, doit être refusée au démarrage plutôt que de laisser diverger le schéma déclaré
   * et le schéma réel.
   */
  it('accepte un schéma à jour', async () => {
    const mod = await import('./0.bootstrap')
    expect(() => mod.assertSchemaUpToDate()).not.toThrow()
  })

  it('refuse une base portant encore les tables du forecast', async () => {
    const mod = await import('./0.bootstrap')
    sqlite.exec('CREATE TABLE debts (id INTEGER PRIMARY KEY AUTOINCREMENT, creditor TEXT NOT NULL)')
    expect(() => mod.assertSchemaUpToDate()).toThrow(/schéma de base périmé/i)
    sqlite.exec('DROP TABLE debts')
    expect(() => mod.assertSchemaUpToDate()).not.toThrow()
  })

  it('refuse une table transactions portant encore les colonnes de dette', async () => {
    const mod = await import('./0.bootstrap')
    sqlite.exec('ALTER TABLE transactions RENAME TO transactions_backup')
    sqlite.exec(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        statement_hash TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        label TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        category_code TEXT NOT NULL,
        is_manual INTEGER NOT NULL DEFAULT 0,
        debt_id INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `)
    expect(() => mod.assertSchemaUpToDate()).toThrow(/schéma de base périmé/i)
    sqlite.exec('DROP TABLE transactions')
    sqlite.exec('ALTER TABLE transactions_backup RENAME TO transactions')
    expect(() => mod.assertSchemaUpToDate()).not.toThrow()
  })
})
