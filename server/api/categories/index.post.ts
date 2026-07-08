import { defineEventHandler, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryDefinitions } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { NewCategoryInputSchema, slugifyCategoryLabel } from '~~/shared/schemas/category.schema'
import type { CategoryListItem } from './index.get'

/** Vrai si le `code` existe déjà en base. */
function codeExists(code: string): boolean {
  const row = db
    .select({ code: categoryDefinitions.code })
    .from(categoryDefinitions)
    .where(eq(categoryDefinitions.code, code))
    .limit(1)
    .get()
  return row !== undefined
}

/** Résout un `code` libre : `base`, puis `base-2`, `base-3`… (plus petit suffixe disponible). */
function resolveUniqueCode(base: string): string {
  if (!codeExists(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`
    if (!codeExists(candidate)) return candidate
  }
}

/**
 * Crée une catégorie (Story 5.6). Le `code` est généré par slugification du `label` ;
 * collision → suffixe `-2`/`-3`… Un `label` produisant un code vide (`'!!!'`) est rejeté
 * en amont par `NewCategoryInputSchema` (422), donc `slugifyCategoryLabel` renvoie ici un
 * code non vide. Retour 201 avec la catégorie complète (`referenceCount: 0`).
 */
export default defineEventHandler(async (event): Promise<CategoryListItem> => {
  const body = await validateBody(event, NewCategoryInputSchema)

  const code = resolveUniqueCode(slugifyCategoryLabel(body.label))
  const inserted = db
    .insert(categoryDefinitions)
    .values({ code, label: body.label, isVariable: body.isVariable })
    .returning({
      code: categoryDefinitions.code,
      label: categoryDefinitions.label,
      isVariable: categoryDefinitions.isVariable,
    })
    .get()

  setResponseStatus(event, 201)
  return { ...inserted, referenceCount: 0 }
})
