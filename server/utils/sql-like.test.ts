import { describe, it, expect } from 'vitest'
import { escapeLike, likeContains } from './sql-like'

describe('escapeLike (story 17.8)', () => {
  it('neutralise les jokers LIKE', () => {
    expect(escapeLike('a_b')).toBe('a\\_b')
    expect(escapeLike('100%')).toBe('100\\%')
  })

  it('échappe le caractère d\'échappement lui-même', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b')
  })

  it('laisse un motif ordinaire intact', () => {
    expect(escapeLike('carrefour market')).toBe('carrefour market')
  })

  it('rend un motif « contient » encadré de jokers non échappés', () => {
    expect(likeContains('a_b')).toBe('%a\\_b%')
  })

  it('gère la chaîne vide', () => {
    expect(escapeLike('')).toBe('')
    expect(likeContains('')).toBe('%%')
  })
})
