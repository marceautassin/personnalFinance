import { eq, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions } from '~~/server/db/schema'

/**
 * Source de vérité UNIQUE des tables qui référencent `category_definitions.code`.
 *
 * Au 2026-09-04, une seule table référence les catégories : `fixed_charges` et
 * `monthly_overrides` ont disparu avec le forecast. La liste reste néanmoins le point unique
 * d'extension — le référentiel à deux niveaux (D17) en ajoutera d'autres.
 *
 * Pourquoi (revue 2026-08-04) : la règle était écrite deux fois — dans `categories/index.get.ts`
 * (compteur affiché, qui désactive le bouton Supprimer) et dans `categories/[code].delete.ts`
 * (refus de suppression). Ajouter une table référençante en n'éditant qu'un des deux fichiers
 * faisait diverger l'UI et le serveur : bouton actif mais 409 inexpliqué, ou bouton grisé mais
 * suppression autorisée. Toute nouvelle table portant `category_code` s'ajoute ICI.
 */
export const CATEGORY_REFERENCING_TABLES = [
  { key: 'transactionCount', table: transactions },
] as const

export type CategoryReferenceCounts = Record<
  (typeof CATEGORY_REFERENCING_TABLES)[number]['key'],
  number
>

/**
 * Exécuteur de requêtes : l'instance globale, ou la transaction en cours. Sans ce paramètre,
 * un appel depuis `db.transaction(tx => …)` repassait par le `db` global — inoffensif avec
 * better-sqlite3, qui partage la connexion, mais l'intention n'était portée par aucun type
 * (revue 2026-09-04).
 */
type QueryRunner = Pick<typeof db, 'select'>

/** Compteurs détaillés par table pour un `code` donné (payload du 409 `category_in_use`). */
export function categoryReferenceCounts(code: string, runner: QueryRunner = db): CategoryReferenceCounts {
  const counts = {} as CategoryReferenceCounts
  for (const { key, table } of CATEGORY_REFERENCING_TABLES) {
    const row = runner
      .select({ cnt: sql<number>`count(*)` })
      .from(table)
      .where(eq(table.categoryCode, code))
      .get()
    counts[key] = Number(row?.cnt ?? 0)
  }
  return counts
}

/** Total des références d'un `code`, toutes tables confondues. */
export function totalReferences(counts: CategoryReferenceCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

/** Total des références par `code`, pour toutes les catégories d'un coup (listing). */
export function referenceCountsByCategory(): Map<string, number> {
  const totals = new Map<string, number>()
  for (const { table } of CATEGORY_REFERENCING_TABLES) {
    const rows = db
      .select({ code: table.categoryCode, cnt: sql<number>`count(*)` })
      .from(table)
      .groupBy(table.categoryCode)
      .all()
    for (const r of rows) {
      totals.set(r.code, (totals.get(r.code) ?? 0) + Number(r.cnt))
    }
  }
  return totals
}
