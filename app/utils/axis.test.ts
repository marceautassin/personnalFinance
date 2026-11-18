import { describe, it, expect } from 'vitest'
import { formatAxisEuros } from './axis'
import type { Cents } from '~~/shared/types/money'

/**
 * Deux défauts constatés à l'écran motivent cette fonction, et ce sont eux que les cas
 * ci-dessous verrouillent : le séparateur de milliers escamoté par le rendu SVG, et une
 * graduation trop longue qui sortait du cadre à gauche.
 */
describe('formatAxisEuros', () => {
  it('abrège les centimes — une graduation situe une hauteur, elle ne la mesure pas', () => {
    expect(formatAxisEuros(1_000_000 as Cents)).toBe('10 000 €')
  })

  /** U+202F, l'espace fine que produit `Intl`, disparaît dans un `<text>` SVG. */
  it('n\'emploie jamais l\'espace fine insécable', () => {
    expect(formatAxisEuros(1_000_000 as Cents)).not.toContain(' ')
  })

  it('garde le signe des montants négatifs', () => {
    expect(formatAxisEuros(-1_417_693 as Cents)).toBe('-14 177 €')
  })

  it('rend zéro sans séparateur', () => {
    expect(formatAxisEuros(0 as Cents)).toBe('0 €')
  })

  /** Le zéro NÉGATIF que produit un calcul de graduation ne doit pas s'afficher « -0 € ». */
  it('normalise le zéro négatif', () => {
    expect(formatAxisEuros(-0 as Cents)).toBe('0 €')
  })

  it('arrondit au plus proche plutôt que de tronquer', () => {
    expect(formatAxisEuros(49_960 as Cents)).toBe('500 €')
  })
})
