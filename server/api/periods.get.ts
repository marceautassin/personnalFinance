import { defineEventHandler } from 'h3'
import { eq, sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions, bankStatements } from '~~/server/db/schema'
import { requireProfile } from '~~/server/utils/current-profile'

/**
 * GET /api/periods — première et dernière date portant une transaction DU PROFIL COURANT.
 *
 * Sert à ouvrir l'analyse sur une période qui contient quelque chose. Par défaut, l'écran se
 * calait sur le mois courant : au 5 septembre, avec un historique s'arrêtant en août, l'app
 * s'ouvrait sur un écran entièrement vide — tous les indicateurs à zéro et les taux à « — »
 * (recette du 2026-09-05). L'app doit s'ouvrir sur ce qu'elle sait, pas sur la date du jour.
 *
 * `null` sur un profil sans transaction : l'appelant retombe alors sur le mois courant, qui est
 * le seul repère disponible.
 */
export default defineEventHandler(async (event): Promise<{ firstDate: string | null, lastDate: string | null }> => {
  const profileId = requireProfile(event)

  const row = await db
    .select({
      firstDate: sql<string | null>`min(${transactions.transactionDate})`,
      lastDate: sql<string | null>`max(${transactions.transactionDate})`,
    })
    .from(transactions)
    // `transactions` n'a pas de `profile_id` (D37) : restriction par le relevé, comme partout.
    .innerJoin(bankStatements, eq(bankStatements.hashSha256, transactions.statementHash))
    .where(eq(bankStatements.profileId, profileId))
    .get()

  return { firstDate: row?.firstDate ?? null, lastDate: row?.lastDate ?? null }
})
