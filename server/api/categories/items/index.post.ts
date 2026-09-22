import { defineEventHandler, setResponseStatus } from 'h3'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryItems } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertItemLabelAvailable } from '~~/server/utils/category-labels'
import { resolveGroupId } from '~~/server/utils/category-fk'
import { requireProfile } from '~~/server/utils/current-profile'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import {
  NewCategoryItemInputSchema,
  slugifyCategoryLabel,
  itemSlugBudget,
  type CategoryItemWithCount,
} from '~~/shared/schemas/category.schema'

function itemCodeExists(profileId: number, code: string): boolean {
  return db
    .select({ code: categoryItems.code })
    .from(categoryItems)
    .where(and(eq(categoryItems.profileId, profileId), eq(categoryItems.code, code)))
    .limit(1)
    .get() !== undefined
}

/**
 * Résout un code `<rubrique>-<poste>` libre, borné à 32 caractères au total (AR4).
 *
 * Le budget du slug se calcule à partir du code de rubrique, et se re-réduit pour laisser la
 * place au suffixe de collision — tronquer puis concaténer produisait un code hors borne
 * (revue 2026-08-04, même défaut sur le référentiel plat).
 */
function resolveUniqueItemCode(profileId: number, groupCode: string, label: string): string {
  const budget = itemSlugBudget(groupCode)
  const base = slugifyCategoryLabel(label, budget)
  if (base.length === 0) {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'group code leaves no room for an item slug', groupCode },
      422,
    )
  }
  const full = `${groupCode}-${base}`
  if (!itemCodeExists(profileId, full)) return full
  for (let i = 2; ; i++) {
    const suffix = `-${i}`
    const truncated = slugifyCategoryLabel(label, budget - suffix.length)
    // Sans cette garde, un budget épuisé produisait `rubrique--2`, `rubrique--3` : valide au
    // regard du regex, mais illisible et sans rapport avec le libellé saisi.
    if (truncated.length === 0) {
      throw domainError(
        ApiErrorCode.ValidationFailed,
        { reason: 'no room left for a unique item slug', groupCode, label },
        422,
      )
    }
    const candidate = `${groupCode}-${truncated}${suffix}`
    if (!itemCodeExists(profileId, candidate)) return candidate
  }
}

/**
 * Crée un poste sous une rubrique (FR16, FR17). La `nature` est obligatoire — un poste sans
 * nature n'a pas de place dans l'arbre d'analyse.
 *
 * L'unicité du libellé n'est vérifiée qu'à l'intérieur de la rubrique : « Restaurant » doit
 * pouvoir coexister sous Alimentation et sous Voyages (FR19).
 */
export default defineEventHandler(async (event): Promise<CategoryItemWithCount> => {
  const body = await validateBody(event, NewCategoryItemInputSchema)
  const profileId = requireProfile(event)

  const groupId = resolveGroupId(profileId, body.groupCode)
  assertItemLabelAvailable(profileId, body.groupCode, body.label)

  const maxPosition = db
    .select({ max: sql<number | null>`max(${categoryItems.position})` })
    .from(categoryItems)
    .where(eq(categoryItems.groupId, groupId))
    .get()

  const inserted = db
    .insert(categoryItems)
    .values({
      profileId,
      code: resolveUniqueItemCode(profileId, body.groupCode, body.label),
      groupId,
      label: body.label,
      nature: body.nature,
      position: Number(maxPosition?.max ?? -1) + 1,
    })
    .returning({
      code: categoryItems.code,
      label: categoryItems.label,
      nature: categoryItems.nature,
      position: categoryItems.position,
    })
    .get()

  setResponseStatus(event, 201)
  return { ...inserted, groupCode: body.groupCode, transactionCount: 0 }
})
