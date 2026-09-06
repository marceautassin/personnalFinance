import { formatEuros, type Cents } from '~~/shared/types/money'
import { formatRatio, type Ratio } from '~~/shared/types/ratio'

/**
 * Nom accessible d'un nœud de répartition — rubrique ou poste.
 *
 * **Pourquoi une fonction pure hors du composant.** Un `aria-label` ÉCRASE le contenu de
 * l'élément : ce qu'il ne dit pas n'existe pas pour un lecteur d'écran. La ligne d'en-têtes
 * du tableau étant `aria-hidden`, la part et l'écart — deux des quatre colonnes visibles —
 * disparaissaient purement et simplement (revue du 2026-09-05). Cette chaîne est donc la
 * seule voie d'accès à ces valeurs, et elle mérite d'être testée. Extraite ici, elle l'est
 * sans monter de composant : le projet teste des fonctions, pas des rendus Vue.
 */
export interface DistributionNodeLabel {
  label: string
  totalCents: Cents
  transactionCount: number
  /** Écart avec la période précédente, DÉJÀ orienté selon la nature. `null` s'il n'y en a pas. */
  deltaCents: Cents | null
  /** Part du total. `null` quand la notion n'a pas de sens (mouvements internes, net inversé). */
  share: Ratio | null
  expanded: boolean
  /** Nom de la période de comparaison — jamais « la précédente ». */
  previousLabel: string | null
  /** `true` quand l'écart va dans le mauvais sens pour cette nature. */
  deltaIsAlarming: boolean
}

/**
 * Un nœud sans ligne ne se déplie pas : le dire, plutôt que d'annoncer « Déplier les 0
 * transaction(s) », qui promet une action impossible sans en donner la raison (NFR20).
 */
export function describeDistributionNode(node: DistributionNodeLabel): string {
  if (node.transactionCount === 0) {
    return `${node.label} — aucune transaction sur la période, rien à déplier`
  }

  const parts = [
    `${node.expanded ? 'Replier' : 'Déplier'} ${node.label}`,
    formatEuros(node.totalCents),
    `${node.transactionCount} transaction(s)`,
  ]

  if (node.share !== null) parts.push(`${formatRatio(node.share)} du total`)

  if (node.deltaCents !== null) {
    parts.push(describeDelta(node.deltaCents, node.deltaIsAlarming, node.previousLabel))
  }

  return parts.join(', ')
}

/**
 * L'écart en MOTS, pas seulement en signe.
 *
 * À l'écran, hausse et baisse se distinguent par la couleur autant que par le signe moins. Le
 * lecteur d'écran n'a pas la couleur : sans « en hausse » / « en baisse », il ne lui reste
 * qu'un caractère de différence, et rien ne dit si c'est une bonne nouvelle.
 */
function describeDelta(deltaCents: Cents, alarming: boolean, previousLabel: string | null): string {
  const against = previousLabel ?? 'la période précédente'
  if (deltaCents === 0) return `inchangé par rapport à ${against}`
  const direction = deltaCents > 0 ? 'en hausse' : 'en baisse'
  const judgement = alarming ? ', à surveiller' : ''
  return `écart ${direction} de ${formatEuros(Math.abs(deltaCents) as Cents)} sur ${against}${judgement}`
}
