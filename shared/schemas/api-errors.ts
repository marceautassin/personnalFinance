/**
 * Codes d'erreur API stables (snake_case anglais).
 * Source de vérité pour le mapping côté client (useApiError.mapError).
 *
 * Convention : ajouter un nouveau code ici AVANT de l'utiliser dans un endpoint.
 * Le composable useApiError.ts DOIT être tenu à jour en parallèle (mapping FR).
 */
export const ApiErrorCode = {
  ValidationFailed: 'validation_failed',
  NotFound: 'not_found',
  Unauthorized: 'unauthorized',

  // Domaine — Statements / Ingestion
  PdfAlreadyIngested: 'pdf_already_ingested',
  PdfParseFailed: 'pdf_parse_failed',
  PeriodOverlap: 'period_overlap',
  LlmExtractionFailed: 'llm_extraction_failed',
  LlmUnavailable: 'llm_unavailable',

  // Domaine — Réconciliation
  ReconciliationFailed: 'reconciliation_failed',
} as const

export type ApiErrorCodeValue = (typeof ApiErrorCode)[keyof typeof ApiErrorCode]
