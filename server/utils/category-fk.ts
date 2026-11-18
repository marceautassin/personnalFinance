import { and, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryItems, categoryGroups } from '~~/server/db/schema'
import { domainError } from './errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Résolution code → id, TOUJOURS dans le profil (story 27.1, D37) : un code de poste ou de
 * rubrique n'est unique qu'à l'intérieur d'un profil, jamais globalement.
 *
 * Remplace `assertCategoryItemExists`/`assertGroupExists`, qui ne faisaient que vérifier une
 * existence sans rendre l'id — désormais indispensable puisque `transactions` et
 * `classification_rules` référencent le poste par `category_item_id` (AC 4).
 *
 * SQLite remonte une violation de FK en erreur opaque ; ce pré-check la transforme en 422/404
 * lisibles. Pas cosmétique depuis D20 : sondé le 2026-09-04, le modèle a renvoyé un code de
 * poste absent du référentiel dans une réponse pourtant conforme au schéma. Un JSON valide ne
 * garantit pas des valeurs valides.
 */
export async function resolveItemId(profileId: number, itemCode: string): Promise<number> {
  const item = await db
    .select({ id: categoryItems.id })
    .from(categoryItems)
    .where(and(eq(categoryItems.profileId, profileId), eq(categoryItems.code, itemCode)))
    .limit(1)
  if (item.length === 0) {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'unknown categoryItemCode', value: itemCode },
      422,
    )
  }
  return item[0]!.id
}

/** Résout une rubrique par son code, dans le profil. À la création d'un poste. */
export function resolveGroupId(profileId: number, groupCode: string): number {
  const row = db
    .select({ id: categoryGroups.id })
    .from(categoryGroups)
    .where(and(eq(categoryGroups.profileId, profileId), eq(categoryGroups.code, groupCode)))
    .limit(1)
    .get()
  if (row === undefined) {
    throw domainError(ApiErrorCode.GroupNotFound, { groupCode }, 404)
  }
  return row.id
}
