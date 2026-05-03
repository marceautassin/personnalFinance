import { defineEventHandler } from 'h3'
import { asc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryDefinitions } from '~~/server/db/schema'

export interface CategoryListItem {
  code: string
  label: string
  isVariable: boolean
}

/**
 * Référentiel des catégories — utilisé par `CategoryEditor` (Story 2.10).
 * Tri : variables d'abord (alpha), puis fixes (alpha). Stable côté client.
 */
export default defineEventHandler(async (): Promise<CategoryListItem[]> => {
  const rows = await db
    .select({
      code: categoryDefinitions.code,
      label: categoryDefinitions.label,
      isVariable: categoryDefinitions.isVariable,
    })
    .from(categoryDefinitions)
    .orderBy(asc(categoryDefinitions.label))

  // Variables avant fixes, label alpha à l'intérieur de chaque groupe.
  return [
    ...rows.filter(r => r.isVariable),
    ...rows.filter(r => !r.isVariable),
  ]
})
