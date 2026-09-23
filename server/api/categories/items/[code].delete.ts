import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryItems } from '~~/server/db/schema'
import { itemTransactionCount } from '~~/server/utils/category-references'
import { requireProfile } from '~~/server/utils/current-profile'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { isProtectedItem } from '~~/shared/constants/protected-categories'

/**
 * Supprime un poste non référencé (FR16, FR18).
 *
 * Le poste de repli est protégé : le supprimer casserait la réconciliation `accept_gap` et
 * la catégorisation LLM, qui n'auraient plus de destination pour ce qu'elles ne savent pas
 * classer.
 *
 * Un poste référencé par des transactions est refusé avec leur nombre. La FK
 * `ON DELETE RESTRICT` le garantit côté base même en cas d'appel direct à l'API ; ce contrôle
 * rend le refus lisible plutôt qu'opaque.
 */
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const profileId = requireProfile(event)

  const existing = db
    .select({ code: categoryItems.code })
    .from(categoryItems)
    .where(and(eq(categoryItems.code, code), eq(categoryItems.profileId, profileId)))
    .get()
  if (!existing) throw domainError(ApiErrorCode.NotFound, { code }, 404)

  if (isProtectedItem(code)) {
    throw domainError(ApiErrorCode.CategoryProtected, { code }, 409)
  }

  const transactionCount = itemTransactionCount(profileId, code)
  if (transactionCount > 0) {
    throw domainError(ApiErrorCode.CategoryInUse, { code, transactionCount }, 409)
  }

  db.delete(categoryItems).where(and(eq(categoryItems.code, code), eq(categoryItems.profileId, profileId))).run()
  setResponseStatus(event, 204)
  return null
})
