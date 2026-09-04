import { defineEventHandler, setResponseStatus } from 'h3'
import { eq, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryGroups } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertGroupLabelAvailable } from '~~/server/utils/category-labels'
import {
  NewCategoryGroupInputSchema,
  slugifyCategoryLabel,
  GROUP_CODE_MAX_LENGTH,
  type CategoryGroupWithItems,
} from '~~/shared/schemas/category.schema'

function groupCodeExists(code: string): boolean {
  return db
    .select({ code: categoryGroups.code })
    .from(categoryGroups)
    .where(eq(categoryGroups.code, code))
    .limit(1)
    .get() !== undefined
}

/**
 * Résout un `code` libre : `base`, puis `base-2`, `base-3`…
 *
 * La base est bornée à `GROUP_CODE_MAX_LENGTH` et non aux 32 caractères d'un code : le code de
 * rubrique préfixe celui de ses postes, et le laisser s'étendre rendait la rubrique stérile
 * (revue du 2026-09-05). Elle est re-tronquée pour laisser la place au suffixe de collision —
 * tronquer PUIS concaténer produisait un code hors borne (revue 2026-08-04).
 */
function resolveUniqueGroupCode(label: string): string {
  const base = slugifyCategoryLabel(label, GROUP_CODE_MAX_LENGTH)
  if (!groupCodeExists(base)) return base
  for (let i = 2; ; i++) {
    const suffix = `-${i}`
    const truncated = slugifyCategoryLabel(label, GROUP_CODE_MAX_LENGTH - suffix.length)
    const candidate = `${truncated}${suffix}`
    if (!groupCodeExists(candidate)) return candidate
  }
}

/** Crée une rubrique (FR16). Elle naît vide, en dernière position. */
export default defineEventHandler(async (event): Promise<CategoryGroupWithItems> => {
  const body = await validateBody(event, NewCategoryGroupInputSchema)
  assertGroupLabelAvailable(body.label)

  const maxPosition = db
    .select({ max: sql<number | null>`max(${categoryGroups.position})` })
    .from(categoryGroups)
    .get()

  const inserted = db
    .insert(categoryGroups)
    .values({
      code: resolveUniqueGroupCode(body.label),
      label: body.label,
      position: Number(maxPosition?.max ?? -1) + 1,
    })
    .returning({
      code: categoryGroups.code,
      label: categoryGroups.label,
      position: categoryGroups.position,
    })
    .get()

  setResponseStatus(event, 201)
  return { ...inserted, items: [] }
})
