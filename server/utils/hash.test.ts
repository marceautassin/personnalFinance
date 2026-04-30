import { describe, it, expect } from 'vitest'
import { sha256 } from './hash'

describe('sha256', () => {
  it('returns 64 hex chars', () => {
    const result = sha256(Buffer.from('hello'))
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic for same content', () => {
    const a = sha256(Buffer.from('content'))
    const b = sha256(Buffer.from('content'))
    expect(a).toBe(b)
  })

  it('differs for different content', () => {
    const a = sha256(Buffer.from('a'))
    const b = sha256(Buffer.from('b'))
    expect(a).not.toBe(b)
  })

  it('matches known SHA-256 of "hello"', () => {
    expect(sha256(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })
})
