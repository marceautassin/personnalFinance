import type { Cents } from '~~/shared/types/money'

/**
 * Montant pour une GRADUATION d'axe — abrégé, et lisible en SVG.
 *
 * Deux raisons de ne pas réutiliser `formatEuros` ici :
 *
 * 1. **Les centimes sont du bruit sur un axe.** « 10 000 € » suffit à situer une hauteur ;
 *    « 10 000,00 € » ajoute trois caractères qui ne servent à rien et qui, à gauche du repère,
 *    finissaient rognés par le bord du graphique — « -10 000,00 € » sortait du cadre.
 * 2. **L'espace fine insécable ne survit pas au `<text>` SVG.** `Intl` sépare les milliers par
 *    U+202F ; le rendu SVG l'escamote et affichait « 10000,00 € ». On repasse donc sur une
 *    espace insécable ordinaire, qui, elle, se voit.
 *
 * Le tableau sous chaque graphique garde les montants complets, au centime : c'est lui qui
 * porte les valeurs exactes (NFR2), l'axe n'en donne que l'échelle.
 */
const AXIS_FORMATTER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

export function formatAxisEuros(cents: Cents | number): string {
  // `Math.round` rend -0 pour tout ce qui est entre -50 et 0 centimes, et `Intl` l'écrit
  // « -0 € ». Un axe qui annonce un zéro négatif fait douter du reste des chiffres.
  const rounded = Math.round(cents / 100)
  const euros = Object.is(rounded, -0) ? 0 : rounded
  // Les séparateurs sont désignés par leur point de code : U+202F (espace fine
  // insécable, ce que produit `Intl`) et U+00A0 (espace insécable) sont invisibles
  // dans le source, et `no-irregular-whitespace` les refuse à juste titre.
  const grouped = AXIS_FORMATTER.format(euros).replace(/[\u202f\u00a0]/g, '\u00a0')
  return `${grouped}\u00a0€`
}

/**
 * Arrondit un pas d'échelle à 1, 2 ou 5 fois une puissance de dix — les seuls pas dont on lit
 * la valeur sans y penser. Un axe gradué tous les 3 285 € est exact et illisible.
 */
export function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)))
  const normalized = raw / magnitude
  const factor = normalized > 5 ? 10 : normalized > 2 ? 5 : normalized > 1 ? 2 : 1
  return factor * magnitude
}
