import { defineEventHandler, setResponseStatus } from 'h3'
import { validateBody } from '~~/server/utils/validation'
import { createProfile } from '~~/server/utils/profiles'
import { NewProfileInputSchema, type Profile } from '~~/shared/schemas/profile.schema'

/**
 * Crée un profil avec son référentiel initial (FR73, AC 1-2, story 27.3).
 *
 * Ne pose PAS le cookie `pf_profile` : créer n'est pas basculer (AC 5 côté écran — pas de
 * bascule automatique). C'est `PUT /api/profiles/current` qui en a la charge.
 */
export default defineEventHandler(async (event): Promise<Profile> => {
  const body = await validateBody(event, NewProfileInputSchema)
  const profile = createProfile(body)
  setResponseStatus(event, 201)
  return profile
})
