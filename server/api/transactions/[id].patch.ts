import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { transactions } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { assertCategoryExists } from '~~/server/utils/category-fk'
import { assertDebtExists } from '~~/server/utils/debt-fk'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { TransactionPatchSchema } from '~~/shared/schemas/transaction.schema'

export default defineEventHandler(async (event) => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const patch = await validateBody(event, TransactionPatchSchema)

  const existing = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1)
  if (existing.length === 0) {
    throw notFound(ApiErrorCode.NotFound, { resource: 'transaction', id })
  }

  if (patch.categoryCode !== undefined) await assertCategoryExists(patch.categoryCode)

  const existingTx = existing[0]!
  const update: Partial<typeof transactions.$inferInsert> = {}
  // `isManual` signifie « catégorie saisie ou CORRIGÉE à la main ». Rattacher une transaction à
  // une dette n'est pas une correction de catégorisation : le flag n'est plus posé que lorsque
  // le patch touche effectivement la catégorie (story 6.8, revue du 2026-09-04).
  if (patch.categoryCode !== undefined) {
    update.categoryCode = patch.categoryCode
    update.isManual = true
  }

  // Marquage remboursement de dette (Story 6.3) : ne touche les colonnes dette QUE si le
  // patch les vise (`isDebtRepayment` et/ou `debtId`), pour ne pas parasiter un simple
  // changement de catégorie.
  const touchesDebt = patch.isDebtRepayment !== undefined || patch.debtId !== undefined
  if (touchesDebt) {
    const willRepay = patch.isDebtRepayment ?? existingTx.isDebtRepayment
    if (willRepay) {
      const debtId = patch.debtId !== undefined ? patch.debtId : existingTx.debtId
      if (debtId == null) {
        throw domainError(ApiErrorCode.ValidationFailed, { reason: 'debtId required to mark repayment' }, 422)
      }
      await assertDebtExists(debtId)
      // Une transaction ENTRANTE peut être rattachée à une dette depuis la story 6.5 (D16) :
      // c'est la condition d'un compte-courant conjoint, où un règlement reçu diminue le solde
      // (FR66/FR67). La garde `amountCents >= 0` bloquait ce cas.
      //
      // FR9 reste vrai pour ce qu'il dit : seule une SORTIE est un « remboursement ». Une
      // entrée rattachée est un mouvement de sens inverse, pas un remboursement — d'où le
      // rejet d'un montant nul, qui n'est ni l'un ni l'autre.
      if (existingTx.amountCents === 0) {
        throw domainError(ApiErrorCode.ValidationFailed, { reason: 'a zero-amount transaction cannot be attached to a debt' }, 422)
      }
      update.isDebtRepayment = true
      update.debtId = debtId
    }
    else {
      // Démarquage : délie la dette pour ne pas laisser de lien pendant.
      update.isDebtRepayment = false
      update.debtId = null
    }
  }

  await db.update(transactions).set(update).where(eq(transactions.id, id))

  const [updated] = await db
    .select({
      id: transactions.id,
      statementHash: transactions.statementHash,
      transactionDate: transactions.transactionDate,
      label: transactions.label,
      amountCents: transactions.amountCents,
      categoryCode: transactions.categoryCode,
      isManual: transactions.isManual,
      isDebtRepayment: transactions.isDebtRepayment,
      debtId: transactions.debtId,
    })
    .from(transactions)
    .where(eq(transactions.id, id))
  return updated
})
