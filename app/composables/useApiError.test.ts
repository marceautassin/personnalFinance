import { describe, it, expect } from 'vitest'
import { useApiError } from './useApiError'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

describe('useApiError.mapError', () => {
  const { mapError } = useApiError()

  it('mappe un code connu vers son message FR', () => {
    expect(mapError({ statusMessage: ApiErrorCode.ValidationFailed })).toBe(
      'Les données saisies sont invalides. Vérifie les champs en erreur.',
    )
    expect(mapError({ statusMessage: ApiErrorCode.ReconciliationFailed })).toContain(
      'ne correspondent pas au solde',
    )
  })

  it('utilise le fallback pour un code inconnu', () => {
    expect(mapError({ statusMessage: 'totally_unknown_code' })).toBe(
      'Une erreur est survenue. Réessaie ou recharge la page.',
    )
  })

  it('retourne le fallback si err est null/undefined/non-objet', () => {
    expect(mapError(null)).toContain('Une erreur est survenue')
    expect(mapError(undefined)).toContain('Une erreur est survenue')
    expect(mapError('string')).toContain('Une erreur est survenue')
    expect(mapError(42)).toContain('Une erreur est survenue')
  })

  it('retourne le fallback si statusMessage absent', () => {
    expect(mapError({})).toContain('Une erreur est survenue')
  })

  it('extrait statusMessage depuis err.data quand présent (FetchError pattern)', () => {
    expect(mapError({ data: { statusMessage: ApiErrorCode.NotFound } })).toBe('Ressource introuvable.')
  })

  it('priorise err.data.statusMessage sur err.statusMessage (FetchError réel)', () => {
    // ofetch/Nuxt expose statusMessage = phrase HTTP, le code domaine est dans data
    expect(mapError({
      statusMessage: 'Bad Request',
      data: { statusMessage: ApiErrorCode.ReconciliationFailed },
    })).toContain('ne correspondent pas au solde')
  })

  it('ignore les clés de prototype (proto-pollution guard)', () => {
    expect(mapError({ statusMessage: '__proto__' })).toBe(
      'Une erreur est survenue. Réessaie ou recharge la page.',
    )
    expect(mapError({ statusMessage: 'constructor' })).toBe(
      'Une erreur est survenue. Réessaie ou recharge la page.',
    )
  })

  it('retourne le fallback si statusMessage n\'est pas une string', () => {
    expect(mapError({ statusMessage: 42 })).toContain('Une erreur est survenue')
    expect(mapError({ statusMessage: Symbol('x') })).toContain('Une erreur est survenue')
    expect(mapError({ statusMessage: { nested: true } })).toContain('Une erreur est survenue')
  })

  it('couvre tous les codes définis dans ApiErrorCode', () => {
    for (const code of Object.values(ApiErrorCode)) {
      const msg = mapError({ statusMessage: code })
      expect(msg).not.toBe('Une erreur est survenue. Réessaie ou recharge la page.')
      expect(msg.length).toBeGreaterThan(0)
    }
  })
})
