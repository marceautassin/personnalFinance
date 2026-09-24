import { z } from 'zod'
import { BANKS } from '../types/bank'

/**
 * Contrat partagé des profils (story 27.3, FR73, FR74).
 *
 * Un profil est un espace de données cloisonné (D37) — pas un compte ni une identité : le
 * schéma ne porte donc rien qui y ressemble (pas de mot de passe, pas d'e-mail, pas de rôle).
 */
export const ProfileSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  defaultBank: z.enum(BANKS),
})

/** Nom borné à 40 caractères (AR36) : assez pour un prénom, trop court pour une phrase. */
export const NewProfileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    defaultBank: z.enum(BANKS),
  })
  .strict()

export const SelectProfileInputSchema = z
  .object({
    profileId: z.number().int().positive(),
  })
  .strict()

export type Profile = z.infer<typeof ProfileSchema>
export type NewProfileInput = z.infer<typeof NewProfileInputSchema>
export type SelectProfileInput = z.infer<typeof SelectProfileInputSchema>

/**
 * Réponse de `GET /api/profiles/current` — JAMAIS `Profile | null` nu (revue de la story 27.3).
 *
 * h3 traite un handler qui **renvoie `null`** comme un `sendNoContent` explicite (204 sans
 * corps, `node_modules/h3/dist/index.mjs`, `val === null` → `sendNoContent(event)`) : Nitro ne
 * sérialise alors jamais `"null"`. Côté client, `data.value` valait donc `null` par défaut
 * (avant toute réponse) ET après une réponse « aucun profil » — les deux cas étaient
 * indiscernables, et `currentProfile.value === null` dans `profile.global.ts` ne se déclenchait
 * jamais après un vrai aller-retour réseau. L'enveloppe transforme le « rien » en un OBJET JSON
 * concret (`{ profile: null }`), que h3 sérialise normalement.
 */
export interface CurrentProfileResponse {
  profile: Profile | null
}
