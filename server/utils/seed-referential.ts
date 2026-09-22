import { sql } from 'drizzle-orm'
import type { DB } from '~~/server/db/client'
import { categoryGroups, categoryItems } from '~~/server/db/schema'
import { DEFAULT_REFERENTIAL } from '~~/shared/constants/default-referential'

/** Exécuteur : l'instance globale, ou une transaction en cours. */
type Runner = Pick<DB, 'select' | 'insert'>

/**
 * Sème le référentiel initial (D17, AR3) POUR UN PROFIL, et seulement s'il n'en a aucun.
 *
 * Extrait de `0.bootstrap.ts` (story 27.1, D39) pour être réutilisé par la création de profil
 * (27.3) sans dupliquer la logique d'insertion.
 *
 * **Anti-résurrection (comportement conservé, revue du 2026-09-05).** Semer à chaque appel,
 * même en `onConflictDoNothing`, ressusciterait toute rubrique ou poste par défaut que
 * l'utilisateur vient de supprimer. Le référentiel appartient à l'utilisateur dès son premier
 * peuplement ; on ne le lui réimpose pas. La garde porte donc sur « CE PROFIL a-t-il déjà au
 * moins une rubrique », pas sur l'état global de la base.
 */
export function seedReferential(runner: Runner, profileId: number): { groupsInserted: number, itemsInserted: number } {
  const alreadySeeded = runner
    .select({ cnt: sql<number>`count(*)` })
    .from(categoryGroups)
    .where(sql`${categoryGroups.profileId} = ${profileId}`)
    .get()
  if (Number(alreadySeeded?.cnt ?? 0) > 0) {
    return { groupsInserted: 0, itemsInserted: 0 }
  }

  // Les rubriques d'abord — les postes portent une FK vers elles (par id, pas par code).
  const insertedGroups = runner
    .insert(categoryGroups)
    .values(DEFAULT_REFERENTIAL.map((g, i) => ({ profileId, code: g.code, label: g.label, position: i })))
    .returning({ id: categoryGroups.id, code: categoryGroups.code })
    .all()

  const groupIdByCode = new Map(insertedGroups.map(g => [g.code, g.id]))

  const itemRows = DEFAULT_REFERENTIAL.flatMap(g =>
    g.items.map((item, i) => ({
      profileId,
      code: item.code,
      groupId: groupIdByCode.get(g.code)!,
      label: item.label,
      nature: item.nature,
      position: i,
    })),
  )
  const insertedItems = runner
    .insert(categoryItems)
    .values(itemRows)
    .returning({ id: categoryItems.id })
    .all()

  return { groupsInserted: insertedGroups.length, itemsInserted: insertedItems.length }
}
