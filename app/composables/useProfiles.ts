import type { NewProfileInput, Profile } from '~~/shared/schemas/profile.schema'
import type { MutationOutcome } from './useApiError'
import { useCurrentProfile } from './useCurrentProfile'

/**
 * Profils — lecture de la LISTE complète et mutations, pour l'écran `/profils` (story 27.3,
 * D38). Le profil courant seul est délégué à `useCurrentProfile` (revue de la story 27.3,
 * IMPORTANT 4) : la barre d'application, qui s'affiche sur chaque écran, n'a besoin que de
 * lui, jamais de la liste entière. Pas de store Pinia (anti-pattern « cache Pinia de données
 * serveur », CLAUDE.md) : chaque écran qui a besoin de ces données rappelle ces composables,
 * dont Nuxt dédoublonne la clé.
 */
export function useProfiles() {
  const listFetch = useFetch<Profile[]>('/api/profiles', {
    key: 'profiles',
    server: false,
    default: () => [],
  })
  const { currentProfile, refresh: refreshCurrentProfile } = useCurrentProfile()

  const { mapMutationError } = useApiError()

  /**
   * Crée un profil. Ne bascule PAS dessus (AC 5 côté écran) : `selectProfile` s'en charge.
   *
   * Rafraîchit AUSSI `current-profile`, pas seulement la liste (revue de la story 27.3,
   * IMPORTANT 1). Créer un second profil fait disparaître, côté serveur, le repli
   * « exactement un profil » (D38) : `/api/profiles/current` peut alors se mettre à rendre
   * `{ profile: null }` sans qu'aucun cookie n'ait changé. Sans ce refresh, le cache client
   * mentait — badge « en cours » resté sur l'ancien profil, barre inchangée, et la garde de
   * route ne redirigeait pas puisqu'elle relit ce même cache (trouvé au navigateur).
   */
  async function createProfile(input: NewProfileInput): Promise<MutationOutcome & { profile?: Profile }> {
    let profile: Profile
    try {
      profile = await apiMutate<Profile>('/api/profiles', { method: 'POST', body: input })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await listFetch.refresh()
    await refreshCurrentProfile()
    return { ok: true, profile }
  }

  /**
   * Bascule sur un profil, puis recharge ENTIÈREMENT l'application (D38).
   *
   * Pas d'invalidation fine : le rechargement complet garantit qu'aucune donnée d'un profil ne
   * survit en mémoire sous un autre. `reloadNuxtApp` remplace la page — il n'y a donc rien à
   * `await` après lui côté appelant.
   *
   * `force: true` est OBLIGATOIRE ici. Sans lui, `reloadNuxtApp` se souvient (sessionStorage,
   * 10 s de fenêtre) du dernier chemin rechargé et NE FAIT RIEN au second appel vers le même
   * chemin — exactement le cas d'un aller-retour entre deux profils, qui atterrissent tous les
   * deux sur `/analyse`. Sans `force`, le bouton restait bloqué sur « Bascule… » indéfiniment,
   * la garde de ré-entrance ne se relâchant jamais (trouvé en E2E).
   */
  async function selectProfile(profileId: number): Promise<MutationOutcome> {
    try {
      await apiMutate('/api/profiles/current', { method: 'PUT', body: { profileId } })
    }
    catch (err) {
      return mapMutationError(err)
    }
    reloadNuxtApp({ path: '/analyse', force: true })
    return { ok: true }
  }

  return {
    profiles: listFetch.data,
    profilesPending: listFetch.pending,
    profilesError: listFetch.error,
    currentProfile,
    refreshCurrentProfile,
    createProfile,
    selectProfile,
  }
}
