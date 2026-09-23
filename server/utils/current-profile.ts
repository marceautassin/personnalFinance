import { getCookie } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { profiles } from '~~/server/db/schema'
import type { H3Event } from 'h3'
import { type ProfileId, profileId } from '~~/shared/types/profile'
import { badRequest } from './errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Profil courant (story 27.2, D38, AR35).
 *
 * Point d'entrée UNIQUE : c'est la seule fonction du code qui lit le cookie `pf_profile`. Tous
 * les 23 endpoints de `server/api/` (hors `profiles/`, qui arrive en 27.3) l'appellent et
 * n'accèdent jamais au cookie eux-mêmes — c'est ce qui rendra l'authentification (22.1) bon
 * marché : elle remplacera l'intérieur de cette fonction par une session, sans toucher aux
 * appelants.
 *
 * **Repli sans cookie.** Sans cookie, et SEULEMENT s'il existe exactement un profil en base, ce
 * profil est renvoyé. L'écran de choix du profil arrive en 27.3 ; sans ce repli, l'application
 * et toute la suite E2E répondraient `400` entre les deux stories. Dès qu'un second profil
 * existe, le repli disparaît de lui-même : il n'y a alors plus d'unique choix possible, et
 * rester silencieux reviendrait à deviner à la place de l'utilisateur.
 *
 * **Cookie invalide** (non entier, ou profil inexistant) : toujours `400 profile_required`,
 * jamais de repli silencieux — un cookie qui ne désigne rien de valide n'est pas une absence de
 * cookie. Les deux cas rendent EXACTEMENT la même erreur, sans le cookie reçu ni aucun détail
 * distinguant « mal formé » de « profil inconnu » (revue de la story 27.2, esprit de D38 :
 * jamais confirmer l'existence d'une ressource). Un cookie qui énumérerait les id valides par
 * essais successifs n'apprendrait donc rien de la réponse.
 *
 * `event` reste obligatoire (revue de la story 27.1) : un paramètre optionnel qu'on ignorerait
 * inviterait un appelant futur à l'omettre, avec un retour silencieux sur « le profil par
 * défaut » plutôt qu'une erreur.
 */
export function requireProfile(event: H3Event): ProfileId {
  const raw = getCookie(event, 'pf_profile')

  if (raw === undefined) {
    const rows = db.select({ id: profiles.id }).from(profiles).all()
    if (rows.length === 1) return profileId(rows[0]!.id)
    throw badRequest(ApiErrorCode.ProfileRequired, { reason: rows.length === 0 ? 'no_profile' : 'ambiguous_without_cookie' })
  }

  const id = Number(raw)
  if (Number.isInteger(id) && id > 0) {
    const row = db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, id)).limit(1).get()
    if (row !== undefined) return profileId(row.id)
  }

  // Même erreur, sans le cookie reçu ni le motif précis : un cookie mal formé et un cookie
  // désignant un profil inexistant ne doivent pas se distinguer dans la réponse.
  throw badRequest(ApiErrorCode.ProfileRequired, { reason: 'invalid_cookie' })
}
