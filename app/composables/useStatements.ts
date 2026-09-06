import type { IngestionResult } from '~~/shared/schemas/ingestion-result.schema'
import type { StatementReliability } from '~~/shared/types/statement-reliability'
import type { Ratio } from '~~/shared/types/ratio'

export interface StatementListItem {
  hash: string
  periodStart: string
  periodEnd: string
  reliability: StatementReliability
  ingestedAt: number
  transactionCount: number
  manualCount: number
  /** `null` sur un relevé sans transaction : le taux n'est pas défini, il n'est pas nul. */
  correctionRate: Ratio | null
  /** Écart courant, recalculé à la lecture — jamais stocké. */
  gapCents: number
}

export interface StatementsListResponse {
  statements: StatementListItem[]
}

const EMPTY_STATEMENTS_LIST: StatementsListResponse = { statements: [] }

/**
 * Liste de tous les relevés ingérés (story 3.3) — `key` constante pour partage du cache.
 */
export function useStatementsList() {
  return useFetch<StatementsListResponse>('/api/statements', {
    key: 'statements-list',
    default: () => EMPTY_STATEMENTS_LIST,
    server: false,
  })
}

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
      // Story 17.7 : PLUS d'invalidation globale par fichier. Sur un dépôt d'historique de
      // vingt-quatre relevés, elle déclenchait vingt-quatre rechargements complets de toutes
      // les vues montées — pour un état intermédiaire que personne ne regarde. L'appelant
      // invalide une fois, quand la file est vide (`useIngestionQueue.drain`).
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
