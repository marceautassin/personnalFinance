import { db } from '~~/server/db/client'
import { profiles } from '~~/server/db/schema'
import type { H3Event } from 'h3'

/**
 * Profil courant, version minimale (story 27.1, AR35).
 *
 * La signature `requireProfile(event): number` est FINALE dès cette story — c'est elle que le
 * reste du code appelle. Ce qu'elle fait derrière ne l'est pas : ici, il n'existe qu'un seul
 * profil possible, et elle le renvoie ou échoue explicitement. Le cookie `pf_profile`, le
 * filtrage des lectures par profil et le 404 inter-profils arrivent en 27.2, SANS changer cette
 * signature ni ses appelants.
 *
 * `event` n'est pas encore LU : il est déjà dans la signature pour que 27.2 n'ait à modifier
 * aucun appelant, seulement le corps de cette fonction. Il reste **obligatoire** (revue de la
 * story 27.1) — un paramètre optionnel qu'on ignore aujourd'hui invite un appelant futur à
 * l'omettre, et retomberait alors silencieusement sur « le profil par défaut » au lieu d'échouer
 * quand 27.2 branchera la lecture du cookie sur ce même paramètre.
 */
export function requireProfile(_event: H3Event): number {
  const rows = db.select({ id: profiles.id }).from(profiles).all()

  if (rows.length === 0) {
    throw new Error(
      'Aucun profil en base. La migration 0010 sème `marceau` inconditionnellement : '
      + 'lance `yarn apply-migration` puis relance le serveur.',
    )
  }
  if (rows.length > 1) {
    throw new Error(
      `${rows.length} profils en base, mais requireProfile() de cette story n'en gère qu'un `
      + 'seul (le cookie et le filtrage arrivent en 27.2).',
    )
  }

  return rows[0]!.id
}
