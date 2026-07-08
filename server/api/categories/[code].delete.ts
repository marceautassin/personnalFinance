import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { eq, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryDefinitions, transactions, fixedCharges } from '~~/server/db/schema'
import { notFound, domainError } from '~~/server/utils/errors'
import { monthlyOverridesTableExists } from '~~/server/utils/monthly-overrides'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { isProtectedCategory } from '~~/shared/constants/protected-categories'

/** Compte les lignes référençant `code` dans une table via `category_code`. */
function refCount(table: typeof transactions | typeof fixedCharges, code: string): number {
  const row = db
    .select({ cnt: sql<number>`count(*)` })
    .from(table)
    .where(eq(table.categoryCode, code))
    .get()
  return Number(row?.cnt ?? 0)
}

/** Compte les `monthly_overrides` référençant `code` (table absente avant Story 7.2 → 0). */
function overrideRefCount(code: string): number {
  if (!monthlyOverridesTableExists()) return 0
  const row = db.get<{ cnt: number }>(
    sql`SELECT count(*) AS cnt FROM monthly_overrides WHERE category_code = ${code}`,
  )
  return Number(row?.cnt ?? 0)
}

/**
 * Supprime une catégorie (Story 5.6). Refus si :
 *  - catégorie système protégée (`divers`) → 409 `category_protected`
 *  - au moins une référence (transaction / charge fixe / override) → 409 `category_in_use` + counts
 * Catégorie introuvable → 404. Succès → 204, aucune donnée retournée.
 */
export default defineEventHandler(async (event): Promise<null> => {
  const code = getRouterParam(event, 'code')!

  const existing = db
    .select({ code: categoryDefinitions.code })
    .from(categoryDefinitions)
    .where(eq(categoryDefinitions.code, code))
    .limit(1)
    .get()
  if (!existing) throw notFound()

  if (isProtectedCategory(code)) {
    throw domainError(ApiErrorCode.CategoryProtected, { code, reason: 'used_as_fallback' }, 409)
  }

  const transactionCount = refCount(transactions, code)
  const fixedChargeCount = refCount(fixedCharges, code)
  const monthlyOverrideCount = overrideRefCount(code)
  if (transactionCount + fixedChargeCount + monthlyOverrideCount > 0) {
    throw domainError(
      ApiErrorCode.CategoryInUse,
      { transactionCount, fixedChargeCount, monthlyOverrideCount },
      409,
    )
  }

  db.delete(categoryDefinitions).where(eq(categoryDefinitions.code, code)).run()
  setResponseStatus(event, 204)
  return null
})
