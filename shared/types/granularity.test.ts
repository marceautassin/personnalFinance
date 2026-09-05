import { describe, it, expect } from 'vitest'
import { bucketOf, bucketLabel, isGranularity, bucketBounds, shiftBucket } from './granularity'

describe('bucketOf', () => {
  it('découpe au mois', () => {
    expect(bucketOf('2026-03-15', 'month')).toBe('2026-03')
  })

  it('découpe à l\'année', () => {
    expect(bucketOf('2026-03-15', 'year')).toBe('2026')
  })

  it.each([
    ['2026-01-01', '2026-T1'],
    ['2026-03-31', '2026-T1'],
    ['2026-04-01', '2026-T2'],
    ['2026-06-30', '2026-T2'],
    ['2026-07-01', '2026-T3'],
    ['2026-10-01', '2026-T4'],
    ['2026-12-31', '2026-T4'],
  ])('place %s dans le trimestre %s', (date, bucket) => {
    expect(bucketOf(date, 'quarter')).toBe(bucket)
  })

  /**
   * Le tri lexicographique des clés doit être chronologique : c'est ce qui permet d'ordonner
   * la série sans repasser par `Date`, donc sans piège de fuseau horaire.
   */
  it('produit des clés dont l\'ordre alphabétique est chronologique', () => {
    const dates = ['2025-12-31', '2026-01-01', '2026-04-01', '2026-11-30']
    for (const g of ['month', 'quarter', 'year'] as const) {
      const keys = dates.map(d => bucketOf(d, g))
      expect([...keys].sort()).toEqual(keys)
    }
  })
})

describe('bucketLabel', () => {
  it('nomme le mois en français', () => {
    expect(bucketLabel('2026-03', 'month')).toBe('mars 2026')
    expect(bucketLabel('2026-08', 'month')).toBe('août 2026')
  })

  it('nomme le trimestre', () => {
    expect(bucketLabel('2026-T2', 'quarter')).toBe('T2 2026')
  })

  it('laisse l\'année telle quelle', () => {
    expect(bucketLabel('2026', 'year')).toBe('2026')
  })
})

describe('isGranularity', () => {
  it('accepte les trois valeurs', () => {
    expect(['month', 'quarter', 'year'].every(isGranularity)).toBe(true)
  })

  it('refuse le reste', () => {
    expect(isGranularity('week')).toBe(false)
    expect(isGranularity('2026-Q1')).toBe(false)
  })
})

describe('bucketBounds', () => {
  it('borne un mois de 31 jours', () => {
    expect(bucketBounds('2026-03', 'month')).toEqual({ from: '2026-03-01', to: '2026-03-31' })
  })

  it('borne un mois de 30 jours', () => {
    expect(bucketBounds('2026-04', 'month')).toEqual({ from: '2026-04-01', to: '2026-04-30' })
  })

  /** Cas limite classique des calculs de période : février bissextile. */
  it('borne février selon que l\'année est bissextile', () => {
    expect(bucketBounds('2024-02', 'month').to).toBe('2024-02-29')
    expect(bucketBounds('2025-02', 'month').to).toBe('2025-02-28')
    expect(bucketBounds('2100-02', 'month').to).toBe('2100-02-28')
    expect(bucketBounds('2000-02', 'month').to).toBe('2000-02-29')
  })

  it('borne un trimestre', () => {
    expect(bucketBounds('2026-T1', 'quarter')).toEqual({ from: '2026-01-01', to: '2026-03-31' })
    expect(bucketBounds('2026-T4', 'quarter')).toEqual({ from: '2026-10-01', to: '2026-12-31' })
  })

  it('borne une année', () => {
    expect(bucketBounds('2026', 'year')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
})

describe('shiftBucket', () => {
  it('recule d\'un mois, y compris en changeant d\'année', () => {
    expect(shiftBucket('2026-03', 'month', -1)).toBe('2026-02')
    expect(shiftBucket('2026-01', 'month', -1)).toBe('2025-12')
  })

  it('avance d\'un mois', () => {
    expect(shiftBucket('2026-12', 'month', 1)).toBe('2027-01')
  })

  it('recule d\'un trimestre, y compris en changeant d\'année', () => {
    expect(shiftBucket('2026-T2', 'quarter', -1)).toBe('2026-T1')
    expect(shiftBucket('2026-T1', 'quarter', -1)).toBe('2025-T4')
  })

  it('recule d\'une année', () => {
    expect(shiftBucket('2026', 'year', -1)).toBe('2025')
  })

  /**
   * Le décalage est calendaire : comparer mars aux « 31 jours précédents » donnerait une
   * fenêtre à cheval sur janvier et février, que personne ne reconnaîtrait comme le mois d'avant.
   */
  it('reste réversible', () => {
    for (const [bucket, g] of [['2026-03', 'month'], ['2026-T2', 'quarter'], ['2026', 'year']] as const) {
      expect(shiftBucket(shiftBucket(bucket, g, -1), g, 1)).toBe(bucket)
    }
  })
})
