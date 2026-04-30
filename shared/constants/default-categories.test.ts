import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from './default-categories'

describe('DEFAULT_CATEGORIES', () => {
  it('has unique codes', () => {
    const codes = DEFAULT_CATEGORIES.map(c => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('contains both variable and fixed entries', () => {
    expect(DEFAULT_CATEGORIES.some(c => c.isVariable)).toBe(true)
    expect(DEFAULT_CATEGORIES.some(c => !c.isVariable)).toBe(true)
  })

  it('every entry has non-empty code and label', () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.code.length).toBeGreaterThan(0)
      expect(c.label.length).toBeGreaterThan(0)
    }
  })

  it('includes the technical "divers" fallback', () => {
    expect(DEFAULT_CATEGORIES.find(c => c.code === 'divers')).toBeDefined()
  })
})
