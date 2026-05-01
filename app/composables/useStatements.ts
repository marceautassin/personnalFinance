import type { IngestionResult } from '~~/shared/schemas/ingestion-result.schema'

export interface OverlapInfo {
  existingHashes: string[]
  existingPeriods: Array<{ start: string, end: string }>
  newPeriod: { start: string, end: string }
}

export interface UploadOutcome {
  result?: IngestionResult
  overlap?: OverlapInfo
  error?: string
  /** Code stable côté API (ex: `pdf_already_ingested`, `llm_unavailable`) — pour décider du retry côté UI. */
  errorCode?: string
  /** Set quand l'upload a été abandonné via `AbortSignal` (ex: bouton *Annuler*). */
  aborted?: boolean
}

const RETRYABLE_ERROR_CODES = new Set(['llm_unavailable', 'pdf_parse_failed'])
export const isRetryableErrorCode = (code: string | undefined): boolean =>
  code !== undefined && RETRYABLE_ERROR_CODES.has(code)

/**
 * Composable d'upload de relevé PDF vers `/api/statements`.
 * Gère le cas particulier `409 period_overlap` en exposant les métadonnées
 * (consommées par `PeriodOverlapDialog`) sans le mapper vers un message d'erreur.
 */
export function useStatements() {
  const { mapError } = useApiError()
  const invalidate = useInvalidate()

  async function uploadStatement(
    file: File,
    opts: { confirmReplace?: boolean, signal?: AbortSignal } = {},
  ): Promise<UploadOutcome> {
    const form = new FormData()
    form.append('file', file)

    try {
      const result = await $fetch<IngestionResult>('/api/statements', {
        method: 'POST',
        body: form,
        headers: opts.confirmReplace ? { 'X-Confirm-Replace': 'true' } : undefined,
        signal: opts.signal,
      })
      invalidate.invalidateForecast()
      invalidate.invalidateDashboard()
      return { result }
    }
    catch (err) {
      const e = err as {
        name?: string
        statusCode?: number
        statusMessage?: string
        data?: { statusMessage?: string, [k: string]: unknown } & Partial<OverlapInfo>
      }
      if (e.name === 'AbortError' || opts.signal?.aborted) {
        return { aborted: true }
      }
      const code = e.data?.statusMessage ?? e.statusMessage
      if (e.statusCode === 409 && code === 'period_overlap' && e.data) {
        const { existingHashes, existingPeriods, newPeriod } = e.data
        if (existingHashes && existingPeriods && newPeriod) {
          return { overlap: { existingHashes, existingPeriods, newPeriod } }
        }
      }
      return { error: mapError(err), errorCode: code }
    }
  }

  return { uploadStatement }
}
