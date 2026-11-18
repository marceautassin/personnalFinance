import type { CurrentProfileResponse } from '~~/shared/schemas/profile.schema'

/**
 * Garde de route — sans profil courant, chaque écran renvoie vers `/profils` (AC 7, story
 * 27.3) au lieu de laisser les endpoints répondre `400 profile_required` en cascade.
 *
 * Ne redirige qu'à PARTIR DU SECOND PROFIL : `findCurrentProfile`
 * (`server/utils/current-profile.ts`) applique le repli « exactement un profil » sans cookie —
 * avec un seul profil en base, `/api/profiles/current` rend déjà ce profil, jamais `null`. Les
 * E2E mono-profil n'ont donc pas à poser de cookie, et cette garde ne les casse pas.
 *
 * Même clé `current-profile` que `useProfiles`/`useCurrentProfile` (composables) : Nuxt
 * dédoublonne le fetch, la garde ne double aucun appel réseau déjà fait par la barre.
 *
 * **Falsy, jamais `=== null` (revue de la story 27.3, BLOQUANT 2).** L'endpoint renvoie
 * `{ profile: Profile | null }`, PAS `Profile | null` nu : un handler qui renvoie `null`
 * directement se sérialise en `204 sans corps` côté h3, que `data.value` ne distinguait alors
 * jamais de l'état initial « rien encore reçu ». Le test porte donc sur `!data.value?.profile`.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/profils') return

  const { data } = await useFetch<CurrentProfileResponse>('/api/profiles/current', {
    key: 'current-profile',
    server: false,
  })

  if (!data.value?.profile) {
    return navigateTo('/profils')
  }
})
