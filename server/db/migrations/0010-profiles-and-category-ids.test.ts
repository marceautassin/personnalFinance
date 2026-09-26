/**
 * Test de migration 0010 (story 27.1, Piège n°1).
 *
 * Construit une base au schéma 0009 en rejouant les migrations 0000-0009 HORS transaction
 * (comme le fait `tests/e2e/global-setup.ts`), y insère un jeu représentatif, puis applique la
 * migration 0010 DANS une transaction — exactement comme `drizzle-kit migrate` le fait en
 * production. C'est ce second détail qui attrape le Piège n°1 : `PRAGMA foreign_keys=OFF` est
 * sans effet dans une transaction, la recette de rebuild doit donc marcher SANS lui.
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

/** Rejoue 0000-0009 hors transaction, foreign_keys=ON — reproduit `global-setup.ts`. */
function buildSchema0009(db: Database.Database): void {
  db.pragma('foreign_keys = ON')
  for (const file of migrationFiles()) {
    // Exclut 0010 (dont ce fichier vérifie l'application) ET toute migration ULTÉRIEURE —
    // 0011 (story 28.4) suppose déjà le schéma 0010 (profile_id, group_id) : la laisser passer
    // ici casserait ce test sans lien avec le sujet qu'il vérifie.
    if (Number(file.slice(0, 4)) >= 10) continue
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    for (const stmt of statementsOf(sql)) db.exec(stmt)
  }
}

/**
 * Applique 0010 DANS une transaction — reproduit `drizzle-kit migrate`.
 *
 * `db.prepare(stmt).run()` par segment, PAS `db.exec(stmt)` : c'est `.prepare()` que le
 * migrateur réel (`drizzle-orm/better-sqlite3/migrator`) appelle pour chaque segment séparé
 * par `--> statement-breakpoint`, et lui seul lève sur un segment qui ne contient QUE des
 * commentaires (`db.exec()` les tolère silencieusement). Un test qui utiliserait `db.exec()`
 * ici ne peut PAS attraper ce bug de segmentation — c'est ce qui s'est produit pendant le
 * développement de cette story : ce test passait, `drizzle-kit migrate` échouait.
 */
function apply0010(db: Database.Database): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0010_profiles_and_category_ids.sql'), 'utf8')
  const stmts = statementsOf(sql)
  db.transaction(() => {
    for (const stmt of stmts) db.prepare(stmt).run()
  })()
}

function tableInfo(db: Database.Database, table: string): { name: string }[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
}

