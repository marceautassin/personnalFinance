import { sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { profiles } from '~~/server/db/schema'
import { seedReferential } from './seed-referential'
import { domainError } from './errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import type { NewProfileInput, Profile } from '~~/shared/schemas/profile.schema'

/**
 * Crée un profil avec son référentiel initial (FR73, AR36, story 27.3).
 *
 * **Atomicité (D39).** Le profil et son référentiel naissent dans la MÊME transaction —
 * `db.transaction` est synchrone ici (better-sqlite3, AUCUN `await` dans le callback) : un
 * échec du seed fait rollback l'insertion du profil, il ne reste jamais de profil sans
 * rubrique ni poste.
 *
 * **Unicité insensible à la casse et aux espaces de bord.** L'index unique de la table
 * (`profiles.name`) ne protège que l'égalité EXACTE — « Marceau » et « marceau » le
 * franchiraient tous les deux. La comparaison est donc faite en SQL, PAS confiée à la
 * contrainte de la table. Elle vit DANS le callback de la transaction (revue de la story 27.3,
 * IMPORTANT 3) : hors transaction, deux créations quasi simultanées au même nom passaient
 * toutes les deux leur propre vérification avant qu'aucune des deux insertions n'ait eu lieu.
 */
export function createProfile(input: NewProfileInput): Profile {
  const name = input.name.trim()

  return db.transaction((tx) => {
    const clash = tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(sql`lower(trim(${profiles.name})) = lower(${name})`)
      .get()
    if (clash) {
      throw domainError(ApiErrorCode.ProfileNameTaken, { name }, 409)
    }

    const inserted = tx
      .insert(profiles)
      .values({ name, defaultBank: input.defaultBank })
      .returning({ id: profiles.id, name: profiles.name, defaultBank: profiles.defaultBank })
      .get()
    seedReferential(tx, inserted.id)
    return inserted
  })
}
