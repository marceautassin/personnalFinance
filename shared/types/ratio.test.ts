import { describe, it, expect } from 'vitest'
import { ratio, formatRatio } from './ratio'

describe('ratio', () => {
  it('divise nominalement', () => {
    expect(ratio(3, 12)).toBe(0.25)
  })

  /**
   * Le cas limite que NFR3 impose de couvrir. Renvoyer `0` mentirait : un relevé sans
   * transaction n'a pas un taux de correction nul, il n'en a pas.
   */
  it('rend null quand le dénominateur est nul — jamais 0, jamais Infinity', () => {
    expect(ratio(0, 0)).toBeNull()
    expect(ratio(5, 0)).toBeNull()
  })

  it('accepte un numérateur nul avec un dénominateur non nul', () => {
    expect(ratio(0, 10)).toBe(0)
  })

  it('supporte un ratio négatif (taux d\'épargne d\'un mois déficitaire)', () => {
    expect(ratio(-190, 100)).toBe(-1.9)
  })
})

/**
 * `Intl` en fr-FR sépare la valeur du signe `%` par une espace fine insécable (U+202F), pas
 * par une espace ordinaire. On normalise plutôt que d'écrire le caractère en dur : c'est un
 * détail de l'ICU embarqué, pas une propriété du produit.
 */
const normalize = (s: string) => s.replace(/\u202f|\u00a0/gu, ' ')

describe('formatRatio', () => {
  it('formate en pourcentage fr-FR', () => {
    expect(normalize(formatRatio(0.25 as never))).toBe('25 %')
  })

  it('rend « — » pour un taux indéfini, jamais « 0 % »', () => {
    expect(formatRatio(null)).toBe('—')
  })

  it('distingue 0 % d\'un taux indéfini', () => {
    expect(normalize(formatRatio(0 as never))).toBe('0 %')
    expect(formatRatio(null)).toBe('—')
  })

  it('formate un taux négatif sans le confondre avec un montant', () => {
    expect(normalize(formatRatio(-1.9 as never))).toBe('-190 %')
  })
})
