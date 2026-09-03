import { describe, it, expect } from 'vitest'
import { parseRatePct, ratePctToInput } from './rate-pct'

describe('parseRatePct', () => {
  it('convertit un pourcentage saisi en pct × 100 entier', () => {
    expect(parseRatePct('15')).toBe(1500)
    expect(parseRatePct('15,5')).toBe(1550)
    expect(parseRatePct('25.25')).toBe(2525)
    expect(parseRatePct('0')).toBe(0)
    expect(parseRatePct('100')).toBe(10_000)
  })

  it('rejette les saisies hors domaine ou trop précises', () => {
    // > 2 décimales : l'arrondi produirait un pct × 100 non entier, rejeté par
    // computeDividendCapacity.
    expect(parseRatePct('15,555')).toBeNull()
    expect(parseRatePct('101')).toBeNull()
    expect(parseRatePct('-5')).toBeNull()
    expect(parseRatePct('1O')).toBeNull()
    expect(parseRatePct('')).toBeNull()
  })
})

describe('ratePctToInput', () => {
  /** 0 % est une valeur significative, pas un champ vide (revue 2026-08-04). */
  it('affiche un taux nul plutôt qu\'une chaîne vide', () => {
    expect(ratePctToInput(0)).toBe('0')
    expect(ratePctToInput(1500)).toBe('15')
  })

  /**
   * Séparateur décimal en virgule : le champ est saisi en fr-FR, réafficher `"15.5"` après un
   * save contredisait la convention assumée par l'AC#6 amendé (revue 2026-09-04).
   */
  it('réaffiche les décimales avec une virgule, pas un point', () => {
    expect(ratePctToInput(1550)).toBe('15,5')
    expect(ratePctToInput(1725)).toBe('17,25')
  })

  /** Aller-retour : ce qui est réaffiché doit être re-saisissable à l'identique. */
  it('fait un aller-retour stable avec parseRatePct', () => {
    for (const pct of [0, 1500, 1550, 1725, 3000, 10000]) {
      expect(parseRatePct(ratePctToInput(pct))).toBe(pct)
    }
  })
})
