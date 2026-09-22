import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryItems, categoryGroups } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertItemLabelAvailable } from '~~/server/utils/category-labels'
import { itemTransactionCount } from '~~/server/utils/category-references'
import { requireProfile } from '~~/server/utils/current-profile'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { CategoryItemPatchSchema, type CategoryItemWithCount } from '~~/shared/schemas/category.schema'
import {
  ACCEPT_GAP_ITEM_CODE,
  JOINT_TRANSFER_ITEM_CODE,
  JOINT_REIMBURSEMENT_ITEM_CODE,
} from '~~/shared/constants/default-referential'

/**
 * Postes dont la NATURE est verrouillée.
 *
 * Les deux postes du compte joint s'y ajoutent (story 21.1) : le moteur les nomme, et la coupe
 * suppose que l'un est interne et l'autre une dépense. Basculer l'un des deux ferait compter la
 * même moitié deux fois, ou la ferait disparaître — sans que rien ne le dise.
 */
const NATURE_LOCKED_ITEMS = new Set([
  ACCEPT_GAP_ITEM_CODE,
  JOINT_TRANSFER_ITEM_CODE,
  JOINT_REIMBURSEMENT_ITEM_CODE,
])

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
  const profileId = requireProfile(event)

  const existing = db
    .select({ code: categoryItems.code, groupCode: categoryGroups.code })
    .from(categoryItems)
    .innerJoin(categoryGroups, eq(categoryGroups.id, categoryItems.groupId))
    .where(eq(categoryItems.code, code))
    .get()
  if (!existing) throw domainError(ApiErrorCode.NotFound, { code }, 404)

  if (body.label !== undefined) {
    assertItemLabelAvailable(profileId, existing.groupCode, body.label, code)
  }

  // La nature du poste d'écart accepté n'est pas modifiable (story 17.3). La basculer en
  // recette ferait entrer une différence inexpliquée dans le résultat de la période — ce que
  // le correctif vient précisément d'empêcher. Le libellé, lui, reste libre.
  if (body.nature !== undefined && NATURE_LOCKED_ITEMS.has(code)) {
    throw domainError(ApiErrorCode.CategoryProtected, { code, field: 'nature' }, 409)
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
      label: categoryItems.label,
      nature: categoryItems.nature,
      position: categoryItems.position,
    })
    .get()

  return { ...updated, groupCode: existing.groupCode, transactionCount: itemTransactionCount(code) }
})
