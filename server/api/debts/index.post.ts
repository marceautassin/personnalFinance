import { defineEventHandler, setResponseStatus } from 'h3'
import { db } from '~~/server/db/client'
import { debts } from '~~/server/db/schema'
import { validateBody } from '~~/server/utils/validation'
import { NewDebtSchema, type Debt } from '~~/shared/schemas/debt.schema'

/**
 * Crée une dette (story 6.1). Validation de cohérence mode ↔ champs par le schéma Zod
 * (422 `validation_failed`). Retour 201 : `currentBalanceCents = initialBalanceCents`
 * (aucune avance ni remboursement à la création).
 */
export default defineEventHandler(async (event): Promise<Debt> => {
  const body = await validateBody(event, NewDebtSchema)

  const created = db
    .insert(debts)
    .values({
      creditor: body.creditor,
      initialBalanceCents: body.initialBalanceCents,
      repaymentMode: body.repaymentMode,
      monthlyAmountCents: body.monthlyAmountCents ?? null,
      lumpSumDate: body.lumpSumDate ?? null,
    })
    .returning()
    .get()

  setResponseStatus(event, 201)
  return { ...created, currentBalanceCents: created.initialBalanceCents }
})
