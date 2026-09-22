import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryGroups } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertGroupLabelAvailable } from '~~/server/utils/category-labels'
import { requireProfile } from '~~/server/utils/current-profile'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { CategoryGroupPatchSchema, type CategoryGroup } from '~~/shared/schemas/category.schema'

/**
 * Renomme une rubrique (FR16). Le `code` est immuable : il compose celui de ses postes
 * (`<rubrique>-<poste>`, AR4), et le changer imposerait de réécrire chaque poste et chaque
 * transaction qui les référence.
 */
export default defineEventHandler(async (event): Promise<CategoryGroup> => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await validateBody(event, CategoryGroupPatchSchema)
  const profileId = requireProfile(event)

  const existing = db
    .select({ code: categoryGroups.code })
    .from(categoryGroups)
    .where(eq(categoryGroups.code, code))
    .get()
  if (!existing) throw domainError(ApiErrorCode.GroupNotFound, { code }, 404)

  assertGroupLabelAvailable(profileId, body.label, code)

  return db
    .update(categoryGroups)
    .set({ label: body.label })
    .where(eq(categoryGroups.code, code))
    .returning({
      code: categoryGroups.code,
      label: categoryGroups.label,
      position: categoryGroups.position,
    })
    .get()
})
