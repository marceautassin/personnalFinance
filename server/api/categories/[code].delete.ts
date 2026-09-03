import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryDefinitions } from '~~/server/db/schema'
import { notFound, domainError } from '~~/server/utils/errors'
import { categoryReferenceCounts, totalReferences } from '~~/server/utils/category-references'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { isProtectedCategory } from '~~/shared/constants/protected-categories'

/** Vrai si l'erreur est une violation de clé étrangère SQLite. */
function isForeignKeyViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT_FOREIGNKEY')
}

/**
 * Supprime une catégorie (Story 5.6). Refus si :
 *  - catégorie système protégée (`divers`) → 409 `category_protected`
 *  - au moins une référence (transaction / charge fixe / override) → 409 `category_in_use` + counts
 * Catégorie introuvable → 404. Succès → 204, aucune donnée retournée.
 *
 * Comptage et suppression sont dans une même transaction, et le `catch` traduit une violation
 * FK en 409 plutôt qu'en 500.
 *
 * Portée réelle (précisée à la revue 2026-09-04) : dans ce process, `categoryReferenceCounts`
 * et le `DELETE` sont deux appels better-sqlite3 SYNCHRONES sans `await` intercalé — aucun
 * interleaving n'est possible entre eux. La transaction ne protège donc que d'un second
 * process ou d'une seconde connexion écrivant sur le même fichier, ce que la V1 mono-utilisateur
 * ne fait pas. C'est une ceinture, pas la correction d'une course observable aujourd'hui.
 */
export default defineEventHandler(async (event): Promise<null> => {
  const code = getRouterParam(event, 'code')
  if (!code) throw notFound()

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

  try {
    db.transaction((tx) => {
      const counts = categoryReferenceCounts(code, tx)
      if (totalReferences(counts) > 0) {
        throw domainError(ApiErrorCode.CategoryInUse, counts, 409)
      }
      tx.delete(categoryDefinitions).where(eq(categoryDefinitions.code, code)).run()
    })
  }
  catch (err) {
    if (isForeignKeyViolation(err)) {
      throw domainError(ApiErrorCode.CategoryInUse, categoryReferenceCounts(code), 409)
    }
    throw err
  }

  setResponseStatus(event, 204)
  return null
})
