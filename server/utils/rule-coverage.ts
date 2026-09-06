import { db } from '~~/server/db/client'
import { transactions } from '~~/server/db/schema'
import { patternCovers } from '~~/server/services/rule-matcher'

/**
 * Nombre de transactions déjà en base qu'un motif couvre.
 *
 * **En mémoire, et non en SQL** (revue du 2026-09-06). Le comptage passait par un `LIKE` sur
 * `LOWER(label)` : or le motif est stocké normalisé — donc sans accents — tandis que `label`
 * les conserve, et `LOWER()` de SQLite est ASCII. Un motif `creche` annonçait zéro ligne face
 * à `CRÈCHE LES PETITS EXEMPLES`. Le chiffre est celui sur lequel l'utilisateur décide de créer ou
 * d'appliquer une règle : il doit dire la même chose que le moteur, pas moins.
 *
 * Le coût est une lecture des libellés — quelques milliers de lignes sur ce produit
 * mono-utilisateur, contre une exactitude qui, elle, ne se rattrape pas.
 */
export function countCoveredTransactions(pattern: string): number {
  const rows = db.select({ label: transactions.label }).from(transactions).all()
  return rows.reduce((n, r) => n + (patternCovers(r.label, pattern) ? 1 : 0), 0)
}
