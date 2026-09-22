/**
 * Sauvegarde de la base et export des corrections — story 17.10.
 *
 * **Pourquoi.** NFR12 promet une base reconstructible depuis les PDF de `_data/raw/`. C'est
 * faux dès la première correction : les reclassements manuels, les écarts assumés et les
 * règles ne vivent qu'en base, et rien ne les sauvegarde. Une ré-ingestion rendrait les
 * montants, pas le rangement — c'est-à-dire le seul travail que la machine ne refait pas.
 *
 * Produit deux artefacts horodatés dans `_data/backups/` (gitignoré) :
 *   1. une copie binaire cohérente de la base, prise via l'API `backup()` de SQLite, seule
 *      manière sûre de copier un fichier en mode WAL pendant qu'il est ouvert ;
 *   2. un export JSON des corrections, indépendant des identifiants techniques — une ligne
 *      corrigée s'y retrouve par (relevé, date, libellé, montant), qui survit à une
 *      ré-ingestion complète là où un `id` auto-incrémenté ne survit pas.
 *
 * Usage : `yarn db:backup`
 */
import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DB_PATH = process.env.DATABASE_URL ?? resolve('_data/personnalfinance.db')
const OUT_DIR = process.env.BACKUP_DIR ?? resolve('_data/backups')

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
mkdirSync(OUT_DIR, { recursive: true })

function tableExists(database, name) {
  return database.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) !== undefined
}

function columnExists(database, table, column) {
  return database.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)
}

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })

const dbTarget = resolve(OUT_DIR, `personnalfinance-${stamp}.db`)
await db.backup(dbTarget)

// Story 27.1 (D37) : `transactions`/`classification_rules` référencent le poste par
// `category_item_id` depuis la migration 0010, et `category_items`/`category_groups` par leur
// `id`, pas par leur `code`. L'export reste indépendant des identifiants techniques — c'est sa
// raison d'être (en-tête de ce fichier) — donc chaque requête REJOINT pour RE-EXPOSER des
// codes, jamais des id bruts.
//
// ⚠️ Lecture ADAPTATIVE, comme `migrate-safely.mjs` (même bug visé : un schéma supposé plutôt
// que lu casse l'export). L'usage le plus précieux de ce script est JUSTE AVANT une migration
// de rebuild — donc sur le schéma 0009 (sans `profiles`, `category_item_code` en texte) — et il
// doit continuer de fonctionner après, sur le schéma 0010+.
const usesProfileOwnership = tableExists(db, 'profiles')
  && columnExists(db, 'transactions', 'category_item_id')

const corrections = {
  exportedAt: new Date().toISOString(),
  source: DB_PATH,
  schema: usesProfileOwnership ? '0010+' : '0009',
  // Les règles sont la connaissance la plus condensée : chacune vaut pour toutes ses
  // occurrences futures.
  rules: usesProfileOwnership
    ? db.prepare(`
        SELECT p.name AS profile, cr.pattern, ci.code AS categoryItemCode, cr.created_at AS createdAt
        FROM classification_rules cr
        JOIN category_items ci ON ci.id = cr.category_item_id
        JOIN profiles p ON p.id = cr.profile_id
        ORDER BY cr.id
      `).all()
    : db.prepare(`
        SELECT pattern, category_item_code AS categoryItemCode, created_at AS createdAt
        FROM classification_rules ORDER BY id
      `).all(),
  // Clé de correspondance stable : un id auto-incrémenté ne survit pas à une ré-ingestion.
  // Le profil est celui du RELEVÉ (une transaction n'en porte pas, AC 5 de la story 27.1).
  manualTransactions: usesProfileOwnership
    ? db.prepare(`
        SELECT p.name AS profile, t.statement_hash AS statementHash, t.transaction_date AS transactionDate,
               t.label, t.amount_cents AS amountCents, ci.code AS categoryItemCode
        FROM transactions t
        JOIN category_items ci ON ci.id = t.category_item_id
        JOIN bank_statements bs ON bs.hash_sha256 = t.statement_hash
        JOIN profiles p ON p.id = bs.profile_id
        WHERE t.is_manual = 1
        ORDER BY t.transaction_date, t.label
      `).all()
    : db.prepare(`
        SELECT statement_hash AS statementHash, transaction_date AS transactionDate,
               label, amount_cents AS amountCents, category_item_code AS categoryItemCode
        FROM transactions WHERE is_manual = 1
        ORDER BY transaction_date, label
      `).all(),
  acceptedGaps: usesProfileOwnership
    ? db.prepare(`
        SELECT p.name AS profile, bs.hash_sha256 AS hash, bs.period_start AS periodStart, bs.period_end AS periodEnd
        FROM bank_statements bs
        JOIN profiles p ON p.id = bs.profile_id
        WHERE bs.gap_accepted = 1 ORDER BY bs.period_start
      `).all()
    : db.prepare(`
        SELECT hash_sha256 AS hash, period_start AS periodStart, period_end AS periodEnd
        FROM bank_statements WHERE gap_accepted = 1 ORDER BY period_start
      `).all(),
  // Le référentiel est édité par l'utilisateur : un poste créé à la main se perdrait sinon.
  categoryGroups: usesProfileOwnership
    ? db.prepare(`
        SELECT p.name AS profile, cg.code, cg.label, cg.position
        FROM category_groups cg
        JOIN profiles p ON p.id = cg.profile_id
        ORDER BY p.name, cg.position
      `).all()
    : db.prepare('SELECT code, label, position FROM category_groups ORDER BY position').all(),
  categoryItems: usesProfileOwnership
    ? db.prepare(`
        SELECT p.name AS profile, ci.code, cg.code AS groupCode, ci.label, ci.nature, ci.position
        FROM category_items ci
        JOIN category_groups cg ON cg.id = ci.group_id
        JOIN profiles p ON p.id = ci.profile_id
        ORDER BY p.name, cg.code, ci.position
      `).all()
    : db.prepare(`
        SELECT code, group_code AS groupCode, label, nature, position
        FROM category_items ORDER BY group_code, position
      `).all(),
}

const jsonTarget = resolve(OUT_DIR, `corrections-${stamp}.json`)
writeFileSync(jsonTarget, JSON.stringify(corrections, null, 2), 'utf8')
db.close()

console.warn(`Base sauvegardée      → ${dbTarget}`)
console.warn(`Corrections exportées → ${jsonTarget}`)
console.warn(
  `  ${corrections.rules.length} règle(s), `
  + `${corrections.manualTransactions.length} ligne(s) corrigée(s), `
  + `${corrections.acceptedGaps.length} écart(s) accepté(s), `
  + `${corrections.categoryItems.length} poste(s)`,
)
