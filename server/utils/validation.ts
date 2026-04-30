import { createError, readBody, getQuery, type H3Event } from 'h3'
import type { z } from 'zod'
import { validationError } from './errors'
import { ApiErrorCode } from '~~/shared/schemas/api-errors'

/**
 * Lit et valide le body JSON d'une requête.
 * Lève validationError() si le schéma échoue ou si le body n'est pas un JSON valide.
 */
export async function validateBody<T>(event: H3Event, schema: z.ZodType<T>): Promise<T> {
  let body: unknown
  try {
    body = await readBody(event)
  }
  catch {
    throw createError({
      statusCode: 422,
      statusMessage: ApiErrorCode.ValidationFailed,
      data: { formErrors: ['Request body is not valid JSON'], fieldErrors: {} },
    })
  }
  const result = schema.safeParse(body)
  if (!result.success) {
    throw validationError(result.error)
  }
  return result.data
}

/**
 * Lit et valide la query string d'une requête.
 * Lève validationError() si le schéma échoue.
 */
export function validateQuery<T>(event: H3Event, schema: z.ZodType<T>): T {
  const query = getQuery(event)
  const result = schema.safeParse(query)
  if (!result.success) {
    throw validationError(result.error)
  }
  return result.data
}
