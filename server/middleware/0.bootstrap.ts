import { mkdirSync, existsSync } from 'node:fs'
import { defineEventHandler } from 'h3'
import { db } from '../db/client'
import { sql } from 'drizzle-orm'
import { categoryDefinitions } from '../db/schema'
import { DEFAULT_CATEGORIES } from '~~/shared/constants/default-categories'

let isBootstrapped = false
let bootstrapError: Error | null = null

/**
 * Repères de schéma vérifiés au démarrage, au-delà de la seule existence des tables.
 *
 * Mis à jour le 2026-09-04 : les repères portaient sur `debt_events` et la contrainte de
 * cohérence des dettes, tous deux supprimés. Ils vérifient désormais l'INVERSE — qu'une base
 * antérieure à la suppression, porteuse des tables du forecast, soit refusée au démarrage
 * plutôt que de faire diverger le schéma déclaré et le schéma réel.
 *
 * Pourquoi (revue du 2026-09-04) : la sonde ne testait que `category_definitions`. Une base
 * antérieure au lot 6.5/6.7 passait donc le bootstrap sans bruit, puis échouait en 500
 * (`no such table: debt_events`) — ou pire, tournait sans la contrainte
 * `transactions_debt_coherence_check` ni la FK `ON DELETE SET NULL`, sur lesquelles la story
 * 6.7 s'appuie pour son intégrité. Un schéma périmé doit se voir au démarrage, pas à l'usage.
 *
 * Chaque entrée est un couple (description, requête qui doit trouver quelque chose).
 */
const SCHEMA_MARKERS: { label: string, exists: () => boolean }[] = [
  {
    label: 'table `transactions` sans colonnes de dette (suppression du 2026-09-04)',
    exists: () => !tableSql('transactions').includes('debt_id'),
  },
  {
    label: 'tables du forecast retirées (`debts`, `fixed_charges`, `sas_config`)',
    exists: () => !tableNames().some(n => ['debts', 'debt_events', 'fixed_charges', 'sas_config', 'tax_settings', 'revenue_models', 'monthly_overrides'].includes(n)),
  },
]

function tableNames(): string[] {
  const rows = db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`)
  return rows.map(r => r.name)
}

function tableSql(name: string): string {
  const rows = db.all<{ sql: string | null }>(
    sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ${name}`,
  )
  return rows[0]?.sql ?? ''
}

/** Échoue AU DÉMARRAGE si la base ne porte pas les évolutions de schéma attendues. */
export function assertSchemaUpToDate(): void {
  const missing = SCHEMA_MARKERS.filter(m => !m.exists()).map(m => m.label)
  if (missing.length > 0) {
    throw new Error(
      `Schéma de base périmé — manque : ${missing.join(', ')}. `
      + 'Lance `yarn db:push` (ou applique les migrations de `server/db/migrations/`) puis relance le serveur.',
    )
  }
}

async function bootstrap(): Promise<void> {
  for (const dir of ['_data', '_data/raw']) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      console.warn(`[bootstrap] créé ${dir}`)
    }
  }

  let tableExists = true
  try {
    db.select().from(categoryDefinitions).limit(1).all()
  }
  catch (err) {
    if (err instanceof Error && /no such table/i.test(err.message)) {
      tableExists = false
    }
    else {
      throw err
    }
  }

  if (!tableExists) {
    throw new Error(
      'Base de données non initialisée. Lance `yarn db:push` (ou `yarn apply-migration` si tu utilises les migrations) puis relance le serveur.',
    )
  }

  assertSchemaUpToDate()

  const inserted = db
    .insert(categoryDefinitions)
    .values(
      DEFAULT_CATEGORIES.map(c => ({
        code: c.code,
        label: c.label,
        isVariable: c.isVariable,
      })),
    )
    .onConflictDoNothing({ target: categoryDefinitions.code })
    .run()

  console.warn(`[bootstrap] OK — base prête (${inserted.changes} catégorie(s) insérée(s))`)
}

export default defineEventHandler(async () => {
  if (isBootstrapped) return
  if (bootstrapError) throw bootstrapError

  try {
    await bootstrap()
    isBootstrapped = true
  }
  catch (err) {
    bootstrapError = err instanceof Error ? err : new Error(String(err))
    console.error('[bootstrap] échec :', bootstrapError)
    throw bootstrapError
  }
})
