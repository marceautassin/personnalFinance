import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryGroups } from '~~/server/db/schema'
import { groupItemCount } from '~~/server/utils/category-references'
import { requireProfile } from '~~/server/utils/current-profile'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { isProtectedGroup } from '~~/shared/constants/protected-categories'

/**
 * Supprime une rubrique vide (FR16, FR18).
 *
 * Refus dans deux cas, et l'ordre compte : une rubrique protégée le reste même vide.
 *  - rubrique système (`divers` héberge le poste de repli, `internes` est la seule
 *    destination de la nature `internal_transfer`) → 409 `category_protected` ;
 *  - rubrique encore peuplée → 409 `group_not_empty`, avec le nombre de postes bloquants.
 *    La FK `ON DELETE RESTRICT` le garantit côté base ; ce contrôle rend le refus lisible.
 */
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? ''
  const profileId = requireProfile(event)

  const existing = db
    .select({ code: categoryGroups.code })
    .from(categoryGroups)
    .where(and(eq(categoryGroups.code, code), eq(categoryGroups.profileId, profileId)))
    .get()
  if (!existing) throw domainError(ApiErrorCode.GroupNotFound, { code }, 404)

  if (isProtectedGroup(code)) {
    throw domainError(ApiErrorCode.CategoryProtected, { code }, 409)
  }

  const itemCount = groupItemCount(profileId, code)
  if (itemCount > 0) {
    throw domainError(ApiErrorCode.GroupNotEmpty, { code, itemCount }, 409)
  }

  db.delete(categoryGroups).where(and(eq(categoryGroups.code, code), eq(categoryGroups.profileId, profileId))).run()
  setResponseStatus(event, 204)
  return null
})
