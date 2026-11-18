import { defineEventHandler } from 'h3'
import { findCurrentProfile } from '~~/server/utils/current-profile'
import type { CurrentProfileResponse } from '~~/shared/schemas/profile.schema'

/**
 * Profil courant, dans une enveloppe `{ profile }` (story 27.3, AC 7).
 *
 * Ne LÈVE jamais : un cookie absent ou désignant un profil inconnu doit permettre à
 * l'application de router vers `/profils` au lieu d'un écran en erreur.
 *
 * **Jamais `null` nu en retour.** h3 sérialise un handler qui renvoie `null` en `204 sans
 * corps` (`sendNoContent`), indiscernable côté client de l'état « rien encore reçu ». Toujours
 * un objet JSON, même quand il n'y a pas de profil (revue de la story 27.3).
 */
export default defineEventHandler(async (event): Promise<CurrentProfileResponse> => ({
  profile: findCurrentProfile(event),
}))
