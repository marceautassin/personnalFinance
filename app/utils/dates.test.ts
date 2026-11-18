import { describe, it, expect } from 'vitest'
import { formatDate, formatDayMonth, formatRange } from './dates'

/** `Intl` insère des espaces fines insécables : on les neutralise plutôt que de les écrire. */
const normalize = (s: string) => s.replace(/\u202f|\u00a0/gu, ' ')

describe('formatDate', () => {
  it('rend une date ISO en format français', () => {
    expect(formatDate('2026-08-03')).toBe('03/08/2026')
  })

  /**
   * `new Date('2026-08-03')` interprète la chaîne en UTC : à l'ouest de Greenwich, la date
   * affichée reculait d'un jour. Le découpage manuel évite ce piège, listé en anti-pattern
   * dans CLAUDE.md.
   */
  it('ne décale pas la date, quel que soit le fuseau', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
    expect(formatDate('2026-12-31')).toBe('31/12/2026')
  })

  it('rend le 29 février d\'une année bissextile', () => {
    expect(formatDate('2024-02-29')).toBe('29/02/2024')
  })
})

describe('formatDayMonth', () => {
  it('rend le jour et le mois abrégé', () => {
    expect(normalize(formatDayMonth('2026-08-03'))).toMatch(/^03 aoû/)
  })
})

describe('formatRange', () => {
  it('rend une plage lisible', () => {
    expect(formatRange('2026-08-01', '2026-08-31')).toBe('01/08/2026 → 31/08/2026')
  })
})
