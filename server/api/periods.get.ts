import { defineEventHandler } from 'h3'
import { sql } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions } from '~~/server/db/schema'

/**
 * GET /api/periods — première et dernière date portant une transaction.
 *
 * Sert à ouvrir l'analyse sur une période qui contient quelque chose. Par défaut, l'écran se
 * calait sur le mois courant : au 5 septembre, avec un historique s'arrêtant en août, l'app
 * s'ouvrait sur un écran entièrement vide — tous les indicateurs à zéro et les taux à « — »
 * (recette du 2026-09-05). L'app doit s'ouvrir sur ce qu'elle sait, pas sur la date du jour.
 *
 * `null` sur une base sans transaction : l'appelant retombe alors sur le mois courant, qui est
 * le seul repère disponible.
 */
export default defineEventHandler(async (): Promise<{ firstDate: string | null, lastDate: string | null }> => {
  const row = await db
    .select({
      firstDate: sql<string | null>`min(${transactions.transactionDate})`,
      lastDate: sql<string | null>`max(${transactions.transactionDate})`,
    })
    .from(transactions)
    .get()

  return { firstDate: row?.firstDate ?? null, lastDate: row?.lastDate ?? null }
})
