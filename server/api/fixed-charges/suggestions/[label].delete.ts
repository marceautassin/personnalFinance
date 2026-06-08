import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { db } from '~~/server/db/client'
import { dismissedSuggestions } from '~~/server/db/schema'
import { normalizeLabel } from '~~/server/services/charge-suggester'
import { domainError } from '~~/server/utils/errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Rejette une suggestion : upsert idempotent du libellé normalisé dans
 * `dismissed_suggestions` → 204. Re-normalise le param (idempotent sur une entrée
 * déjà normalisée) pour garantir la correspondance avec les clés du suggester.
 */
export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'label')
  const normalizedLabel = normalizeLabel(decodeURIComponent(raw ?? ''))
  if (normalizedLabel.length === 0) {
    throw domainError(ApiErrorCode.ValidationFailed, { reason: 'empty normalizedLabel', value: raw }, 422)
  }

  await db
    .insert(dismissedSuggestions)
    .values({ normalizedLabel })
    .onConflictDoNothing({ target: dismissedSuggestions.normalizedLabel })

  setResponseStatus(event, 204)
  return null
})
