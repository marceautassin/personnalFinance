import { defineEventHandler } from 'h3'
import { db } from '~~/server/db/client'
import { categoryDefinitions } from '~~/server/db/schema'
import { referenceCountsByCategory } from '~~/server/utils/category-references'
import type { CategoryWithCount } from '~~/shared/schemas/category.schema'

/**
 * Contrat de sortie du listing = `CategoryWithCountSchema` (AC#4). L'interface était
 * redéclarée à la main ici, en parallèle du schéma : deux sources de vérité qui pouvaient
 * diverger sans que rien ne le signale (revue 2026-08-04). `referenceCount` = transactions
 * + charges fixes + overrides ; > 0 bloque la suppression.
 */
export type CategoryListItem = CategoryWithCount

/**
 * Référentiel des catégories + compteur de références (Story 5.6, étend Story 2.10).
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

  // Même source de vérité que le refus de suppression (`server/utils/category-references.ts`) :
  // la liste des tables référençantes ne doit exister qu'à un seul endroit, sinon l'UI et le
  // serveur divergent sur ce qui est supprimable (revue 2026-08-04).
  const counts = referenceCountsByCategory()

  const withCount = rows.map(r => ({ ...r, referenceCount: counts.get(r.code) ?? 0 }))

  // Variables avant fixes, label alpha à l'intérieur de chaque groupe. Tri en JS avec
  // `localeCompare('fr')` : le ORDER BY SQLite est en collation binaire (code-point), qui
  // classe mal accents et minuscules (« École » ou « énergie » atterrit après « Zoo »).
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'fr')
  return [
    ...withCount.filter(r => r.isVariable).sort(byLabel),
    ...withCount.filter(r => !r.isVariable).sort(byLabel),
  ]
})
