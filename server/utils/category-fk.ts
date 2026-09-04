import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryItems, categoryGroups } from '~~/server/db/schema'
import { domainError } from './errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Pré-check d'existence d'un poste avant insertion/mise à jour.
 *
 * SQLite remonte une violation de FK en erreur opaque ; on la transforme en 422 lisible.
 * Ce contrôle n'est pas cosmétique depuis D20 : sondé le 2026-09-04, le modèle a renvoyé un
 * code de poste absent du référentiel dans une réponse pourtant conforme au schéma. Un JSON
 * valide ne garantit pas des valeurs valides.
 */
export async function assertCategoryItemExists(itemCode: string): Promise<void> {
  const item = await db
    .select({ code: categoryItems.code })
    .from(categoryItems)
    .where(eq(categoryItems.code, itemCode))
    .limit(1)
  if (item.length === 0) {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'unknown categoryItemCode', value: itemCode },
      422,
    )
  }
}

/** Pré-check d'existence d'une rubrique, à la création d'un poste. */
export function assertGroupExists(groupCode: string): void {
  const row = db
    .select({ code: categoryGroups.code })
    .from(categoryGroups)
    .where(eq(categoryGroups.code, groupCode))
    .limit(1)
    .get()
  if (row === undefined) {
    throw domainError(ApiErrorCode.GroupNotFound, { groupCode }, 404)
  }
}
