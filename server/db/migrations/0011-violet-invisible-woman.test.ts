/**
 * Test de migration 0011 (story 28.4, D44) — colonnes `source`, `continuity_gap_cents`,
 * `card_detail_missing` sur `bank_statements`, et poste « Carte (non détaillée) » ajouté à
 * chaque profil déjà peuplé.
 *
 * Même recette que le test de la migration 0010 : rejoue 0000-0010 HORS transaction (reproduit
 * `global-setup.ts`), applique 0011 DANS une transaction (reproduit `drizzle-kit migrate`).
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(__dirname)

function statementsOf(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{4}_.*\.sql$/.test(f))
    .sort()
}

function buildSchema0010(db: Database.Database): void {
  db.pragma('foreign_keys = ON')
  for (const file of migrationFiles()) {
    if (file.startsWith('0011')) continue
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    for (const stmt of statementsOf(sql)) db.exec(stmt)
  }
}

function migration0011File(): string {
  const file = migrationFiles().find(f => f.startsWith('0011'))
  if (!file) throw new Error('migration 0011 introuvable')
  return file
}

function apply0011(db: Database.Database): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, migration0011File()), 'utf8')
  const stmts = statementsOf(sql)
  db.transaction(() => {
    for (const stmt of stmts) db.prepare(stmt).run()
  })()
}

function tableInfo(db: Database.Database, table: string): { name: string }[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
}

describe('migration 0011 — colonnes bank_statements et poste carte non détaillée (D44)', () => {
  it('ajoute les trois colonnes avec leur défaut, sur une base déjà peuplée', () => {
    const db = new Database(':memory:')
    buildSchema0010(db)

    db.exec(`
      INSERT INTO bank_statements (hash_sha256, profile_id, bank, period_start, period_end, opening_balance_cents, closing_balance_cents, gap_accepted, ingested_at) VALUES
        ('${'a'.repeat(64)}', 1, 'boursorama', '2026-01-01', '2026-01-31', 100000, 90000, 0, 1000);
    `)

    apply0011(db)

    const columns = tableInfo(db, 'bank_statements').map(c => c.name)
    expect(columns).toContain('source')
    expect(columns).toContain('continuity_gap_cents')
    expect(columns).toContain('card_detail_missing')

    const row = db.prepare('SELECT source, continuity_gap_cents AS gap, card_detail_missing AS card FROM bank_statements').get() as {
      source: string
      gap: number | null
      card: number
    }
    expect(row.source).toBe('pdf')
    expect(row.gap).toBeNull()
    expect(row.card).toBe(0)
  })

  it('crée le poste « Carte (non détaillée) » sur CHAQUE profil peuplé, dans divers, nature expense', () => {
    const db = new Database(':memory:')
    buildSchema0010(db)

    // Un second profil, avec sa propre rubrique `divers` — la migration 0010 sème déjà le
    // profil marceau (id 1) mais sans référentiel peuplé sur une base neuve : on peuple ici
    // pour distinguer « profil peuplé » de « profil vierge ».
    db.exec(`
      INSERT INTO profiles (id, name, default_bank, created_at) VALUES (2, 'second', 'boursorama', 1000);
      INSERT INTO category_groups (profile_id, code, label, position, created_at) VALUES
        (1, 'divers', 'Divers', 0, 1000),
        (2, 'divers', 'Divers', 0, 1000);
      INSERT INTO category_items (profile_id, code, group_id, label, nature, position, created_at)
        SELECT profile_id, 'divers-non-categorise', id, 'Non catégorisé', 'expense', 0, 1000
        FROM category_groups WHERE code = 'divers';
    `)

    apply0011(db)

    const items = db.prepare(`
      SELECT profile_id AS profileId, nature FROM category_items
      WHERE code = 'divers-carte-non-detaillee'
      ORDER BY profile_id
    `).all() as { profileId: number, nature: string }[]
    expect(items).toEqual([
      { profileId: 1, nature: 'expense' },
      { profileId: 2, nature: 'expense' },
    ])
  })

  it('n\'insère rien sur une base vierge (aucune rubrique divers peuplée)', () => {
    const db = new Database(':memory:')
    buildSchema0010(db)

    apply0011(db)

    const items = db.prepare(`SELECT * FROM category_items WHERE code = 'divers-carte-non-detaillee'`).all()
    expect(items).toEqual([])
  })

  it('est rejouable (OR IGNORE) — une seconde application ne duplique rien', () => {
    const db = new Database(':memory:')
    buildSchema0010(db)
    db.exec(`
      INSERT INTO category_groups (profile_id, code, label, position, created_at) VALUES (1, 'divers', 'Divers', 0, 1000);
    `)

    apply0011(db)
    // Rejoue seulement le segment d'INSERT — les ALTER TABLE échoueraient sur colonne existante,
    // ce que ce test ne cherche pas à couvrir (il vérifie l'idempotence du seed conditionnel).
    const sql = readFileSync(join(MIGRATIONS_DIR, migration0011File()), 'utf8')
    const insertStmt = statementsOf(sql).find(s => s.includes('INSERT OR IGNORE'))!
    db.prepare(insertStmt).run()

    const items = db.prepare(`SELECT * FROM category_items WHERE code = 'divers-carte-non-detaillee'`).all()
    expect(items).toHaveLength(1)
  })

  it('relevés existants : source = pdf, card_detail_missing = 0, continuity_gap_cents NULL', () => {
    const db = new Database(':memory:')
    buildSchema0010(db)
    db.exec(`
      INSERT INTO bank_statements (hash_sha256, profile_id, bank, period_start, period_end, opening_balance_cents, closing_balance_cents, gap_accepted, ingested_at) VALUES
        ('${'b'.repeat(64)}', 1, 'boursorama', '2026-02-01', '2026-02-28', 50000, 40000, 0, 1000);
    `)

    apply0011(db)

    const row = db.prepare('SELECT source, continuity_gap_cents AS gap, card_detail_missing AS card FROM bank_statements').get() as {
      source: string
      gap: number | null
      card: number
    }
    expect(row).toEqual({ source: 'pdf', gap: null, card: 0 })
  })
})
