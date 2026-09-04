import { defineEventHandler } from 'h3'
import { asc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debts } from '~~/server/db/schema'
import { balanceSumsByDebt, toCurrentBalance, linkedTransactionCountsByDebt } from '~~/server/utils/debt-balance'
import { cents, type Cents } from '~~/shared/types/money'
import type { Debt } from '~~/shared/schemas/debt.schema'

/**
 * Liste des dettes (story 6.1) enrichie du solde courant CALCULÉ (jamais stocké) :
 * `currentBalanceCents = initial + Σévénements signés + Σmontants signés rattachés`. Tri `created_at` ASC.
 * Le solde peut être NÉGATIF depuis le ledger signé (story 6.5) — c'est une créance.
 */
export default defineEventHandler(async (): Promise<Debt[]> => {
  const rows = await db.select().from(debts).orderBy(asc(debts.createdAt))

  const { events, attached } = balanceSumsByDebt()
  const linkedCounts = linkedTransactionCountsByDebt()
  const ZERO = cents(0)

  return rows.map(d => ({
    ...d,
    linkedTransactionCount: linkedCounts.get(d.id) ?? 0,
    currentBalanceCents: toCurrentBalance(
      d.initialBalanceCents as Cents,
      events.get(d.id) ?? ZERO,
      attached.get(d.id) ?? ZERO,
    ),
  }))
})
