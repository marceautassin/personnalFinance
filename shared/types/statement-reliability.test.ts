import { describe, it, expect } from 'vitest'
import { deriveReliability, isDegraded, worstReliability } from './statement-reliability'

/** Un relevé PDF nominal, sans écart ni décision. Les tests ne changent qu'un champ à la fois. */
function pdf(overrides: Partial<Parameters<typeof deriveReliability>[0]> = {}) {
  return deriveReliability({
    gapCents: 0,
    gapAccepted: false,
    source: 'pdf',
    continuityGapCents: null,
    ...overrides,
  })
}

describe('deriveReliability', () => {
  it('un relevé PDF sans écart et sans décision est fiable', () => {
    expect(pdf()).toBe('reliable')
  })

  /**
   * Le défaut qui a motivé ce modèle : deux relevés réels portaient 2 187 € et 1 764 €
   * d'écart et s'affichaient « fiables », faute d'une décision de l'utilisateur.
   */
  it('un écart non examiné n\'est PAS fiable, même sans décision de l\'utilisateur', () => {
    expect(pdf({ gapCents: -218700 })).toBe('gap_unreviewed')
    expect(pdf({ gapCents: 1 })).toBe('gap_unreviewed')
  })

  /**
   * Accepter un écart insère une transaction d'équilibrage : l'écart retombe à zéro dans la
   * foulée. Sans la priorité donnée à la décision, le relevé repasserait « fiable » et le
   * trou assumé disparaîtrait de l'écran.
   */
  it('un écart assumé reste signalé même quand l\'écart courant est retombé à zéro', () => {
    expect(pdf({ gapAccepted: true })).toBe('gap_accepted')
  })

  it('distingue un écart assumé d\'un écart non examiné, à écart identique', () => {
    expect(pdf({ gapCents: -1200, gapAccepted: true })).not.toBe(pdf({ gapCents: -1200 }))
  })

  describe('export (story 28.4, D44)', () => {
    it('un export sans raccord de continuité est "non vérifié", même sans écart interne', () => {
      expect(pdf({ source: 'export', continuityGapCents: null })).toBe('unverified')
    })

    it('un export dont le raccord de continuité tombe juste est fiable', () => {
      expect(pdf({ source: 'export', continuityGapCents: 0 })).toBe('reliable')
    })

    it('un export dont le raccord de continuité laisse un écart reste "écart non examiné"', () => {
      expect(pdf({ source: 'export', continuityGapCents: 1500 })).toBe('gap_unreviewed')
    })

    it('un écart INTERNE non nul prime sur l\'origine export', () => {
      expect(pdf({ source: 'export', gapCents: -500, continuityGapCents: null })).toBe('gap_unreviewed')
    })

    it('gapAccepted prime sur tout, y compris un export non vérifié', () => {
      expect(pdf({ source: 'export', gapAccepted: true, continuityGapCents: null })).toBe('gap_accepted')
    })
  })
})

describe('isDegraded', () => {
  it('ne considère sain que l\'état sans écart', () => {
    expect(isDegraded('reliable')).toBe(false)
    expect(isDegraded('gap_unreviewed')).toBe(true)
    expect(isDegraded('gap_accepted')).toBe(true)
    expect(isDegraded('unverified')).toBe(true)
  })
})

describe('worstReliability', () => {
  it('une période sans relevé est fiable par défaut', () => {
    expect(worstReliability([])).toBe('reliable')
  })

  it('un seul relevé bancal contamine la période (D23)', () => {
    expect(worstReliability(['reliable', 'reliable', 'gap_accepted'])).toBe('gap_accepted')
  })

  it('un écart non examiné prime sur un écart assumé', () => {
    expect(worstReliability(['gap_accepted', 'gap_unreviewed'])).toBe('gap_unreviewed')
    expect(worstReliability(['reliable', 'gap_unreviewed', 'gap_accepted'])).toBe('gap_unreviewed')
  })

  it('un export non vérifié prime sur un écart assumé, mais pas sur un écart non examiné', () => {
    expect(worstReliability(['reliable', 'gap_accepted', 'unverified'])).toBe('unverified')
    expect(worstReliability(['unverified', 'gap_unreviewed'])).toBe('gap_unreviewed')
  })
})
