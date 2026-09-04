import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryItems } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertItemLabelAvailable } from '~~/server/utils/category-labels'
import { itemTransactionCount } from '~~/server/utils/category-references'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { CategoryItemPatchSchema, type CategoryItemWithCount } from '~~/shared/schemas/category.schema'

/**
 * Modifie le libellé et/ou la nature d'un poste (FR16, FR17).
 *
 * Changer la nature reclasse d'un coup toutes les transactions du poste — c'est voulu, et
 * c'est ce qui rend la correction supportable quand un poste entier a été mal orienté. Rien
 * n'est écrit sur les transactions elles-mêmes : leur nature est celle de leur poste (D17),
 * et elle est donc corrigée par construction.
 */
export default defineEventHandler(async (event): Promise<CategoryItemWithCount> => {
  const code = getRouterParam(event, 'code') ?? ''
  const body = await validateBody(event, CategoryItemPatchSchema)

  const existing = db
    .select({ code: categoryItems.code, groupCode: categoryItems.groupCode })
    .from(categoryItems)
    .where(eq(categoryItems.code, code))
    .get()
  if (!existing) throw domainError(ApiErrorCode.NotFound, { code }, 404)

  if (body.label !== undefined) {
    assertItemLabelAvailable(existing.groupCode, body.label, code)
  }

  const updated = db
    .update(categoryItems)
    .set({
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.nature !== undefined ? { nature: body.nature } : {}),
    })
    .where(eq(categoryItems.code, code))
    .returning({
      code: categoryItems.code,
      groupCode: categoryItems.groupCode,
      label: categoryItems.label,
      nature: categoryItems.nature,
      position: categoryItems.position,
    })
    .get()

  return { ...updated, transactionCount: itemTransactionCount(code) }
})
