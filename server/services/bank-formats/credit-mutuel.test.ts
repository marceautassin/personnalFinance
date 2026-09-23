import { describe, it, expect } from 'vitest'
import { recognizes, operationsText, balancesAndPeriod } from './credit-mutuel'

describe('credit-mutuel.recognizes', () => {
  it('reconnaît un relevé portant le BIC CMCIFR', () => {
    expect(recognizes('Émetteur BIC : CMCIFR2A contact@creditmutuel.example')).toBe(true)
  })

  it('reconnaît un relevé citant le domaine creditmutuel.fr', () => {
    expect(recognizes('Consultez vos comptes sur www.creditmutuel.fr')).toBe(true)
  })

  it('ne se laisse pas abuser par un libellé Boursorama citant l\'autre banque (garde anti faux positif)', () => {
    const boursoramaText = 'BOUSFRPP www.boursobank.com VIR SEPA VERS CREDIT MUTUEL EXEMPLE 42,00'
    expect(recognizes(boursoramaText)).toBe(false)
  })

  it('ne reconnaît pas un texte sans aucun marqueur', () => {
    expect(recognizes('un relevé quelconque')).toBe(false)
  })
})

describe('credit-mutuel — extraction non supportée (périmètre story 28.1)', () => {
  it('operationsText lève credit_mutuel_not_supported_yet', () => {
    expect(() => operationsText({ pages: null, flatText: 'x' })).toThrow('credit_mutuel_not_supported_yet')
  })

  it('balancesAndPeriod lève credit_mutuel_not_supported_yet', () => {
    expect(() => balancesAndPeriod('x')).toThrow('credit_mutuel_not_supported_yet')
  })
})
