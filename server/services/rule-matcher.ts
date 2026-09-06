/**
 * rule-matcher — application des règles de classement déterministes.
 *
 * Fonction PURE : elle reçoit des libellés et des règles, elle ne touche jamais la base
 * (même contrat que `reconciler.ts`, cf. AR7). Les cas limites se testent donc sans SQLite.
 */
import { normalizeCategoryLabel } from '~~/shared/schemas/category.schema'
import { merchantKey } from '~~/shared/utils/bank-label'

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
/**
 * Un motif couvre-t-il ce libellé ? Même comparaison que `resolveRule`, isolée.
 *
 * **Pourquoi elle existe (revue du 2026-09-06).** Le comptage et la présélection se faisaient
 * en SQL, par un `LIKE` sur `LOWER(label)`. Or le motif est stocké NORMALISÉ, donc sans
 * accents, tandis que `label` les conserve — et `LOWER()` de SQLite est ASCII : un motif
 * `creche` ne trouvait jamais `CRÈCHE`. Le compteur annonçait alors zéro ligne couverte, et
 * l'application n'en reclassait aucune. Un écart silencieux, dans le sens le plus dangereux :
 * moins de lignes que le moteur, pas plus.
 */
export function patternCovers(label: string, pattern: string): boolean {
  const needle = normalizeForMatch(pattern)
  return needle.length > 0 && normalizeForMatch(label).includes(needle)
}

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

/**
 * Extrait de quoi identifier le commerçant dans un libellé bancaire.
 *
 * Sert à PROPOSER un motif de règle quand l'utilisateur reclasse une transaction à la main.
 * L'implémentation vit dans `shared/utils/bank-label.ts` : l'écran « À ranger » groupe ses
 * lignes avec la MÊME fonction, et propose ensuite la clé du groupe comme motif. Deux
 * nettoyages différents produiraient une règle qui ne couvre pas le groupe dont elle est née.
 */
export function extractMerchant(label: string): string | null {
  return merchantKey(label)
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
