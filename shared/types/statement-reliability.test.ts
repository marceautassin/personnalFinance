import { describe, it, expect } from 'vitest'
import { deriveReliability, isDegraded, worstReliability } from './statement-reliability'

describe('deriveReliability', () => {
  it('un relevé sans écart et sans décision est fiable', () => {
    expect(deriveReliability(0, false)).toBe('reliable')
  })

  /**
   * Le défaut qui a motivé ce modèle : deux relevés réels portaient 2 187 € et 1 764 €
   * d'écart et s'affichaient « fiables », faute d'une décision de l'utilisateur.
   */
  it('un écart non examiné n\'est PAS fiable, même sans décision de l\'utilisateur', () => {
    expect(deriveReliability(-218700, false)).toBe('gap_unreviewed')
    expect(deriveReliability(1, false)).toBe('gap_unreviewed')
  })

  /**
   * Accepter un écart insère une transaction d'équilibrage : l'écart retombe à zéro dans la
   * foulée. Sans la priorité donnée à la décision, le relevé repasserait « fiable » et le
   * trou assumé disparaîtrait de l'écran.
   */
  it('un écart assumé reste signalé même quand l\'écart courant est retombé à zéro', () => {
    expect(deriveReliability(0, true)).toBe('gap_accepted')
  })

  it('distingue un écart assumé d\'un écart non examiné, à écart identique', () => {
    expect(deriveReliability(-1200, true)).not.toBe(deriveReliability(-1200, false))
  })
})

describe('isDegraded', () => {
  it('ne considère sain que l\'état sans écart', () => {
    expect(isDegraded('reliable')).toBe(false)
    expect(isDegraded('gap_unreviewed')).toBe(true)
    expect(isDegraded('gap_accepted')).toBe(true)
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
})
