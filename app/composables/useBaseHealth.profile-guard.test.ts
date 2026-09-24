import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed, watch } from 'vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)

const refreshMock = vi.fn()
const currentProfile = ref<{ id: number, name: string, defaultBank: string } | null>(null)

vi.mock('~/composables/useStatements', () => ({
  useStatementsList: (options: { immediate?: boolean }) => {
    // `immediate` DOIT être `false` : la garde ne sert à rien si le fetch part quand même.
    expect(options.immediate).toBe(false)
    return {
      data: computed(() => ({ statements: [] })),
      pending: ref(false),
      error: ref(null),
      refresh: refreshMock,
    }
  },
}))

vi.mock('~/composables/useCurrentProfile', () => ({
  useCurrentProfile: () => ({ currentProfile }),
}))

const { useBaseHealth } = await import('./useBaseHealth')

beforeEach(() => {
  currentProfile.value = null
  refreshMock.mockClear()
})

/**
 * Story 27.3, revue (IMPORTANT 2) : la barre d'application — donc `useBaseHealth` — s'affiche
 * même sur `/profils`, l'écran où la garde de route envoie un visiteur SANS profil courant.
 * Sans cette garde, `GET /api/statements` partait quand même et répondait `400
 * profile_required` à chaque affichage de cet écran précis.
 */
describe('useBaseHealth — garde du profil courant', () => {
  it('ne rafraîchit PAS la liste des relevés tant qu\'aucun profil courant n\'existe', () => {
    useBaseHealth()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('rafraîchit dès qu\'un profil courant devient disponible', () => {
    currentProfile.value = { id: 1, name: 'marceau', defaultBank: 'boursorama' }
    useBaseHealth()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
