import { describe, it, expect } from 'vitest'
import { buildAmountCents } from './amount'
import { eurosToCents } from '~~/shared/types/money'

describe('buildAmountCents', () => {
  it('returns negative cents for expense direction', () => {
    expect(buildAmountCents(eurosToCents(12.34), 'expense')).toBe(-1234)
  })

  it('returns positive cents for income direction', () => {
    expect(buildAmountCents(eurosToCents(12.34), 'income')).toBe(1234)
  })

  it('handles zero correctly', () => {
    expect(buildAmountCents(eurosToCents(0), 'expense')).toBe(-0)
    expect(buildAmountCents(eurosToCents(0), 'income')).toBe(0)
  })
})
