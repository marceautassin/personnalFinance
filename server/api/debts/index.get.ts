import { defineEventHandler } from 'h3'
import { asc } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debts } from '~~/server/db/schema'
import { balanceSumsByDebt, toCurrentBalance } from '~~/server/utils/debt-balance'
import type { Debt } from '~~/shared/schemas/debt.schema'

/**
 * Liste des dettes (story 6.1) enrichie du solde courant CALCULÉ (jamais stocké) :
 * `currentBalanceCents = initial + Σavances − Σremboursements`. Tri `created_at` ASC.
 */
export default defineEventHandler(async (): Promise<Debt[]> => {
  const rows = await db.select().from(debts).orderBy(asc(debts.createdAt))

  const { advances, repayments } = balanceSumsByDebt()

  return rows.map(d => ({
    ...d,
    currentBalanceCents: toCurrentBalance(
      d.initialBalanceCents,
      advances.get(d.id) ?? 0,
      repayments.get(d.id) ?? 0,
    ),
  }))
})
