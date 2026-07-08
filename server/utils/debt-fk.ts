import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { debts } from '~~/server/db/schema'
import { domainError } from './errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Pré-check d'existence d'une dette avant de rattacher une transaction (Story 6.3).
 * Miroir de `assertCategoryExists` : transforme une cible inconnue en 422 `validation_failed`.
 */
export async function assertDebtExists(debtId: number): Promise<void> {
  const found = await db
    .select({ id: debts.id })
    .from(debts)
    .where(eq(debts.id, debtId))
    .limit(1)
  if (found.length === 0) {
    throw domainError(
      ApiErrorCode.ValidationFailed,
      { reason: 'unknown debtId', value: debtId },
      422,
    )
  }
}
