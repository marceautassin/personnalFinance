import { defineEventHandler } from 'h3'
import { sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { profiles } from '~~/server/db/schema'
import type { Profile } from '~~/shared/schemas/profile.schema'

/**
 * Liste des profils, triés par nom (story 27.3).
 *
 * Tri INSENSIBLE À LA CASSE : le collationnement par défaut de SQLite est un tri d'octets, où
 * toute majuscule précède toute minuscule (`Zoe` avant `marceau`) — un ordre qui ne correspond
 * à aucune lecture humaine du nom.
 */
export default defineEventHandler(async (): Promise<Profile[]> =>
  db
    .select({ id: profiles.id, name: profiles.name, defaultBank: profiles.defaultBank })
    .from(profiles)
    .orderBy(sql`lower(${profiles.name})`)
    .all(),
)
