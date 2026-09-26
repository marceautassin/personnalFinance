import { describe, it, expect } from 'vitest'
import { maskAccountNumbers, maskIban } from './identity'

describe('maskAccountNumbers (D42)', () => {
  it('masque un numéro de compte connu trouvé dans un libellé', () => {
    expect(maskAccountNumbers('VIR PEL 00012345678', ['00012345678'])).toBe('VIR PEL [COMPTE]')
  })

  it('masque toute suite de 10 chiffres ou plus, même non connue (références SEPA)', () => {
    expect(maskAccountNumbers('VIR SEPA SOCIETE FICTIVE 123456789012345', [])).toBe(
      'VIR SEPA SOCIETE FICTIVE [NUMÉRO]',
    )
  })

  it('laisse intacte une suite de 7 chiffres (numéro de chèque)', () => {
    expect(maskAccountNumbers('CHQ 1234567', [])).toBe('CHQ 1234567')
  })

  it('laisse intact un groupe isolé de 5 chiffres non collecté (code postal)', () => {
    expect(maskAccountNumbers('PAIEMENT PARIS 75015', [])).toBe('PAIEMENT PARIS 75015')
  })

  it('remplace le numéro connu le PLUS LONG en premier quand un plus court le chevauche', () => {
    // '12345' est un sous-ensemble du RIB complet : sans le tri, '10000 12345 00012345678'
    // masquerait d'abord '12345' isolément et laisserait des fragments du RIB visibles.
    const out = maskAccountNumbers('RIB 10000 12345 00012345678 fin', ['12345', '10000 12345 00012345678'])
    expect(out).toBe('RIB [COMPTE] fin')
  })

  it('ne modifie rien quand aucun numéro connu ni suite longue n\'est présent', () => {
    expect(maskAccountNumbers('CARTE ACHAT SUPERMARCHE FICTIF', [])).toBe('CARTE ACHAT SUPERMARCHE FICTIF')
  })

  /**
   * Un IBAN écrit par groupes de 4 (`FR76 XXXX XXXX …`) n'est jamais une suite de ≥ 10 chiffres
   * CONSÉCUTIFS (les espaces les coupent) : sans ce motif dédié, il traverserait les deux
   * couches (revue pr-reviewer de la story 28.4, BLOQUANT reformulé en IMPORTANT).
   */
  it('masque un IBAN écrit par groupes dans un libellé', () => {
    const out = maskAccountNumbers('VIR SEPA FICTIF IBAN FR76 1234 5678 9012 3456 7890 123', [])
    expect(out).toContain('[IBAN]')
    expect(out).not.toMatch(/\d{4}\s\d{4}/)
  })
})

describe('maskIban', () => {
  it('masque un IBAN français écrit par groupes de 4', () => {
    expect(maskIban('IBAN FR76 1234 5678 9012 3456 7890 123')).toBe('IBAN [IBAN]')
  })

  it('ne modifie pas un libellé bancaire ordinaire en majuscules', () => {
    expect(maskIban('CARTE ACHAT SUPERMARCHE FICTIF')).toBe('CARTE ACHAT SUPERMARCHE FICTIF')
  })
})
