import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TEST_SCHEMA_DDL, TEST_REFERENTIAL_DDL } from '~~/tests/fixtures/test-schema'

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
  sqlite.exec(TEST_SCHEMA_DDL)
  // Le référentiel aussi : une des sondes porte sur des DONNÉES — les postes du compte joint,
  // dont l'absence ferait disparaître la moitié coupée des agrégats (story 21.1).
  sqlite.exec(TEST_REFERENTIAL_DDL)
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
   * et le schéma réel. Depuis D17 elle vérifie AUSSI la présence du référentiel à deux
   * niveaux — le sens le plus utile, puisque c'est celui qui casse à l'usage.
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
        category_item_code TEXT NOT NULL,
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

  /**
   * Le sens qui compte au quotidien : une base d'avant D17 démarrait sans bruit, puis
   * échouait à l'usage sur `no such table: category_items`. Un schéma périmé doit se voir au
   * démarrage.
   */
  it('refuse une base restée sur le référentiel plat', async () => {
    const mod = await import('./0.bootstrap')
    sqlite.exec('ALTER TABLE category_items RENAME TO category_definitions')
    expect(() => mod.assertSchemaUpToDate()).toThrow(/référentiel à deux niveaux/i)
    sqlite.exec('ALTER TABLE category_definitions RENAME TO category_items')
    expect(() => mod.assertSchemaUpToDate()).not.toThrow()
  })

  it('refuse une table transactions restée sur `category_item_code` (story 27.1)', async () => {
    const mod = await import('./0.bootstrap')
    sqlite.exec('ALTER TABLE transactions RENAME COLUMN category_item_id TO category_item_code')
    expect(() => mod.assertSchemaUpToDate()).toThrow(/category_item_id/)
    sqlite.exec('ALTER TABLE transactions RENAME COLUMN category_item_code TO category_item_id')
    expect(() => mod.assertSchemaUpToDate()).not.toThrow()
  })
})
