import { describe, it, expect } from 'vitest'
import { parseFrAmount } from './fr-parsing'
import { eurosToCents } from '~~/shared/types/money'

describe('parseFrAmount', () => {
  it('parses a standard FR amount with thin space and comma', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })

  it('parses an amount with euro symbol', () => {
    expect(parseFrAmount('1 234,56 €')).toBe(eurosToCents(1234.56))
  })

  it('parses a negative amount (overdraft)', () => {
    expect(parseFrAmount('-12,34')).toBe(eurosToCents(-12.34))
  })

  it('parses an amount with non-breaking spaces (U+00A0)', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })

  it('parses an amount with narrow no-break space (U+202F)', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })

  it('parses dot decimal as fallback', () => {
    expect(parseFrAmount('1234.56')).toBe(eurosToCents(1234.56))
  })

  it('parses Boursobank thousands-dot + comma-decimal ("1.023,98")', () => {
    expect(parseFrAmount('1.023,98')).toBe(eurosToCents(1023.98))
  })

  it('parses millions with thousands-dot ("1.234.567,89")', () => {
    expect(parseFrAmount('1.234.567,89')).toBe(eurosToCents(1234567.89))
  })

  it('returns null on garbage input', () => {
    expect(parseFrAmount('hello')).toBeNull()
  })

  it('returns null on empty string', () => {
    expect(parseFrAmount('')).toBeNull()
  })

  it('returns null on ambiguous "1.234" (no comma, dot+3 digits)', () => {
    // Pourrait être 1.234 € ASCII OU 1 234 € milliers-point — on refuse de deviner.
    expect(parseFrAmount('1.234')).toBeNull()
  })

  it('returns null on ambiguous "12.345" (no comma, dot+3 digits)', () => {
    expect(parseFrAmount('12.345')).toBeNull()
  })

  it('parses non-ambiguous "1234.56" (2 decimals, ASCII fallback)', () => {
    expect(parseFrAmount('1234.56')).toBe(eurosToCents(1234.56))
  })
})
