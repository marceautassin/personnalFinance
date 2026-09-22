/**
 * Procédure de migration sûre — story 27.1 (AC 2, AC 3).
 *
 * NFR12 promet une base reconstructible, mais la migration 0010 reconstruit six tables sur deux
 * ans de données dont la perte n'est PAS rattrapable (corrections manuelles, règles, écarts
 * acceptés n'existent dans aucun PDF). Cette procédure refuse de migrer sans avoir d'abord
 * vérifié qu'une sauvegarde RESTAURABLE existe, et refuse de conclure sans avoir prouvé que rien
 * n'a été perdu.
 *
 * Étapes :
 *   1. copie binaire via `db.backup()` — même mécanisme que `backup-db.mjs`, sûr en WAL ;
 *   2. vérification de la copie : ouverture, `PRAGMA integrity_check`, comptage par table = source ;
 *   3. photo « avant » : comptage par table, SUM(amount_cents) par statement_hash, (COUNT, SUM)
 *      par code de poste — lue sur le schéma COURANT (`PRAGMA table_info`, jamais supposé) ;
 *   4. `drizzle-kit migrate` ;
 *   5. photo « après » (même lecture adaptative), comparaison, `PRAGMA foreign_key_check` vide ;
 *   6. tout écart → sortie non nulle, message en français donnant le chemin de la sauvegarde à
 *      restaurer.
 *
 * Usage : `yarn db:migrate-safe`
 *
 * ⚠️ Ne JAMAIS lancer directement sur la base réelle en premier — valider d'abord sur une COPIE
 * de `_data/personnalfinance.db` (Dev Notes de la story, Piège n°1).
 */
import Database from 'better-sqlite3'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const DB_PATH = process.env.DATABASE_URL ?? resolve('_data/personnalfinance.db')
const BACKUP_DIR = process.env.BACKUP_DIR ?? resolve('_data/backups')

/**
 * `afterMigration` distingue les deux moments où `fail()` peut être appelé : AVANT que
 * `drizzle-kit migrate` n'ait tourné (rien n'a encore touché `DB_PATH`, le seul geste possible
 * est de corriger et relancer) et APRÈS (la migration a écrit dans `DB_PATH`, et seule une
 * restauration de la sauvegarde y remet l'état d'avant). Annoncer « rien n'a été perdu » dans
 * le second cas serait faux tant que la restauration n'a pas eu lieu (revue de la story 27.1).
 */
function fail(message, { afterMigration = false } = {}) {
  console.error(`\n[migrate-safely] ÉCHEC — ${message}`)
  if (afterMigration) {
    console.error(`[migrate-safely] La migration a été appliquée à ${DB_PATH} et a laissé un écart : restaure la sauvegarde AVANT toute autre opération :`)
    console.error(`[migrate-safely]   cp "${backupTarget}" "${DB_PATH}"`)
  }
  else {
    console.error(`[migrate-safely] La base réelle n'a pas été touchée par cette vérification. La sauvegarde reste disponible :`)
    console.error(`[migrate-safely]   ${backupTarget}`)
  }
  process.exit(1)
}

