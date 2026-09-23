import { describe, it, expect } from 'vitest'
import { detectBank, BANK_FORMATS } from './index'

describe('detectBank', () => {
  it('reconnaît Boursorama sur son BIC', () => {
    expect(detectBank('Émetteur BOUSFRPP contact')).toBe('boursorama')
  })

  it('reconnaît Crédit Mutuel sur son domaine', () => {
    expect(detectBank('Consultez vos comptes sur www.creditmutuel.fr')).toBe('credit_mutuel')
  })

  it('rend null si aucune banque n\'est reconnue', () => {
    expect(detectBank('un relevé sans aucun marqueur connu')).toBeNull()
  })

  it('rend null si les DEUX banques semblent reconnues (cas non observé, ambiguïté assumée)', () => {
    const both = 'BOUSFRPP www.creditmutuel.fr'
    expect(detectBank(both)).toBeNull()
  })
})

describe('BANK_FORMATS', () => {
  it('expose un format pour chaque banque de BANKS', () => {
    expect(Object.keys(BANK_FORMATS).sort()).toEqual(['boursorama', 'credit_mutuel'])
    expect(BANK_FORMATS.boursorama.bank).toBe('boursorama')
    expect(BANK_FORMATS.credit_mutuel.bank).toBe('credit_mutuel')
  })
})
