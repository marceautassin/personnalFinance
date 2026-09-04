import { mkdirSync, existsSync } from 'node:fs'
import { defineEventHandler } from 'h3'
import { db } from '../db/client'
import { sql } from 'drizzle-orm'
import { categoryGroups, categoryItems } from '../db/schema'
import { DEFAULT_REFERENTIAL } from '~~/shared/constants/default-referential'

let isBootstrapped = false
let bootstrapError: Error | null = null

/**
 * Repères de schéma vérifiés au démarrage, au-delà de la seule existence des tables.
 *
 * Mis à jour le 2026-09-04 : les repères portaient sur `debt_events` et la contrainte de
 * cohérence des dettes, tous deux supprimés. Ils vérifient désormais l'INVERSE — qu'une base
 * antérieure à la suppression, porteuse des tables du forecast, soit refusée au démarrage
 * plutôt que de faire diverger le schéma déclaré et le schéma réel — plus la PRÉSENCE du
 * référentiel à deux niveaux, qui remplace `category_definitions` (D17).
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
    label: 'référentiel à deux niveaux (`category_groups`, `category_items`) — D17',
    exists: () => {
      const names = tableNames()
      return names.includes('category_groups') && names.includes('category_items')
    },
  },
  {
    label: 'table `category_definitions` retirée au profit du référentiel à deux niveaux',
    exists: () => !tableNames().includes('category_definitions'),
  },
  {
    label: 'colonne `transactions.category_item_code` (remplace `category_code`)',
    exists: () => tableSql('transactions').includes('category_item_code'),
  },
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
      + 'Lance `yarn apply-migration` puis relance le serveur.',
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
    db.select().from(categoryGroups).limit(1).all()
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
      'Base de données non initialisée. Lance `yarn apply-migration` puis relance le serveur.',
    )
  }

  assertSchemaUpToDate()

  // Seed du référentiel initial (D17, AR3) — UNIQUEMENT sur une base vierge.
  //
  // Le rejouer à chaque démarrage, même en `onConflictDoNothing`, ressuscitait au redémarrage
  // suivant tout poste ou rubrique par défaut que l'utilisateur venait de supprimer : une
  // rubrique vidée puis supprimée revenait avec ses postes, en contradiction directe avec
  // FR16 et FR18 (revue du 2026-09-05). Le référentiel appartient à l'utilisateur dès le
  // premier démarrage ; on ne le lui réimpose pas.
  const alreadySeeded = db
    .select({ cnt: sql<number>`count(*)` })
    .from(categoryGroups)
    .get()
  if (Number(alreadySeeded?.cnt ?? 0) > 0) {
    console.warn('[bootstrap] OK — base prête (référentiel déjà présent, seed ignoré)')
    return
  }

  // Les rubriques d'abord — les postes portent une FK vers elles.
  const groupsInserted = db
    .insert(categoryGroups)
    .values(DEFAULT_REFERENTIAL.map((g, i) => ({ code: g.code, label: g.label, position: i })))
    .run()

  const itemRows = DEFAULT_REFERENTIAL.flatMap(g =>
    g.items.map((item, i) => ({
      code: item.code,
      groupCode: g.code,
      label: item.label,
      nature: item.nature,
      position: i,
    })),
  )
  const itemsInserted = db
    .insert(categoryItems)
    .values(itemRows)
    .run()

  console.warn(
    `[bootstrap] OK — base prête (${groupsInserted.changes} rubrique(s), ${itemsInserted.changes} poste(s) insérés)`,
  )
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
