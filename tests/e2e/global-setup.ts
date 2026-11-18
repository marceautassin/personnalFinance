import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'

/**
 * Base DÉDIÉE aux tests E2E, recréée à chaque exécution.
 *
 * Pourquoi (2026-09-04) : les specs tournaient sur `_data/personnalfinance.db`, la base de
 * travail réelle. Deux conséquences, toutes deux constatées :
 *  1. une spec qui échoue en cours de route laisse ses données derrière elle (une catégorie
 *     « Essence » y a survécu à un run raté), ce qui fait échouer le run SUIVANT — la suite
 *     devenait rouge par intermittence sans qu'aucun code n'ait changé ;
 *  2. les tests écrivaient dans les vraies données de l'utilisateur.
 *
 * Le schéma est construit depuis `server/db/migrations/` : la base de test est donc bâtie par
 * le même artefact que la production, et un run E2E vérifie au passage que la migration
 * s'applique réellement.
 *
 * ⚠️ Appelé depuis `playwright.config.ts` au CHARGEMENT du fichier, pas via `globalSetup` :
 * Playwright démarre le `webServer` AVANT le `globalSetup`, donc le serveur bootait sur une
 * base inexistante, le bootstrap refusait de démarrer et le seul symptôme était
 * « Timed out waiting 60000ms from config.webServer ».
 */
export function prepareE2eDatabase(): string {
  // `process.cwd()` et non `import.meta.url` : Playwright charge ce fichier dans un contexte
  // où `import.meta` n'est pas garanti, et l'échec était SILENCIEUX — la base était créée vide,
  // le serveur ne démarrait jamais, et le seul symptôme était un timeout du webServer.
  const root = process.cwd()
  const dbPath = process.env.E2E_DATABASE_URL ?? resolve(root, '_data/e2e.db')
  const migrationsDir = resolve(root, 'server/db/migrations')

  mkdirSync(dirname(dbPath), { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix)
  }

  // Toutes les migrations, dans l'ordre du journal Drizzle — pas une liste écrite à la main,
  // qui deviendrait fausse à la prochaine migration sans que rien ne le signale.
  const journal = JSON.parse(readFileSync(resolve(migrationsDir, 'meta/_journal.json'), 'utf-8')) as {
    entries: { tag: string }[]
  }

  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  for (const entry of journal.entries) {
    const sql = readFileSync(resolve(migrationsDir, `${entry.tag}.sql`), 'utf-8')
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim()
      if (trimmed) db.exec(trimmed)
    }
  }

  // Vérification explicite : une base vide produisait un timeout du webServer, symptôme muet
  // et coûteux à diagnostiquer. On échoue ici, avec la cause.
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[]
  db.close()
  if (tables.length === 0) {
    throw new Error(
      `[e2e] base de test vide après application des migrations (${migrationsDir}). `
      + 'Vérifie `server/db/migrations/meta/_journal.json`.',
    )
  }

  console.warn(`[e2e] base de test recréée : ${dbPath} (${tables.length} tables)`)
  return dbPath
}