mkdirSync(BACKUP_DIR, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const backupTarget = resolve(BACKUP_DIR, `pre-migrate-${stamp}.db`)

console.warn(`[migrate-safely] Base : ${DB_PATH}`)
console.warn(`[migrate-safely] Sauvegarde : ${backupTarget}`)

// 1. Copie binaire — API backup() de SQLite, seule manière sûre en mode WAL.
const source = new Database(DB_PATH, { readonly: true, fileMustExist: true })
await source.backup(backupTarget)

// 2. Vérification : la copie doit être ouvrable, intègre, et porter EXACTEMENT les mêmes
// comptages par table que la source — sinon la sauvegarde elle-même est inutilisable.
const copy = new Database(backupTarget, { readonly: true, fileMustExist: true })
const integrity = copy.pragma('integrity_check', { simple: true })
if (integrity !== 'ok') {
  console.error(`[migrate-safely] ÉCHEC — la sauvegarde n'est pas restaurable (integrity_check: ${integrity}).`)
  console.error('[migrate-safely] Rien n\'a été migré.')
  process.exit(1)
}
const sourceCounts = countsByTable(source)
const copyCounts = countsByTable(copy)
for (const [table, n] of Object.entries(sourceCounts)) {
  if (copyCounts[table] !== n) {
    console.error(`[migrate-safely] ÉCHEC — la sauvegarde diverge sur \`${table}\` (source: ${n}, copie: ${copyCounts[table]}).`)
    console.error('[migrate-safely] Rien n\'a été migré.')
    process.exit(1)
  }
}
console.warn(`[migrate-safely] Sauvegarde vérifiée — restaurable (${Object.keys(sourceCounts).length} table(s)).`)
copy.close()

// 3. Photo « avant » — sur le schéma COURANT de `source`, jamais supposé.
const before = photograph(source)
source.close()

// 4. Migration.
console.warn('[migrate-safely] Application des migrations…')
const result = spawnSync('yarn', ['apply-migration'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: DB_PATH },
})
if (result.status !== 0) {
  fail(`\`drizzle-kit migrate\` a échoué (code ${result.status}).`)
}

// 5. Photo « après », comparaison, foreign_key_check.
const migrated = new Database(DB_PATH)
const fkViolations = migrated.pragma('foreign_key_check')
if (fkViolations.length > 0) {
  console.error('[migrate-safely] Violations de clé étrangère après migration :', fkViolations)
  fail('`PRAGMA foreign_key_check` a trouvé des violations après migration.', { afterMigration: true })
}

const after = photograph(migrated)
migrated.close()

const diffs = compare(before, after)
if (diffs.length > 0) {
  console.error('[migrate-safely] Écarts détectés :')
  for (const d of diffs) console.error(`  - ${d}`)
  fail(`${diffs.length} écart(s) entre l'état avant et après migration — voir le détail ci-dessus.`, { afterMigration: true })
}

console.warn('[migrate-safely] OK — migration appliquée, rien de perdu (comptages, sommes par relevé et par poste identiques).')

/** Comptage de lignes par table, pour toutes les tables de la base. */
function countsByTable(db) {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all()
  const out = {}
  for (const { name } of tables) {
    out[name] = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n
  }
  return out
}

/** Colonne portant le poste sur `table`, adaptée au schéma courant (jamais supposée). */
function itemColumnOn(db, table) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
  if (columns.includes('category_item_code')) return { column: 'category_item_code', viaId: false }
  if (columns.includes('category_item_id')) return { column: 'category_item_id', viaId: true }
  throw new Error(`colonne de poste introuvable sur \`${table}\` (ni category_item_code, ni category_item_id)`)
}

/** Colonne portant la rubrique sur `category_items`, adaptée au schéma courant. */
function groupColumnOnCategoryItems(db) {
  const columns = db.prepare('PRAGMA table_info(category_items)').all().map(c => c.name)
  if (columns.includes('group_code')) return { column: 'group_code', viaId: false }
  if (columns.includes('group_id')) return { column: 'group_id', viaId: true }
  throw new Error('colonne de rubrique introuvable sur `category_items` (ni group_code, ni group_id)')
}

/**
 * Photo de l'état « rien de perdu » (AC 3) : comptage par table, somme par relevé, (COUNT, SUM)
 * par CODE de poste, et trois listes en CODES (jamais des id, pour que la comparaison ait un
 * sens malgré la ré-numérotation par le rebuild) :
 *  - (transaction.id, code du poste) — grain ligne à ligne, une transaction n'a pas ÉCHANGÉ son
 *    poste avec une autre de même montant ;
 *  - (règle.id, code du poste) — une règle n'a pas glissé vers un autre poste ;
 *  - (poste.code, code de sa rubrique) — un poste n'a pas changé de rubrique.
 */
