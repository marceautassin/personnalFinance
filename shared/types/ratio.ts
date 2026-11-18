/**
 * `Ratio` — un taux, distinct d'un montant.
 *
 * Deux des quatre indicateurs du produit sont des taux et non des sommes. Sans type distinct,
 * rien n'empêche un taux d'épargne de −1,90 d'être typé `Cents` et rendu « −0,02 € » par
 * `formatEuros`. Le branding est la seule barrière : les deux sont des `number` à l'exécution.
 */
export type Ratio = number & { readonly __brand: 'Ratio' }

/**
 * Construit un `Ratio`, ou `null` si le dénominateur est nul.
 *
 * **Un taux indéfini se voit comme indéfini.** Renvoyer `0` mentirait : un mois sans recette
 * et avec 800 € de dépenses n'a pas un taux d'épargne nul, il n'en a pas. Même logique que
 * l'état « non fiable » d'un relevé — dire qu'on ne sait pas vaut mieux qu'inventer.
 */
export const ratio = (numerator: number, denominator: number): Ratio | null =>
  denominator === 0 ? null : ((numerator / denominator) as Ratio)

/** Formate un `Ratio` en pourcentage fr-FR. `null` → « — ». */
export const formatRatio = (r: Ratio | null, maximumFractionDigits = 1): string =>
  r === null
    ? '—'
    : new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits }).format(r)
