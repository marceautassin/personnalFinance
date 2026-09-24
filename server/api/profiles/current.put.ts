import { defineEventHandler, setCookie } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { profiles } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { notFound } from '~~/server/utils/errors'
import { SelectProfileInputSchema, type Profile } from '~~/shared/schemas/profile.schema'

/**
 * Bascule de profil (story 27.3, AC 3, D38).
 *
 * Pose `pf_profile` en `httpOnly` + `SameSite=Strict` — un an, comme les autres cookies
 * applicatifs longue durée du projet. Un an à 31 536 000 s.
 */
export default defineEventHandler(async (event): Promise<Profile> => {
  const { profileId } = await validateBody(event, SelectProfileInputSchema)

  const profile = db
    .select({ id: profiles.id, name: profiles.name, defaultBank: profiles.defaultBank })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .get()
  if (profile === undefined) {
    throw notFound(undefined, { profileId })
  }

  setCookie(event, 'pf_profile', String(profile.id), {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 31536000,
  })

  return profile
})