function photograph(db) {
  const tableCounts = countsByTable(db)

  const sumByStatement = db.prepare(`
    SELECT statement_hash AS statementHash, SUM(amount_cents) AS total
    FROM transactions GROUP BY statement_hash ORDER BY statement_hash
  `).all()

  const tx = itemColumnOn(db, 'transactions')
  const byItemCode = tx.viaId
    ? db.prepare(`
        SELECT ci.code AS code, COUNT(*) AS n, SUM(t.amount_cents) AS total
        FROM transactions t JOIN category_items ci ON ci.id = t.${tx.column}
        GROUP BY ci.code ORDER BY code
      `).all()
    : db.prepare(`
        SELECT ${tx.column} AS code, COUNT(*) AS n, SUM(amount_cents) AS total
        FROM transactions GROUP BY ${tx.column} ORDER BY code
      `).all()

  const transactionsByIdAndCode = tx.viaId
    ? db.prepare(`
        SELECT t.id AS id, ci.code AS code
        FROM transactions t JOIN category_items ci ON ci.id = t.${tx.column}
        ORDER BY t.id
      `).all()
    : db.prepare(`
        SELECT id, ${tx.column} AS code FROM transactions ORDER BY id
      `).all()

  const rule = itemColumnOn(db, 'classification_rules')
  const rulesByIdAndCode = rule.viaId
    ? db.prepare(`
        SELECT cr.id AS id, ci.code AS code
        FROM classification_rules cr JOIN category_items ci ON ci.id = cr.${rule.column}
        ORDER BY cr.id
      `).all()
    : db.prepare(`
        SELECT id, ${rule.column} AS code FROM classification_rules ORDER BY id
      `).all()

  const group = groupColumnOnCategoryItems(db)
  const itemsByCodeAndGroupCode = group.viaId
    ? db.prepare(`
        SELECT ci.code AS code, cg.code AS groupCode
        FROM category_items ci JOIN category_groups cg ON cg.id = ci.${group.column}
        ORDER BY ci.code
      `).all()
    : db.prepare(`
        SELECT code, ${group.column} AS groupCode FROM category_items ORDER BY code
      `).all()

  return { tableCounts, sumByStatement, byItemCode, transactionsByIdAndCode, rulesByIdAndCode, itemsByCodeAndGroupCode }
}

function compare(before, after) {
  const diffs = []

  // Le comptage par table peut légitimement changer de FORME (nouvelle table `profiles`,
  // disparition d'aucune table du périmètre) : on ne compare que les tables COMMUNES, et
  // seulement celles qui portent des données possédées par la migration 0010.
  const commonTables = ['category_groups', 'category_items', 'bank_statements', 'transactions', 'classification_rules', 'settlement_groups']
  for (const table of commonTables) {
    const b = before.tableCounts[table] ?? 0
    const a = after.tableCounts[table] ?? 0
    if (b !== a) diffs.push(`comptage de \`${table}\` : ${b} avant, ${a} après`)
  }

  const sumBefore = JSON.stringify(before.sumByStatement)
  const sumAfter = JSON.stringify(after.sumByStatement)
  if (sumBefore !== sumAfter) diffs.push('somme(amount_cents) par relevé a changé')

  const byCodeBefore = JSON.stringify(before.byItemCode)
  const byCodeAfter = JSON.stringify(after.byItemCode)
  if (byCodeBefore !== byCodeAfter) diffs.push('(COUNT, SUM) par code de poste a changé')

  if (JSON.stringify(before.transactionsByIdAndCode) !== JSON.stringify(after.transactionsByIdAndCode)) {
    diffs.push('au moins une transaction a changé de poste (grain ligne à ligne)')
  }
  if (JSON.stringify(before.rulesByIdAndCode) !== JSON.stringify(after.rulesByIdAndCode)) {
    diffs.push('au moins une règle de classement a changé de poste de destination')
  }
  if (JSON.stringify(before.itemsByCodeAndGroupCode) !== JSON.stringify(after.itemsByCodeAndGroupCode)) {
    diffs.push('au moins un poste a changé de rubrique')
  }

  return diffs
}
