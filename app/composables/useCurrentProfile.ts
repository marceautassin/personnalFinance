import type { CurrentProfileResponse, Profile } from '~~/shared/schemas/profile.schema'

/**
 * Profil courant SEUL (story 27.3) — pour la barre d'application, qui s'affiche sur CHAQUE
 * écran, et pour la garde de route.
 *
 * Séparé de `useProfiles` (revue de la story 27.3, IMPORTANT 4) : celui-ci charge en plus la
 * LISTE complète des profils, qui ne sert qu'à l'écran `/profils`. La barre l'aurait sinon
 * rechargée sur CHAQUE navigation — un appel réseau que rien n'utilise ailleurs.
 *
 * Même clé `current-profile` que `useProfiles` et que `app/middleware/profile.global.ts` :
 * Nuxt dédoublonne le fetch, ce composable ne double jamais leur appel.
 */
export function useCurrentProfile() {
  const fetchState = useFetch<CurrentProfileResponse>('/api/profiles/current', {
    key: 'current-profile',
    server: false,
  })

  // L'enveloppe `{ profile }` (et non `Profile | null` nu) existe pour que h3 sérialise un
  // vrai corps JSON même sans profil : un handler qui renvoie `null` produit un `204 sans
  // corps`, indiscernable côté client de « pas encore de réponse » (revue de la story 27.3,
  // BLOQUANT 2). On déballe ici, une seule fois.
  const currentProfile = computed<Profile | null>(() => fetchState.data.value?.profile ?? null)

  return {
    currentProfile,
    pending: fetchState.pending,
    refresh: fetchState.refresh,
  }
}
