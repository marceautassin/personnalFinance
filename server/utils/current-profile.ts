import { getCookie } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { profiles } from '~~/server/db/schema'
import type { H3Event } from 'h3'
import { type ProfileId, profileId } from '~~/shared/types/profile'
import type { Profile } from '~~/shared/schemas/profile.schema'
import { badRequest } from './errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

const PROFILE_COLUMNS = { id: profiles.id, name: profiles.name, defaultBank: profiles.defaultBank }

/**
 * Profil courant (story 27.2, D38, AR35) — point d'entrée UNIQUE : c'est la seule fonction du
 * code qui lit le cookie `pf_profile`. Tous les endpoints de `server/api/` (hors
 * `server/api/profiles/`, story 27.3) passent par `requireProfile`, ci-dessous, qui n'est
 * qu'un enrobage de celle-ci — c'est ce qui rendra l'authentification (22.1) bon marché : elle
 * remplacera l'intérieur de cette fonction par une session, sans toucher aux appelants.
 *
 * **Repli sans cookie.** Sans cookie, et SEULEMENT s'il existe exactement un profil en base, ce
 * profil est renvoyé. Sans ce repli, l'application et toute la suite E2E mono-profil
 * répondraient en erreur avant même que l'écran des profils (27.3) n'ait pu poser le cookie.
 * Dès qu'un second profil existe, le repli disparaît de lui-même : il n'y a alors plus d'unique
 * choix possible, et rester silencieux reviendrait à deviner à la place de l'utilisateur.
 *
 * **Cookie invalide** (non entier, ou profil inexistant) : toujours `null` ici — jamais de
 * repli silencieux, un cookie qui ne désigne rien de valide n'est pas une absence de cookie.
 *
 * `event` reste obligatoire (revue de la story 27.1) : un paramètre optionnel qu'on ignorerait
 * inviterait un appelant futur à l'omettre, avec un retour silencieux sur « le profil par
 * défaut » plutôt qu'une absence explicite.
 */
export function findCurrentProfile(event: H3Event): Profile | null {
  const raw = getCookie(event, 'pf_profile')

  if (raw === undefined) {
    const rows = db.select(PROFILE_COLUMNS).from(profiles).all()
    return rows.length === 1 ? rows[0]! : null
  }

  const id = Number(raw)
  if (Number.isInteger(id) && id > 0) {
    const row = db.select(PROFILE_COLUMNS).from(profiles).where(eq(profiles.id, id)).limit(1).get()
    if (row !== undefined) return row
  }

  return null
}

/**
 * Enrobage de `findCurrentProfile` : lève plutôt que de rendre `null`. Même erreur, sans
 * détail distinguant « pas de cookie » de « cookie invalide » (revue de la story 27.2, esprit
 * de D38 : jamais confirmer l'existence d'une ressource par la forme de l'erreur).
 *
 * Rend le `Profile` complet — et pas seulement son id — pour les appelants qui ont aussi
 * besoin d'un de ses champs (ex : `defaultBank` à l'ingestion, story 28.1) sans relire la
 * table une seconde fois.
 */
export function requireCurrentProfile(event: H3Event): Profile {
  const profile = findCurrentProfile(event)
  if (profile === null) {
    throw badRequest(ApiErrorCode.ProfileRequired)
  }
  return profile
}

/**
 * Enrobage de `requireCurrentProfile` pour les 23 endpoints filtrés par profil (story 27.2)
 * qui n'ont besoin que de l'identifiant.
 */
export function requireProfile(event: H3Event): ProfileId {
  return profileId(requireCurrentProfile(event).id)
}
