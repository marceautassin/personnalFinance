import { and, eq, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, categoryItems, categoryGroups, bankStatements } from '~~/server/db/schema'

/**
 * Source de vérité UNIQUE du comptage des références au référentiel.
 *
 * Pourquoi (revue 2026-08-04) : la règle était écrite deux fois — dans le listing (compteur
 * affiché, qui conditionne le bouton Supprimer) et dans le handler DELETE (refus). Ajouter
 * une table référençante en n'éditant qu'un des deux faisait diverger l'UI et le serveur :
 * bouton actif mais 409 inexpliqué, ou bouton grisé mais suppression autorisée.
 *
 * Depuis D17, deux niveaux de référence coexistent : les transactions référencent un POSTE,
 * les postes référencent une RUBRIQUE. Les deux bloquent la suppression, pour la même raison
 * et par la même FK `ON DELETE RESTRICT`.
 *
 * Story 27.1 (D37) : `transactions.category_item_id` et `category_items.group_id` sont des id,
 * pas des codes. Ces fonctions gardent une API en CODES — celle que les endpoints manipulent —
 * et joignent en interne pour la résoudre.
 *
 * Story 27.2 (D37) : chacune prend `profileId` en premier paramètre. `transactions` n'a pas de
 * `profile_id` (D37) — le comptage passe par `category_items.profile_id` (bloque déjà le poste
 * dans le bon profil) et, pour `transactionCountsByItem`, par une jointure sur `bank_statements`
 * pour n'ajouter que les transactions du profil dans le compteur.
 */

/** Exécuteur de requêtes : l'instance globale, ou la transaction en cours. */
type QueryRunner = Pick<typeof db, 'select'>

/**
 * Nombre de transactions référençant un poste DU PROFIL, par son code. > 0 ⇒ suppression
 * refusée (FR18).
 */
export function itemTransactionCount(profileId: number, itemCode: string, runner: QueryRunner = db): number {
  const row = runner
    .select({ cnt: sql<number>`count(*)` })
    .from(transactions)
    .innerJoin(categoryItems, eq(categoryItems.id, transactions.categoryItemId))
    .where(and(eq(categoryItems.code, itemCode), eq(categoryItems.profileId, profileId)))
    .get()
  return Number(row?.cnt ?? 0)
}

/** Nombre de transactions par poste (par code) DU PROFIL, pour tout le référentiel d'un coup (listing). */
export function transactionCountsByItem(profileId: number): Map<string, number> {
  const rows = db
    .select({ code: categoryItems.code, cnt: sql<number>`count(*)` })
    .from(transactions)
    .innerJoin(categoryItems, eq(categoryItems.id, transactions.categoryItemId))
    // `transactions` n'a pas de `profile_id` (D37) : jointure au relevé pour restreindre au
    // profil courant — sans elle, ce compteur mélangerait les transactions de tous les profils.
    .innerJoin(bankStatements, eq(bankStatements.hashSha256, transactions.statementHash))
    .where(and(eq(categoryItems.profileId, profileId), eq(bankStatements.profileId, profileId)))
    .groupBy(categoryItems.code)
    .all()
  return new Map(rows.map(r => [r.code, Number(r.cnt)]))
}

/** Nombre de postes rattachés à une rubrique DU PROFIL, par son code. > 0 ⇒ suppression refusée. */
export function groupItemCount(profileId: number, groupCode: string, runner: QueryRunner = db): number {
  const row = runner
    .select({ cnt: sql<number>`count(*)` })
    .from(categoryItems)
    .innerJoin(categoryGroups, eq(categoryGroups.id, categoryItems.groupId))
    .where(and(eq(categoryGroups.code, groupCode), eq(categoryGroups.profileId, profileId)))
    .get()
  return Number(row?.cnt ?? 0)
}
