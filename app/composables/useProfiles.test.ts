import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'

vi.stubGlobal('computed', computed)

interface Profile { id: number, name: string, defaultBank: string }

const listData = ref<Profile[]>([])
const listPending = ref(false)
const listError = ref<unknown>(null)
const listRefresh = vi.fn()

const currentData = ref<{ profile: Profile | null } | undefined>(undefined)
const currentRefresh = vi.fn()

const apiMutateMock = vi.fn()
const mapMutationErrorMock = vi.fn(() => ({ error: 'message mappé', errorCode: 'some_code' }))
const reloadNuxtAppMock = vi.fn()

vi.stubGlobal('useFetch', (url: string) => {
  if (url === '/api/profiles') {
    return { data: listData, pending: listPending, error: listError, refresh: listRefresh }
  }
  if (url === '/api/profiles/current') {
    return { data: currentData, pending: ref(false), refresh: currentRefresh }
  }
  throw new Error(`useFetch(${url}) inattendu`)
})
vi.stubGlobal('apiMutate', apiMutateMock)
vi.stubGlobal('useApiError', () => ({ mapMutationError: mapMutationErrorMock }))
vi.stubGlobal('reloadNuxtApp', reloadNuxtAppMock)

const { useProfiles } = await import('./useProfiles')

beforeEach(() => {
  listData.value = []
  listPending.value = false
  listError.value = null
  listRefresh.mockClear()
  currentData.value = undefined
  currentRefresh.mockClear()
  apiMutateMock.mockReset()
  mapMutationErrorMock.mockClear()
  reloadNuxtAppMock.mockClear()
})

describe('useProfiles — currentProfile', () => {
  it('délègue à useCurrentProfile : `null` sans profil courant (AC 7)', () => {
    currentData.value = { profile: null }
    const { currentProfile } = useProfiles()
    expect(currentProfile.value).toBeNull()
  })

  it('délègue à useCurrentProfile : profil déballé quand présent', () => {
    currentData.value = { profile: { id: 1, name: 'marceau', defaultBank: 'boursorama' } }
    const { currentProfile } = useProfiles()
    expect(currentProfile.value).toEqual({ id: 1, name: 'marceau', defaultBank: 'boursorama' })
  })
})

describe('useProfiles.createProfile', () => {
  it('rafraîchit la liste et rend le profil créé', async () => {
    const created = { id: 2, name: 'Camille', defaultBank: 'boursorama' as const }
    apiMutateMock.mockResolvedValueOnce(created)

    const { createProfile } = useProfiles()
    const outcome = await createProfile({ name: 'Camille', defaultBank: 'boursorama' })

    expect(outcome).toEqual({ ok: true, profile: created })
    expect(listRefresh).toHaveBeenCalledTimes(1)
    const [url, opts] = apiMutateMock.mock.calls[0]!
    expect(url).toBe('/api/profiles')
    expect(opts).toMatchObject({ method: 'POST', body: { name: 'Camille', defaultBank: 'boursorama' } })
  })

  /**
   * Story 27.3, revue (IMPORTANT 1) : créer un second profil fait DISPARAÎTRE, côté serveur,
   * le repli « exactement un profil » (D38) — `/api/profiles/current` peut se mettre à rendre
   * `{ profile: null }` sans qu'aucun cookie n'ait changé. Sans ce rafraîchissement, le badge
   * « en cours », la barre et la garde de route continuaient à lire l'ancien profil en cache
   * (trouvé au navigateur : deux `400 profile_required` en console, page à moitié affichée).
   */
  it('rafraîchit AUSSI current-profile (pas seulement la liste)', async () => {
    apiMutateMock.mockResolvedValueOnce({ id: 2, name: 'Camille', defaultBank: 'boursorama' })

    const { createProfile } = useProfiles()
    await createProfile({ name: 'Camille', defaultBank: 'boursorama' })

    expect(currentRefresh).toHaveBeenCalledTimes(1)
  })

  it('mappe l\'erreur (ex. 409 profile_name_taken) sans rafraîchir la liste ni le profil courant', async () => {
    apiMutateMock.mockRejectedValueOnce({ statusCode: 409, statusMessage: 'profile_name_taken' })

    const { createProfile } = useProfiles()
    const outcome = await createProfile({ name: 'marceau', defaultBank: 'boursorama' })

    expect(outcome).toEqual({ error: 'message mappé', errorCode: 'some_code' })
    expect(listRefresh).not.toHaveBeenCalled()
    expect(currentRefresh).not.toHaveBeenCalled()
  })
})

describe('useProfiles.selectProfile', () => {
  /**
   * Story 27.3, revue (IMPORTANT 5) : le `force: true` a été trouvé tardivement en E2E — sans
   * lui, `reloadNuxtApp` se souvient (sessionStorage, 10 s) du dernier chemin rechargé et NE
   * FAIT RIEN au second appel vers le même chemin. Ce test fige le contrat exact de l'appel
   * pour qu'un futur refactor ne le perde pas en silence.
   */
  it('pose le profil PUIS recharge `/analyse` avec `force: true`', async () => {
    apiMutateMock.mockResolvedValueOnce(undefined)

    const { selectProfile } = useProfiles()
    const outcome = await selectProfile(2)

    expect(outcome).toEqual({ ok: true })
    const [url, opts] = apiMutateMock.mock.calls[0]!
    expect(url).toBe('/api/profiles/current')
    expect(opts).toMatchObject({ method: 'PUT', body: { profileId: 2 } })
    expect(reloadNuxtAppMock).toHaveBeenCalledWith({ path: '/analyse', force: true })
  })

  it('mappe l\'erreur (ex. 404) sans recharger l\'application', async () => {
    apiMutateMock.mockRejectedValueOnce({ statusCode: 404, statusMessage: 'not_found' })

    const { selectProfile } = useProfiles()
    const outcome = await selectProfile(9999)

    expect(outcome).toEqual({ error: 'message mappé', errorCode: 'some_code' })
    expect(reloadNuxtAppMock).not.toHaveBeenCalled()
  })
})
