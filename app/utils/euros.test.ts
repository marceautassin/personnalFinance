import { describe, it, expect } from 'vitest'
import { parseEurosToCents, centsToInput, syncEurosInput } from './euros'
import type { Cents } from '~~/shared/types/money'

const c = (n: number) => n as Cents

describe('parseEurosToCents', () => {
  it('parse une saisie décimale fr-FR et anglaise', () => {
    expect(parseEurosToCents('1100')).toBe(110_000)
    expect(parseEurosToCents('1500,50')).toBe(150_050)
    expect(parseEurosToCents('1500.50')).toBe(150_050)
    expect(parseEurosToCents('0')).toBe(0)
  })

  it('accepte l\'espace comme séparateur de milliers', () => {
    expect(parseEurosToCents('1 100')).toBe(110_000)
    expect(parseEurosToCents('1 234 567,89')).toBe(123_456_789)
  })

  /**
   * Un `replace(/\s+/g, '')` global lisait `"1 5"` comme 15 € : une frappe accidentelle
   * devenait un montant valide, silencieusement (revue 2026-08-04).
   */
  it('rejette un espace qui n\'est pas un séparateur de milliers', () => {
    expect(parseEurosToCents('1 5')).toBeNull()
    expect(parseEurosToCents('1 100 0')).toBeNull()
    expect(parseEurosToCents('12 34')).toBeNull()
  })

  it('rejette les saisies non numériques et les formats hors domaine', () => {
    expect(parseEurosToCents('60 000€')).toBeNull()
    expect(parseEurosToCents('1O')).toBeNull()
    expect(parseEurosToCents('-5')).toBeNull()
    expect(parseEurosToCents('1,234')).toBeNull()
    expect(parseEurosToCents('')).toBeNull()
    expect(parseEurosToCents('.')).toBeNull()
  })
})

describe('syncEurosInput', () => {
  it('préserve une saisie en cours qui représente déjà la valeur persistée', () => {
    // Sans ça, un refetch normaliserait "1500,50" en "1500.5" sous les doigts de l'utilisateur.
    expect(syncEurosInput('1500,50', c(150_050))).toBe('1500,50')
    expect(syncEurosInput('1 100', c(110_000))).toBe('1 100')
  })

  it('réécrit le champ quand la valeur persistée a changé', () => {
    expect(syncEurosInput('1100', c(90_000))).toBe('900')
    expect(syncEurosInput('1100', c(0))).toBe('')
  })

  it('réécrit le champ quand la saisie en cours est invalide', () => {
    expect(syncEurosInput('1 5', c(110_000))).toBe('1100')
  })
})

describe('centsToInput', () => {
  it('rend une chaîne vide pour un champ non renseigné', () => {
    expect(centsToInput(c(0))).toBe('')
    expect(centsToInput(c(110_000))).toBe('1100')
  })
})
