import { createError } from 'h3'
import type { ZodError } from 'zod'
import { ApiErrorCode, type ApiErrorCodeValue } from '~~/shared/schemas/api-errors'

/**
 * Erreur 400 — domaine ou validation simple.
 * Pour les erreurs de schéma Zod, préférer validationError().
 */
export function badRequest(code: ApiErrorCodeValue, data?: Record<string, unknown>) {
  return createError({
    statusCode: 400,
    statusMessage: code,
    data,
  })
}

/**
 * Erreur 422 — validation de payload échouée (forme).
 */
export function validationError(err: ZodError) {
  return createError({
    statusCode: 422,
    statusMessage: ApiErrorCode.ValidationFailed,
    data: err.flatten(),
  })
}

/**
 * Erreur 404 — ressource introuvable.
 */
export function notFound(code: ApiErrorCodeValue = ApiErrorCode.NotFound, data?: Record<string, unknown>) {
  return createError({
    statusCode: 404,
    statusMessage: code,
    data,
  })
}

/**
 * Erreur 401 — non authentifié (placeholder V1, pas d'auth — utile pour le futur).
 */
export function unauthorized(code: ApiErrorCodeValue = ApiErrorCode.Unauthorized, data?: Record<string, unknown>) {
  return createError({
    statusCode: 401,
    statusMessage: code,
    data,
  })
}

/**
 * Erreur métier générique. Par défaut 400, peut être surchargée (502/503 pour intégrations).
 */
export function domainError(
  code: ApiErrorCodeValue,
  data?: Record<string, unknown>,
  statusCode = 400,
) {
  return createError({
    statusCode,
    statusMessage: code,
    data,
  })
}
