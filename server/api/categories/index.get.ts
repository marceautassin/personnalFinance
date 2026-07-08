import { defineEventHandler } from 'h3'
import { sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { categoryDefinitions, transactions, fixedCharges } from '~~/server/db/schema'
import { monthlyOverridesTableExists } from '~~/server/utils/monthly-overrides'

export interface CategoryListItem {
  code: string
  label: string
  isVariable: boolean
  /** Nombre de références (transactions + charges fixes + overrides) — bloque la suppression. */
  referenceCount: number
}

/** Compte les lignes par `category_code` d'une table, en map `code → count`. */
function countByCategory(table: typeof transactions | typeof fixedCharges): Map<string, number> {
  const rows = db
    .select({ code: table.categoryCode, cnt: sql<number>`count(*)` })
    .from(table)
    .groupBy(table.categoryCode)
    .all()
  return new Map(rows.map(r => [r.code, Number(r.cnt)]))
}

/**
 * Compte `monthly_overrides` par catégorie. La table n'existe pas avant la story 7.2
 * (cf. `monthlyOverridesTableExists`) : retourne une map vide tant qu'elle est absente.
 */
function countOverridesByCategory(): Map<string, number> {
  if (!monthlyOverridesTableExists()) return new Map()
  const rows = db.all<{ code: string, cnt: number }>(
    sql`SELECT category_code AS code, count(*) AS cnt FROM monthly_overrides GROUP BY category_code`,
  )
  return new Map(rows.map(r => [r.code, Number(r.cnt)]))
}

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

  const txCounts = countByCategory(transactions)
  const chargeCounts = countByCategory(fixedCharges)
  const overrideCounts = countOverridesByCategory()

  const withCount = rows.map(r => ({
    ...r,
    referenceCount:
      (txCounts.get(r.code) ?? 0)
      + (chargeCounts.get(r.code) ?? 0)
      + (overrideCounts.get(r.code) ?? 0),
  }))

  // Variables avant fixes, label alpha à l'intérieur de chaque groupe. Tri en JS avec
  // `localeCompare('fr')` : le ORDER BY SQLite est en collation binaire (code-point), qui
  // classe mal accents et minuscules (« École » ou « énergie » atterrit après « Zoo »).
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'fr')
  return [
    ...withCount.filter(r => r.isVariable).sort(byLabel),
    ...withCount.filter(r => !r.isVariable).sort(byLabel),
  ]
})
