import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryDefinitions } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { notFound } from '~~/server/utils/errors'
import { CategoryPatchSchema } from '~~/shared/schemas/category.schema'
import type { CategoryListItem } from './index.get'

/**
 * Renomme une catégorie (Story 5.6) : seul le `label` change. Le `code` et `isVariable`
 * sont immuables (FK transactions/charges/overrides préservés) — `.strict()` rejette toute
 * autre clé en 422. Catégorie introuvable → 404. Le rename d'une catégorie protégée
 * (`divers`) est autorisé — c'est le `code` qui est protégé, pas le libellé.
 */
export default defineEventHandler(async (event): Promise<Omit<CategoryListItem, 'referenceCount'>> => {
  const code = getRouterParam(event, 'code')!
  const body = await validateBody(event, CategoryPatchSchema)

  const updated = db
    .update(categoryDefinitions)
    .set({ label: body.label })
    .where(eq(categoryDefinitions.code, code))
    .returning({
      code: categoryDefinitions.code,
      label: categoryDefinitions.label,
      isVariable: categoryDefinitions.isVariable,
    })
    .get()

  if (!updated) throw notFound()
  return updated
})
