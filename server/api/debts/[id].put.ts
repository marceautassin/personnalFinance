import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import type { Cents } from '~~/shared/types/money'
import { debts } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { domainError, notFound } from '~~/server/utils/errors'
import { currentBalanceForDebt, linkedTransactionCountForDebt } from '~~/server/utils/debt-balance'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { DebtPutSchema, type Debt } from '~~/shared/schemas/debt.schema'

/**
 * Remplace une dette (story 6.1, sémantique PUT : replace complet ; `id`/`createdAt`
 * immuables). Autorise le changement de mode (FR30) — la validation croisée mode ↔ champs
 * est réappliquée par le schéma. `id` non entier positif → 422 ; `id` inexistant → 404.
 */
export default defineEventHandler(async (event): Promise<Debt> => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const body = await validateBody(event, DebtPutSchema)

  const existing = db.select({ id: debts.id }).from(debts).where(eq(debts.id, id)).limit(1).get()
  if (!existing) throw notFound(ApiErrorCode.NotFound, { resource: 'debt', id })

  const updated = db
    .update(debts)
    .set({
      creditor: body.creditor,
      initialBalanceCents: body.initialBalanceCents,
      repaymentMode: body.repaymentMode,
      monthlyAmountCents: body.monthlyAmountCents ?? null,
      lumpSumDate: body.lumpSumDate ?? null,
    })
    .where(eq(debts.id, id))
    .returning()
    .get()

  return {
    ...updated,
    linkedTransactionCount: linkedTransactionCountForDebt(id),
    currentBalanceCents: currentBalanceForDebt(id, updated.initialBalanceCents as Cents),
  }
})
