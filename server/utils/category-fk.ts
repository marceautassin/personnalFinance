import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryDefinitions } from '~~/server/db/schema'
import { domainError } from './errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Pré-check d'existence d'une catégorie avant insertion/mise à jour.
 * SQLite remonte une FK violation en erreur opaque ; on la transforme en 422
 * `validation_failed` lisible côté client (même pattern que transactions/[id].patch.ts).
 * Mutualisé entre POST et PUT /api/fixed-charges.
 */
export async function assertCategoryExists(categoryCode: string): Promise<void> {
  const cat = await db
    .select({ code: categoryDefinitions.code })
    .from(categoryDefinitions)
    .where(eq(categoryDefinitions.code, categoryCode))
    .limit(1)
  if (cat.length === 0) {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'unknown categoryCode', value: categoryCode },
      422,
    )
  }
}
