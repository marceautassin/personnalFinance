import { sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'

/**
 * `monthly_overrides` n'existe pas avant la story 7.2. Les endpoints catégories comptent les
 * références et doivent traiter la table comme « 0 référence » tant qu'elle est absente.
 *
 * Shim temporaire, source unique de la sonde `sqlite_master` : à retirer (avec ses appelants
 * dans `categories/index.get.ts` et `categories/[code].delete.ts`) quand 7.2 crée la table.
 */
export function monthlyOverridesTableExists(): boolean {
  const row = db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'monthly_overrides'`,
  )
  return !!row && Number(row.n) > 0
}
