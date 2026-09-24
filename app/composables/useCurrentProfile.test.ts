import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'

vi.stubGlobal('computed', computed)

interface Profile { id: number, name: string, defaultBank: string }

/** Donnée brute de `/api/profiles/current` — l'ENVELOPPE `{ profile }`, jamais nue. */
const fetchData = ref<{ profile: Profile | null } | undefined>(undefined)
const refreshMock = vi.fn()

vi.stubGlobal('useFetch', (url: string) => {
  if (url === '/api/profiles/current') {
    return { data: fetchData, pending: ref(false), refresh: refreshMock }
  }
  throw new Error(`useFetch(${url}) inattendu`)
})

const { useCurrentProfile } = await import('./useCurrentProfile')

beforeEach(() => {
  fetchData.value = undefined
  refreshMock.mockClear()
})

/**
 * Story 27.3, revue (IMPORTANT 5) : ce composable n'avait aucun test, alors que c'est LÀ que
 * logeait le BLOQUANT 2 (`current.get.ts` renvoyait `Profile | null` nu — h3 sérialise un
 * `null` en 204 sans corps — et `currentProfile.value === null` ne se déclenchait donc jamais
 * après une vraie réponse réseau). Ces tests figent le déballage de l'enveloppe `{ profile }`.
 */
describe('useCurrentProfile', () => {
  it('rend `null` avant que la réponse n\'arrive (état initial de useFetch)', () => {
    const { currentProfile } = useCurrentProfile()
    expect(currentProfile.value).toBeNull()
  })

  it('rend `null` quand le serveur répond « aucun profil courant » (AC 7)', () => {
    fetchData.value = { profile: null }
    const { currentProfile } = useCurrentProfile()
    expect(currentProfile.value).toBeNull()
  })

  it('déballe le profil courant reçu', () => {
    fetchData.value = { profile: { id: 1, name: 'marceau', defaultBank: 'boursorama' } }
    const { currentProfile } = useCurrentProfile()
    expect(currentProfile.value).toEqual({ id: 1, name: 'marceau', defaultBank: 'boursorama' })
  })

  it('reflète un changement de la donnée sous-jacente (réactivité)', () => {
    const { currentProfile } = useCurrentProfile()
    expect(currentProfile.value).toBeNull()

    fetchData.value = { profile: { id: 2, name: 'Camille', defaultBank: 'boursorama' } }
    expect(currentProfile.value).toEqual({ id: 2, name: 'Camille', defaultBank: 'boursorama' })

    fetchData.value = { profile: null }
    expect(currentProfile.value).toBeNull()
  })
})