describe('migration 0010 — profils et clés de substitution du référentiel', () => {
  it('préserve intégralement un jeu représentatif de données (AC 1, 3, 4, 5)', () => {
    const db = new Database(':memory:')
    buildSchema0009(db)

    // --- Jeu représentatif : deux rubriques, un poste créé à la main, transactions dont une
    // corrigée is_manual, une ligne d'écart accepté, une règle, un groupe avec deux lignes.
    db.exec(`
      INSERT INTO category_groups (code, label, position, created_at) VALUES
        ('alimentation', 'Alimentation', 0, 1000),
        ('internes', 'Mouvements internes', 1, 1000);
      INSERT INTO category_items (code, group_code, label, nature, position, created_at) VALUES
        ('alimentation-courses', 'alimentation', 'Courses', 'expense', 0, 1000),
        ('alimentation-fait-main', 'alimentation', 'Poste créé à la main', 'expense', 1, 1000),
        ('internes-ecart-accepte', 'internes', 'Écart accepté', 'internal_transfer', 0, 1000);
      INSERT INTO bank_statements (hash_sha256, period_start, period_end, opening_balance_cents, closing_balance_cents, gap_accepted, ingested_at) VALUES
        ('${'a'.repeat(64)}', '2026-01-01', '2026-01-31', 100000, 90000, 1, 1000);
      INSERT INTO transactions (statement_hash, transaction_date, label, amount_cents, category_item_code, is_manual, created_at) VALUES
        ('${'a'.repeat(64)}', '2026-01-05', 'CARREFOUR', -5000, 'alimentation-courses', 0, 1000),
        ('${'a'.repeat(64)}', '2026-01-10', 'CORRIGÉE À LA MAIN', -3000, 'alimentation-fait-main', 1, 1000),
        ('${'a'.repeat(64)}', '2026-01-31', 'Écart accepté (réconciliation)', -2000, 'internes-ecart-accepte', 1, 1000);
      INSERT INTO classification_rules (pattern, category_item_code, created_at) VALUES
        ('carrefour', 'alimentation-courses', 1000);
      INSERT INTO settlement_groups (label, created_at) VALUES ('avance amis', 1000);
    `)
    // Rattache deux transactions au groupe de réconciliation, pour vérifier que
    // settlement_group_id (id préservé) survit au rebuild.
    db.exec(`UPDATE transactions SET settlement_group_id = 1 WHERE id IN (1, 2)`)

    // --- Photo "avant" (schéma 0009 : codes).
    const before = {
      tableCounts: Object.fromEntries(
        ['category_groups', 'category_items', 'bank_statements', 'transactions', 'classification_rules', 'settlement_groups']
          .map(t => [t, (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]),
      ),
      sumByStatement: db.prepare(`
        SELECT statement_hash, SUM(amount_cents) AS total FROM transactions GROUP BY statement_hash
      `).all(),
      byItemCode: db.prepare(`
        SELECT category_item_code AS code, COUNT(*) AS n, SUM(amount_cents) AS total
        FROM transactions GROUP BY category_item_code ORDER BY code
      `).all(),
      linesByIdAndCode: db.prepare(`
        SELECT id, category_item_code AS code FROM transactions ORDER BY id
      `).all(),
    }

    apply0010(db)

    // --- foreign_key_check vide.
    const fkViolations = db.pragma('foreign_key_check')
    expect(fkViolations).toEqual([])

    // --- Comptages inchangés (AC 3).
    for (const [table, n] of Object.entries(before.tableCounts)) {
      const after = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
      expect(after, `count(${table})`).toBe(n)
    }

    // --- Somme par relevé inchangée (AC 3), via jointure code → id nouvellement posée.
    const sumByStatementAfter = db.prepare(`
      SELECT statement_hash, SUM(amount_cents) AS total FROM transactions GROUP BY statement_hash
    `).all()
    expect(sumByStatementAfter).toEqual(before.sumByStatement)

    // --- (COUNT, SUM) par code de poste inchangé (AC 3).
    const byItemCodeAfter = db.prepare(`
      SELECT ci.code AS code, COUNT(*) AS n, SUM(t.amount_cents) AS total
      FROM transactions t JOIN category_items ci ON ci.id = t.category_item_id
      GROUP BY ci.code ORDER BY code
    `).all()
    expect(byItemCodeAfter).toEqual(before.byItemCode)

    // --- Grain ligne à ligne : aucune ligne n'a échangé son poste avec une autre.
    const linesAfter = db.prepare(`
      SELECT t.id AS id, ci.code AS code
      FROM transactions t JOIN category_items ci ON ci.id = t.category_item_id
      ORDER BY t.id
    `).all()
    expect(linesAfter).toEqual(before.linesByIdAndCode)

    // --- Clés (AC 4) : unicité (profile_id, code) sur category_groups/category_items.
    const dupGroups = db.prepare(`
      SELECT profile_id, code, COUNT(*) AS n FROM category_groups GROUP BY profile_id, code HAVING n > 1
    `).all()
    expect(dupGroups).toEqual([])
    const dupItems = db.prepare(`
      SELECT profile_id, code, COUNT(*) AS n FROM category_items GROUP BY profile_id, code HAVING n > 1
    `).all()
    expect(dupItems).toEqual([])

    // --- Pas de profile_id sur transactions (AC 5).
    const txColumns = tableInfo(db, 'transactions').map(c => c.name)
    expect(txColumns).not.toContain('profile_id')
    expect(txColumns).toContain('category_item_id')
    expect(txColumns).not.toContain('category_item_code')

    // --- profile_id = 1 et bank = 'boursorama' partout où attendu (AC 1).
    const groups = db.prepare('SELECT profile_id FROM category_groups').all() as { profile_id: number }[]
    expect(groups.every(g => g.profile_id === 1)).toBe(true)
    const items = db.prepare('SELECT profile_id FROM category_items').all() as { profile_id: number }[]
    expect(items.every(i => i.profile_id === 1)).toBe(true)
    const rules = db.prepare('SELECT profile_id FROM classification_rules').all() as { profile_id: number }[]
    expect(rules.every(r => r.profile_id === 1)).toBe(true)
    const settlements = db.prepare('SELECT profile_id FROM settlement_groups').all() as { profile_id: number }[]
    expect(settlements.every(s => s.profile_id === 1)).toBe(true)
    const statements = db.prepare(`SELECT profile_id, bank FROM bank_statements`).all() as { profile_id: number, bank: string }[]
    expect(statements.every(s => s.profile_id === 1 && s.bank === 'boursorama')).toBe(true)

    // --- Ids préservés (transactions, classification_rules, settlement_groups).
    const txIds = (db.prepare('SELECT id FROM transactions ORDER BY id').all() as { id: number }[]).map(r => r.id)
    expect(txIds).toEqual([1, 2, 3])
    const ruleIds = (db.prepare('SELECT id FROM classification_rules ORDER BY id').all() as { id: number }[]).map(r => r.id)
    expect(ruleIds).toEqual([1])
    const settlementIds = (db.prepare('SELECT id FROM settlement_groups ORDER BY id').all() as { id: number }[]).map(r => r.id)
    expect(settlementIds).toEqual([1])

    // --- settlement_group_id des transactions rattachées survit au rebuild.
    const grouped = db.prepare('SELECT id, settlement_group_id AS sgid FROM transactions WHERE id IN (1,2) ORDER BY id').all()
    expect(grouped).toEqual([{ id: 1, sgid: 1 }, { id: 2, sgid: 1 }])

    // --- Le profil marceau existe, et un seul.
    const marceau = db.prepare(`SELECT id, name, default_bank FROM profiles`).all()
    expect(marceau).toEqual([{ id: 1, name: 'marceau', default_bank: 'boursorama' }])

    db.close()
  })

  /**
   * Bug réel trouvé en revue : un `JOIN` (inner) sur un code orphelin ne matche rien, la ligne
   * disparaît en SILENCE et la migration « réussit » avec moins de lignes qu'avant (repro
   * observée : 4 transactions → 3). Le `LEFT JOIN` + colonne cible `NOT NULL` doit faire
   * échouer TOUT l'INSERT — et grâce à `db.transaction()`, toute la migration — plutôt que de
   * perdre la ligne. AC 3 : « tout écart fait échouer la procédure ».
   */
  it('échoue sans rien perdre quand une transaction référence un code de poste orphelin', () => {
    const db = new Database(':memory:')
    buildSchema0009(db)

    // La ligne « orpheline » est insérée avec `foreign_keys = OFF`, le temps de reproduire une
    // base réelle légèrement incohérente (poste retiré par un autre chemin que l'API, restauration
    // partielle…) : la contrainte FK de la table SOURCE (0009) ne doit pas être ce qui protège
    // ici, c'est la migration elle-même qui doit refuser de perdre la ligne.
    db.exec(`PRAGMA foreign_keys = OFF`)
    db.exec(`
      INSERT INTO category_groups (code, label, position, created_at) VALUES
        ('alimentation', 'Alimentation', 0, 1000);
      INSERT INTO category_items (code, group_code, label, nature, position, created_at) VALUES
        ('alimentation-courses', 'alimentation', 'Courses', 'expense', 0, 1000);
      INSERT INTO bank_statements (hash_sha256, period_start, period_end, opening_balance_cents, closing_balance_cents, gap_accepted, ingested_at) VALUES
        ('${'a'.repeat(64)}', '2026-01-01', '2026-01-31', 100000, 90000, 1, 1000);
      INSERT INTO transactions (statement_hash, transaction_date, label, amount_cents, category_item_code, is_manual, created_at) VALUES
        ('${'a'.repeat(64)}', '2026-01-05', 'A', -1000, 'alimentation-courses', 0, 1000),
        ('${'a'.repeat(64)}', '2026-01-06', 'B', -2000, 'alimentation-courses', 0, 1000),
        ('${'a'.repeat(64)}', '2026-01-07', 'C', -3000, 'alimentation-courses', 0, 1000),
        ('${'a'.repeat(64)}', '2026-01-08', 'ORPHELINE', -4000, 'poste-supprime-en-douce', 0, 1000);
    `)
    db.exec(`PRAGMA foreign_keys = ON`)

    const before = (db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n
    expect(before).toBe(4)

    expect(() => apply0010(db)).toThrow()

    // Rien n'a été perdu : le rollback de `db.transaction()` restaure l'état d'avant, y
    // compris la table `transactions` d'origine (pas de rebuild à moitié fait).
    const after = (db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n
    expect(after).toBe(4)
    const txColumns = tableInfo(db, 'transactions').map(c => c.name)
    expect(txColumns).toContain('category_item_code')
    expect(txColumns).not.toContain('category_item_id')

    db.close()
  })

  it('sème le profil marceau même sur une base vierge (AC 7)', () => {
    const db = new Database(':memory:')
    buildSchema0009(db)
    apply0010(db)

    const profiles = db.prepare('SELECT id, name, default_bank FROM profiles').all()
    expect(profiles).toEqual([{ id: 1, name: 'marceau', default_bank: 'boursorama' }])
    expect(db.pragma('foreign_key_check')).toEqual([])

    db.close()
  })
})
