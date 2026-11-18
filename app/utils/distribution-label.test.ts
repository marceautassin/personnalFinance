import { describe, it, expect } from 'vitest'
import { describeDistributionNode, type DistributionNodeLabel } from './distribution-label'
import type { Cents } from '~~/shared/types/money'
import type { Ratio } from '~~/shared/types/ratio'

/**
 * Ces chaînes sont la SEULE voie d'accès aux colonnes du tableau de répartition pour un lecteur
 * d'écran : la ligne d'en-têtes est `aria-hidden`, et l'`aria-label` du bouton écrase le
 * contenu de la ligne. Ce qui n'est pas ici n'existe pas.
 */
const node = (over: Partial<DistributionNodeLabel> = {}): DistributionNodeLabel => ({
  label: 'Alimentation',
  totalCents: -159_639 as Cents,
  transactionCount: 122,
  deltaCents: null,
  share: null,
  expanded: false,
  previousLabel: 'juillet 2026',
  deltaIsAlarming: false,
  ...over,
})

describe('describeDistributionNode', () => {
  it('porte le montant et le nombre de lignes', () => {
    const out = describeDistributionNode(node())
    expect(out).toContain('Déplier Alimentation')
    expect(out).toContain('122 transaction(s)')
    // `Intl` sépare les milliers par une espace fine insécable (U+202F), pas par une espace.
    expect(out).toContain('1\u202f596,39')
  })

  it('annonce le repli quand le nœud est déjà ouvert', () => {
    expect(describeDistributionNode(node({ expanded: true }))).toContain('Replier Alimentation')
  })

  it('porte la part quand elle a un sens', () => {
    const out = describeDistributionNode(node({ share: 0.463 as Ratio }))
    expect(out).toContain('du total')
  })

  /** Sur un mouvement interne ou un net inversé, une part ne veut rien dire : ne pas l'inventer. */
  it('tait la part quand elle n\'en a pas', () => {
    expect(describeDistributionNode(node({ share: null }))).not.toContain('du total')
  })

  /**
   * Le cas qui motive tout le module : à l'écran, hausse et baisse se distinguent par la
   * COULEUR autant que par le signe. Sans les mots, il ne reste qu'un caractère de différence.
   */
  it('dit une hausse en toutes lettres, et qu\'elle est à surveiller', () => {
    const out = describeDistributionNode(node({ deltaCents: 68_644 as Cents, deltaIsAlarming: true }))
    expect(out).toContain('en hausse')
    expect(out).toContain('à surveiller')
    expect(out).toContain('juillet 2026')
  })

  it('dit une baisse en toutes lettres, sans alarme quand elle est favorable', () => {
    const out = describeDistributionNode(node({ deltaCents: -11_466 as Cents, deltaIsAlarming: false }))
    expect(out).toContain('en baisse')
    expect(out).not.toContain('à surveiller')
  })

  /** Une recette en BAISSE est alarmante : le jugement vient de la nature, pas du signe. */
  it('signale une baisse alarmante — cas d\'une recette qui recule', () => {
    const out = describeDistributionNode(node({ deltaCents: -12_685 as Cents, deltaIsAlarming: true }))
    expect(out).toContain('en baisse')
    expect(out).toContain('à surveiller')
  })

  /** Un écart NUL n'est ni une hausse ni une baisse — l'annoncer comme tel mentirait. */
  it('dit « inchangé » plutôt qu\'une hausse de zéro', () => {
    const out = describeDistributionNode(node({ deltaCents: 0 as Cents }))
    expect(out).toContain('inchangé')
    expect(out).not.toContain('en hausse')
    expect(out).not.toContain('en baisse')
  })

  it('tait l\'écart quand aucune période de comparaison n\'existe', () => {
    const out = describeDistributionNode(node({ deltaCents: null }))
    expect(out).not.toContain('écart')
    expect(out).not.toContain('inchangé')
  })

  it('nomme la période de comparaison par défaut quand elle est inconnue', () => {
    const out = describeDistributionNode(node({ deltaCents: 100 as Cents, previousLabel: null }))
    expect(out).toContain('la période précédente')
  })

  /**
   * Un nœud vide ne se déplie pas. Le nom doit dire POURQUOI (NFR20) plutôt qu'annoncer
   * « Déplier les 0 transaction(s) », qui promet une action impossible.
   */
  it('dit qu\'un nœud sans ligne ne se déplie pas, et pourquoi', () => {
    const out = describeDistributionNode(node({ transactionCount: 0, deltaCents: -50_000 as Cents }))
    expect(out).toBe('Alimentation — aucune transaction sur la période, rien à déplier')
    expect(out).not.toContain('Déplier ')
  })
})
