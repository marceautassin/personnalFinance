import { defineEventHandler, getQuery } from 'h3'
import { sql, like } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions } from '~~/server/db/schema'
import { normalizeForMatch } from '~~/server/services/rule-matcher'

/**
 * GET /api/rules/preview?pattern=… — portée qu'aurait une règle, AVANT de la créer.
 *
 * Sans cet aperçu, la proposition faite après une correction manuelle se créait en un clic
 * sans montrer combien de lignes elle allait rafler. Le compteur n'apparaissait que sur
 * `/regles`, donc après coup : une règle « DUPONT Jean » aurait sorti 7 604 € de
 * remboursement d'emprunt des dépenses avant que quiconque ne le voie (revue du 2026-09-05).
 *
 * Le comptage porte sur le libellé brut, insensible à la casse — une APPROXIMATION du moteur,
 * qui compare des formes sans accents. Il sert à jauger une portée, pas à décider d'un
 * classement.
 */
export default defineEventHandler((event): { pattern: string, matchCount: number } => {
  const raw = getQuery(event).pattern
  const pattern = normalizeForMatch(typeof raw === 'string' ? raw : '')
  if (pattern.length < 2) return { pattern, matchCount: 0 }

  const row = db
    .select({ cnt: sql<number>`count(*)` })
    .from(transactions)
    .where(like(sql`LOWER(${transactions.label})`, `%${pattern}%`))
    .get()

  return { pattern, matchCount: Number(row?.cnt ?? 0) }
})
