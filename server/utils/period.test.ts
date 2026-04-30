import { describe, it, expect } from 'vitest'
import { monthOf, parseMonth, monthsOverlap, nextMonths, daysBetween } from './period'

describe('monthOf', () => {
  it('extracts month from a date', () => expect(monthOf('2026-04-15')).toBe('2026-04'))
  it('throws on invalid date format', () => expect(() => monthOf('2026/04/15')).toThrow())
  it('throws on invalid calendar date (feb 31)', () => expect(() => monthOf('2026-02-31')).toThrow())
  it('throws on invalid month (13)', () => expect(() => monthOf('2026-13-01')).toThrow())
  it('throws on invalid day (32)', () => expect(() => monthOf('2026-01-32')).toThrow())
})

describe('parseMonth', () => {
  it('parses valid month', () => expect(parseMonth('2026-04')).toEqual({ year: 2026, month: 4 }))
  it('rejects invalid month', () => expect(parseMonth('2026-13')).toBeNull())
  it('rejects garbage', () => expect(parseMonth('garbage')).toBeNull())
})

describe('monthsOverlap', () => {
  it('detects exact overlap', () =>
    expect(monthsOverlap('2026-01-01', '2026-01-31', '2026-01-15', '2026-02-15')).toBe(true))
  it('detects no overlap', () =>
    expect(monthsOverlap('2026-01-01', '2026-01-31', '2026-02-01', '2026-02-28')).toBe(false))
  it('detects touching boundaries (inclusive)', () =>
    expect(monthsOverlap('2026-01-01', '2026-01-31', '2026-01-31', '2026-02-15')).toBe(true))
  it('throws on malformed input (non zero-padded)', () =>
    expect(() => monthsOverlap('2026-1-1', '2026-1-31', '2026-2-1', '2026-2-28')).toThrow())
  it('throws on calendar-invalid date', () =>
    expect(() => monthsOverlap('2026-02-30', '2026-03-01', '2026-01-01', '2026-01-31')).toThrow())
})

describe('nextMonths', () => {
  it('handles n=0', () => expect(nextMonths('2026-04', 0)).toEqual([]))
  it('returns 3 months from April', () =>
    expect(nextMonths('2026-04', 3)).toEqual(['2026-04', '2026-05', '2026-06']))
  it('handles year boundary', () =>
    expect(nextMonths('2026-12', 3)).toEqual(['2026-12', '2027-01', '2027-02']))
  it('handles 24 months across years', () => {
    const r = nextMonths('2026-01', 24)
    expect(r[0]).toBe('2026-01')
    expect(r[23]).toBe('2027-12')
    expect(r).toHaveLength(24)
  })
  it('throws on invalid month', () => expect(() => nextMonths('garbage', 1)).toThrow())
  it('throws on Infinity (would loop forever)', () =>
    expect(() => nextMonths('2026-04', Number.POSITIVE_INFINITY)).toThrow())
  it('throws on NaN', () => expect(() => nextMonths('2026-04', Number.NaN)).toThrow())
  it('throws on float n', () => expect(() => nextMonths('2026-04', 2.5)).toThrow())
  it('throws on negative n', () => expect(() => nextMonths('2026-04', -1)).toThrow())
})

describe('daysBetween', () => {
  it('counts days within a month', () => expect(daysBetween('2026-04-01', '2026-04-15')).toBe(14))
  it('handles february leap year (2024)', () =>
    expect(daysBetween('2024-02-01', '2024-03-01')).toBe(29))
  it('handles february non-leap (2026)', () =>
    expect(daysBetween('2026-02-01', '2026-03-01')).toBe(28))
  it('returns negative for reverse', () =>
    expect(daysBetween('2026-04-15', '2026-04-01')).toBe(-14))
  it('handles year boundary', () =>
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1))
  it('throws on calendar-invalid date (would silently roll over)', () =>
    expect(() => daysBetween('2026-02-30', '2026-03-01')).toThrow())
})
