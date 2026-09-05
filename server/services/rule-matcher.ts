/**
 * rule-matcher — application des règles de classement déterministes.
 *
 * Fonction PURE : elle reçoit des libellés et des règles, elle ne touche jamais la base
 * (même contrat que `reconciler.ts`, cf. AR7). Les cas limites se testent donc sans SQLite.
 */
import { normalizeCategoryLabel } from '~~/shared/schemas/category.schema'

export interface MatchableRule {
  pattern: string
  categoryItemCode: string
}

/**
 * Forme normalisée d'un libellé, pour la comparaison : minuscules, sans accents, espaces
 * réduits. Une règle « carrefour » doit attraper `CARTE 01/03 CARREFOUR MARKET`, et une règle
 * « peage » doit attraper `PÉAGE`.
 */
export function normalizeForMatch(label: string): string {
  return normalizeCategoryLabel(label)
}

/**
 * Poste imposé par les règles pour un libellé, ou `null` si aucune ne s'applique.
 *
 * **Départage : le motif le plus long gagne.** Une règle est d'autant plus spécifique qu'elle
 * est longue — `amazon prime` doit l'emporter sur `amazon`. Sans cette règle d'ordre, le
 * résultat dépendrait de l'ordre d'insertion en base, donc de rien de compréhensible.
 * À longueur égale, la règle la plus ancienne gagne : l'ordre reçu fait foi, et l'appelant
 * le fixe par un tri stable.
 */
export function resolveRule(label: string, rules: readonly MatchableRule[]): MatchableRule | null {
  const haystack = normalizeForMatch(label)
  let best: MatchableRule | null = null
  for (const rule of rules) {
    const needle = normalizeForMatch(rule.pattern)
    if (needle.length === 0 || !haystack.includes(needle)) continue
    if (best === null || needle.length > normalizeForMatch(best.pattern).length) best = rule
  }
  return best
}

export interface RuleApplication<T> {
  transactions: T[]
  /** Nombre de lignes dont le poste a été imposé par une règle, pour le rapport d'ingestion. */
  overriddenCount: number
}

/**
 * Applique les règles à des transactions extraites, en ÉCRASANT le poste proposé par le modèle.
 *
 * L'écrasement est inconditionnel et c'est le but : une règle que l'utilisateur a écrite est
 * une connaissance qu'il possède et que le modèle n'a pas. La rendre conditionnelle — « seulement
 * si le modèle hésite » — la rendrait imprévisible, donc inutilisable.
 */
export function applyRules<T extends { label: string, categoryItemCode: string }>(
  transactions: readonly T[],
  rules: readonly MatchableRule[],
): RuleApplication<T> {
  let overriddenCount = 0
  const out = transactions.map((tx) => {
    const rule = resolveRule(tx.label, rules)
    if (!rule || rule.categoryItemCode === tx.categoryItemCode) return tx
    overriddenCount++
    return { ...tx, categoryItemCode: rule.categoryItemCode }
  })
  return { transactions: out, overriddenCount }
}
