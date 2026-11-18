import { defineEventHandler } from 'h3'
import { asc, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryGroups, categoryItems } from '~~/server/db/schema'
import { transactionCountsByItem } from '~~/server/utils/category-references'
import type { CategoryGroupWithItems } from '~~/shared/schemas/category.schema'
import { requireProfile } from '~~/server/utils/current-profile'

/**
 * Référentiel complet : rubriques et leurs postes (FR15), avec le nombre de transactions
 * référençant chaque poste.
 *
 * Ce compteur vient de la même source que le refus de suppression
 * (`server/utils/category-references.ts`) : la règle ne doit exister qu'à un seul endroit,
 * sinon l'UI et le serveur divergent sur ce qui est supprimable (revue 2026-08-04).
 *
 * Tri : `position` puis libellé. Le tri par libellé se fait en JS avec `localeCompare('fr')` —
 * le `ORDER BY` de SQLite est en collation binaire, qui classe « École » et « énergie » après
 * « Zoo ».
 */
export default defineEventHandler(async (event): Promise<CategoryGroupWithItems[]> => {
  const profileId = requireProfile(event)

  const groups = await db
    .select()
    .from(categoryGroups)
    .where(eq(categoryGroups.profileId, profileId))
    .orderBy(asc(categoryGroups.position))

  const items = await db
    .select()
    .from(categoryItems)
    .where(eq(categoryItems.profileId, profileId))
    .orderBy(asc(categoryItems.position))

  const counts = transactionCountsByItem(profileId)

  const byPositionThenLabel = <T extends { position: number, label: string }>(a: T, b: T) =>
    a.position - b.position || a.label.localeCompare(b.label, 'fr')

  return groups
    .map(g => ({
      code: g.code,
      label: g.label,
      position: g.position,
      items: items
        .filter(i => i.groupId === g.id)
        .map(i => ({
          code: i.code,
          groupCode: g.code,
          label: i.label,
          nature: i.nature,
          position: i.position,
          transactionCount: counts.get(i.code) ?? 0,
        }))
        .sort(byPositionThenLabel),
    }))
    .sort(byPositionThenLabel)
})
