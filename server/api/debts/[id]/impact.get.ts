import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debts } from '~~/server/db/schema'
import { domainError, notFound } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import { currentBalanceForDebt } from '~~/server/utils/debt-balance'
import { projectDebt } from '~~/server/services/debt-projection'
import type { Cents } from '~~/shared/types/money'

export interface DebtImpact {
  debtId: number
  /** Dépense projetée cumulée par horizon (6/12/24 mois), en cents. Entrée du dividende requis (Epic 7). */
  horizonsCents: { 6: Cents, 12: Cents, 24: Cents }
}

/** Mois courant `YYYY-MM` (ancre temporelle ; la projection elle-même est pure). */
function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Impact d'une dette (story 6.4, FR34 partiel) : dépense projetée cumulée sur 6/12/24 mois,
 * selon le mode de remboursement et le SOLDE COURANT (calcul story 6.1). C'est l'entrée du
 * calcul de dividende — la conversion en dividende net exact arrive avec l'Epic 7.
 * `id` non entier positif → 422 ; dette inexistante → 404.
 */
export default defineEventHandler(async (event): Promise<DebtImpact> => {
  const idParam = getRouterParam(event, 'id')
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'invalid id', value: idParam }, 422)
  }

  const debt = db.select().from(debts).where(eq(debts.id, id)).limit(1).get()
  if (!debt) throw notFound(ApiErrorCode.NotFound, { resource: 'debt', id })

  const projectionInput = {
    currentBalanceCents: currentBalanceForDebt(id, debt.initialBalanceCents) as Cents,
    repaymentMode: debt.repaymentMode,
    monthlyAmountCents: debt.monthlyAmountCents as Cents | null,
    lumpSumDate: debt.lumpSumDate,
  }
  // Une seule projection à l'horizon max : les horizons courts sont des sommes préfixes
  // (l'horizon 24 est un sur-ensemble de 6 et 12) — évite 3 projections redondantes.
  const series = projectDebt(projectionInput, currentMonth(), 24)
  const cumulativeCents = (months: number): Cents =>
    series.slice(0, months).reduce((sum, o) => sum + o.amountCents, 0) as Cents

  return {
    debtId: id,
    horizonsCents: { 6: cumulativeCents(6), 12: cumulativeCents(12), 24: cumulativeCents(24) },
  }
})
