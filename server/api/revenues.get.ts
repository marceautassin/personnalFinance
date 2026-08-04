import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/db/client'
import { revenueModels } from '~~/server/db/schema'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'
import type { RevenueModel } from '~~/shared/schemas/revenue-model.schema'

/**
 * Retourne le singleton `revenue_models` (id=1), normalement toujours présent grâce au seed
 * bootstrap (story 5.3). Si la ligne manque (base réinitialisée à la main, bootstrap non
 * joué), on échoue explicitement : renvoyer `undefined` produirait un 200 à corps vide et
 * une page blanche sans diagnostic côté client.
 */
export default defineEventHandler(async (): Promise<RevenueModel> => {
  const [model] = await db
    .select()
    .from(revenueModels)
    .where(eq(revenueModels.id, 1))
    .limit(1)
  if (!model) throw domainError(ApiErrorCode.SingletonMissing, { table: 'revenue_models' }, 500)
  return model as RevenueModel
})
