import { and, eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, categoryItems, bankStatements } from '~~/server/db/schema'
import { normalizeForMatch, patternCovers } from '~~/server/services/rule-matcher'

/**
 * Nombre de transactions DU PROFIL déjà en base qu'un motif couvre.
 *
 * **En mémoire, et non en SQL** (revue du 2026-09-06). Le comptage passait par un `LIKE` sur
 * `LOWER(label)` : or le motif est stocké normalisé — donc sans accents — tandis que `label`
 * les conserve, et `LOWER()` de SQLite est ASCII. Un motif `creche` annonçait zéro ligne face
 * à `CRÈCHE LES PETITS EXEMPLES`. Le chiffre est celui sur lequel l'utilisateur décide de créer ou
 * d'appliquer une règle : il doit dire la même chose que le moteur, pas moins.
 *
 * Story 27.2 (D37) : `transactions` n'a pas de `profile_id` — restriction par jointure au
 * relevé, sans quoi le compteur de FR42 mélangerait les profils (piège signalé par la story).
 */
export function countCoveredTransactions(profileId: number, pattern: string): number {
  const rows = db
    .select({ label: transactions.label })
    .from(transactions)
    .innerJoin(bankStatements, eq(bankStatements.hashSha256, transactions.statementHash))
    .where(eq(bankStatements.profileId, profileId))
    .all()
  return rows.reduce((n, r) => n + (patternCovers(r.label, pattern) ? 1 : 0), 0)
}

/** Où en est une règle vis-à-vis de l'historique déjà ingéré (story 18.9). */
export interface RuleCoverage {
  /** Lignes de l'historique que le motif couvre. */
  coveredCount: number
  /** Lignes couvertes qu'une application déplacerait réellement. */
  pendingCount: number
}

/**
 * État de chaque règle vis-à-vis de l'historique DU PROFIL — CALCULÉ, jamais stocké (story 18.9).
 *
 * **Pourquoi calculé.** Un drapeau « appliquée » en base divergerait de la réalité dès la
 * première ingestion suivante, ou dès qu'une règle plus longue vient recouvrir la même ligne.
 * Un état dérivé ne peut pas mentir ; c'est la même raison qui interdit les agrégats persistés
 * dans ce produit (D19).
 *
 * **Pourquoi une seule passe.** Le départage — motif le plus long gagne — est résolu UNE fois
 * pour chaque ligne, puis compté par règle. Résoudre par règle multiplierait les normalisations
 * par le nombre de règles, pour un résultat identique.
 *
 * `pendingCount` exclut les lignes corrigées à la main : l'application ne les toucherait pas,
 * les annoncer « à ranger » promettrait un travail qui n'aura pas lieu.
 */
export function coverageByRule(
  profileId: number,
  rules: ReadonlyArray<{ pattern: string, categoryItemCode: string }>,
): RuleCoverage[] {
  const rows = db
    .select({
      label: transactions.label,
      categoryItemCode: categoryItems.code,
      isManual: transactions.isManual,
    })
    .from(transactions)
    .innerJoin(categoryItems, eq(categoryItems.id, transactions.categoryItemId))
    // `transactions` n'a pas de `profile_id` (D37) : restriction par le relevé, comme partout.
    .innerJoin(bankStatements, eq(bankStatements.hashSha256, transactions.statementHash))
    .where(and(eq(categoryItems.profileId, profileId), eq(bankStatements.profileId, profileId)))
    .all()

  const needles = rules.map(r => normalizeForMatch(r.pattern))
  const lines = rows.map(r => ({ ...r, haystack: normalizeForMatch(r.label) }))

  // Règle gagnante par ligne : le motif le plus long l'emporte, et à longueur égale le plus
  // ancien — `rules` arrive trié par `id`, exactement comme à l'ingestion.
  const winners = lines.map((line) => {
    let best = -1
    for (const [i, needle] of needles.entries()) {
      if (needle.length === 0 || !line.haystack.includes(needle)) continue
      if (best === -1 || needle.length > needles[best]!.length) best = i
    }
    return best
  })

  return rules.map((_rule, i) => {
    const needle = needles[i]!
    let coveredCount = 0
    let pendingCount = 0
    for (const [j, line] of lines.entries()) {
      if (needle.length === 0 || !line.haystack.includes(needle)) continue
      coveredCount++
      if (line.isManual) continue
      const winner = winners[j]!
      if (winner !== -1 && rules[winner]!.categoryItemCode !== line.categoryItemCode) pendingCount++
    }
    return { coveredCount, pendingCount }
  })
}
