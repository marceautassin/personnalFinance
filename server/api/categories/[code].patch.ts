import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryDefinitions } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { notFound } from '~~/server/utils/errors'
import { CategoryPatchSchema, type Category } from '~~/shared/schemas/category.schema'
import { assertLabelAvailable } from '~~/server/utils/category-labels'

/**
 * Renomme une catégorie (Story 5.6) : seul le `label` change. Le `code` et `isVariable`
 * sont immuables (FK transactions/charges/overrides préservés) — `.strict()` rejette toute
 * autre clé en 422. Catégorie introuvable → 404, libellé déjà pris → 409. Le rename d'une
 * catégorie protégée (`divers`) est autorisé — c'est le `code` qui est protégé, pas le libellé.
 */
export default defineEventHandler(async (event): Promise<Category> => {
  // Pas de `!` : un paramètre absent partirait en `eq(code, undefined)` et remonterait une
  // erreur Drizzle en 500 au lieu d'un 404 lisible (revue 2026-08-04).
  const code = getRouterParam(event, 'code')
  if (!code) throw notFound()

  const body = await validateBody(event, CategoryPatchSchema)

  assertLabelAvailable(body.label, code)

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
