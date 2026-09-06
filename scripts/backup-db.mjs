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

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })

const dbTarget = resolve(OUT_DIR, `personnalfinance-${stamp}.db`)
await db.backup(dbTarget)

const corrections = {
  exportedAt: new Date().toISOString(),
  source: DB_PATH,
  // Les règles sont la connaissance la plus condensée : chacune vaut pour toutes ses
  // occurrences futures.
  rules: db.prepare(`
    SELECT pattern, category_item_code AS categoryItemCode, created_at AS createdAt
    FROM classification_rules ORDER BY id
  `).all(),
  // Clé de correspondance stable : un id auto-incrémenté ne survit pas à une ré-ingestion.
  manualTransactions: db.prepare(`
    SELECT statement_hash AS statementHash, transaction_date AS transactionDate,
           label, amount_cents AS amountCents, category_item_code AS categoryItemCode
    FROM transactions WHERE is_manual = 1
    ORDER BY transaction_date, label
  `).all(),
  acceptedGaps: db.prepare(`
    SELECT hash_sha256 AS hash, period_start AS periodStart, period_end AS periodEnd
    FROM bank_statements WHERE gap_accepted = 1 ORDER BY period_start
  `).all(),
  // Le référentiel est édité par l'utilisateur : un poste créé à la main se perdrait sinon.
  categoryGroups: db.prepare('SELECT code, label, position FROM category_groups ORDER BY position').all(),
  categoryItems: db.prepare(`
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
