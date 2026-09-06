import { defineEventHandler, getQuery } from 'h3'
import { normalizeForMatch } from '~~/server/services/rule-matcher'
import { countCoveredTransactions } from '~~/server/utils/rule-coverage'

/**
 * GET /api/rules/preview?pattern=… — portée qu'aurait une règle, AVANT de la créer.
 *
 * Sans cet aperçu, la proposition faite après une correction manuelle se créait en un clic
 * sans montrer combien de lignes elle allait rafler. Le compteur n'apparaissait que sur
 * `/regles`, donc après coup : une règle « DUPONT Jean » aurait sorti 7 604 € de
 * remboursement d'emprunt des dépenses avant que quiconque ne le voie (revue du 2026-09-05).
 *
 * Le comptage utilise la comparaison du moteur, accents compris : le chiffre sur lequel
 * l'utilisateur décide de créer une règle doit dire la même chose que ce que la règle fera.
 */
export default defineEventHandler((event): { pattern: string, matchCount: number } => {
  const raw = getQuery(event).pattern
  const pattern = normalizeForMatch(typeof raw === 'string' ? raw : '')
  if (pattern.length < 2) return { pattern, matchCount: 0 }

  return { pattern, matchCount: countCoveredTransactions(pattern) }
})
