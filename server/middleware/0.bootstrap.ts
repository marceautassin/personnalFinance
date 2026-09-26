import { mkdirSync, existsSync } from 'node:fs'
import { JOINT_TRANSFER_ITEM_CODE, JOINT_REIMBURSEMENT_ITEM_CODE } from '~~/shared/constants/default-referential'
import { defineEventHandler } from 'h3'
import { db } from '../db/client'
import { sql } from 'drizzle-orm'
import { categoryGroups, profiles } from '../db/schema'
import { seedReferential } from '../utils/seed-referential'

let isBootstrapped = false
let bootstrapError: Error | null = null

/**
 * Repères de schéma vérifiés au démarrage, au-delà de la seule existence des tables.
 *
 * Story 27.1 (D37-D39) : le marqueur `transactions.category_item_code` devient
 * `transactions.category_item_id`, et la présence de la table `profiles` s'y ajoute — une base
 * antérieure à cette migration n'a ni l'une ni l'autre, et doit être refusée au démarrage plutôt
 * que de faire diverger le schéma déclaré et le schéma réel.
 *
 * Pourquoi (revue du 2026-09-04, conservée) : la sonde ne testait que `category_definitions`. Une
 * base antérieure au lot 6.5/6.7 passait donc le bootstrap sans bruit, puis échouait en 500
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
    label: 'table `profiles` — le profil est le propriétaire des données possédées (D37)',
    exists: () => tableNames().includes('profiles'),
  },
  {
    label: 'colonne `transactions.category_item_id` (remplace `category_item_code`, D37)',
    exists: () => tableSql('transactions').includes('category_item_id'),
  },
  {
    label: 'colonne `bank_statements.source` (D44, story 28.4)',
    exists: () => tableSql('bank_statements').includes('source'),
  },
  {
    label: 'table `transactions` sans colonnes de dette (suppression du 2026-09-04)',
    exists: () => !tableSql('transactions').includes('debt_id'),
  },
  {
    label: 'tables du forecast retirées (`debts`, `fixed_charges`, `sas_config`)',
    exists: () => !tableNames().some(n => ['debts', 'debt_events', 'fixed_charges', 'sas_config', 'tax_settings', 'revenue_models', 'monthly_overrides'].includes(n)),
  },
  {
    /*
     * Ce marqueur porte sur des DONNÉES et non sur le schéma, à raison : le moteur d'analyse
     * ignore SILENCIEUSEMENT une ligne dont le poste est absent du référentiel
     * (`analysis-engine.ts`, `if (!ref) continue`). La coupe du compte joint (story 21.1) émet
     * un poste calculé : si la migration 0009/0010 n'a pas tourné, la moitié coupée de chaque
     * virement disparaîtrait des agrégats sans un mot. Mieux vaut refuser de démarrer.
     *
     * Story 27.1 : devient PAR PROFIL — chaque profil ayant des rubriques doit porter ces
     * postes avec leur nature, pas seulement « la base » globalement.
     */
    label: 'postes du compte joint, avec leur nature, sur chaque profil peuplé (migration 0009/0010)',
    exists: () => {
      // Les tables peuvent ne pas exister sur une base très antérieure : la sonde du référentiel
      // à deux niveaux le dit déjà, et interroger quand même ferait remonter une erreur SQLite
      // brute à la place du message qui explique quoi faire. Les sondes sont TOUTES évaluées,
      // y compris après l'échec d'une précédente : celle-ci doit donc se garder elle-même.
      const tables = tableNames()
      if (!tables.includes('category_items') || !tables.includes('category_groups') || !tables.includes('profiles')) {
        return false
      }
      const profileRows = db.all<{ id: number }>(sql`SELECT id FROM profiles`)
      for (const { id: profileId } of profileRows) {
        // Un profil VIERGE n'est pas périmé : le seed, qui suit immédiatement, portera ces
        // postes puisqu'ils sont dans `DEFAULT_REFERENTIAL`. Sans cette porte, cette sonde —
        // qui court AVANT le seed — refusait de démarrer sur toute base neuve, base des tests
        // E2E comprise.
        const seeded = db.all<{ cnt: number }>(sql`SELECT count(*) AS cnt FROM category_groups WHERE profile_id = ${profileId}`)
        if (Number(seeded[0]?.cnt ?? 0) === 0) continue
        // La NATURE est vérifiée, pas seulement la présence : la coupe suppose que l'un est
        // interne et l'autre une dépense. Basculée, elle ferait compter la même moitié deux
        // fois ou la ferait disparaître — sans un mot (revue du 2026-09-08).
        const rows = db.all<{ code: string }>(sql`
          SELECT code FROM category_items
          WHERE profile_id = ${profileId}
            AND ((code = ${JOINT_TRANSFER_ITEM_CODE} AND nature = 'internal_transfer')
              OR (code = ${JOINT_REIMBURSEMENT_ITEM_CODE} AND nature = 'expense'))
        `)
        if (rows.length !== 2) return false
      }
      return true
    },
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
      // `yarn db:migrate-safe` et non `apply-migration` nu : une base périmée porte
      // potentiellement des données réelles, et une migration en retard peut être un rebuild
      // (story 27.1) — la sauvegarde vérifiée et la comparaison avant/après ne sont pas
      // optionnelles ici (revue de la story 27.1).
      + 'Lance `yarn db:migrate-safe` puis relance le serveur.',
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

  // Seed du référentiel initial (D17, AR3), CHAQUE PROFIL SANS RUBRIQUE (story 27.1, D39).
  //
  // Le rejouer pour un profil déjà peuplé, même en `onConflictDoNothing`, ressuscitait au
  // redémarrage suivant tout poste ou rubrique par défaut que l'utilisateur venait de
  // supprimer : une rubrique vidée puis supprimée revenait avec ses postes, en contradiction
  // directe avec FR16 et FR18 (revue du 2026-09-05, comportement anti-résurrection conservé).
  // Le référentiel appartient à l'utilisateur dès son premier peuplement ; on ne le lui
  // réimpose pas. `seedReferential` porte cette garde PAR PROFIL.
  const allProfiles = db.select({ id: profiles.id, name: profiles.name }).from(profiles).all()
  let anySeeded = false
  for (const profile of allProfiles) {
    // Dans une transaction (revue de la story 27.1) : `seedReferential` fait DEUX INSERT
    // (rubriques puis postes) — un crash entre les deux laisserait des rubriques sans postes,
    // que la garde anti-résurrection prendrait ensuite pour un profil « déjà semé » et ne
    // complèterait jamais.
    const { groupsInserted, itemsInserted } = db.transaction(tx => seedReferential(tx, profile.id))
    if (groupsInserted > 0 || itemsInserted > 0) {
      anySeeded = true
      console.warn(
        `[bootstrap] référentiel semé pour le profil « ${profile.name} » `
        + `(${groupsInserted} rubrique(s), ${itemsInserted} poste(s))`,
      )
    }
  }

  if (!anySeeded) {
    console.warn('[bootstrap] OK — base prête (référentiel déjà présent pour tous les profils, seed ignoré)')
  }
  else {
    console.warn('[bootstrap] OK — base prête')
  }
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
