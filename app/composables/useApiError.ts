import { ApiErrorCode, type ApiErrorCodeValue } from '~~/shared/schemas/api-errors'

/**
 * Mapping code stable → message FR utilisateur.
 * Source de vérité côté client. Maintenir en cohérence avec ApiErrorCode.
 */
const FR_MESSAGES: Record<ApiErrorCodeValue, string> = {
  [ApiErrorCode.ValidationFailed]: 'Les données saisies sont invalides. Vérifie les champs en erreur.',
  [ApiErrorCode.NotFound]: 'Ressource introuvable.',
  [ApiErrorCode.Unauthorized]: 'Tu n\'es pas autorisé à effectuer cette action.',
  [ApiErrorCode.PdfAlreadyIngested]: 'Ce relevé a déjà été ingéré. Si c\'est une mise à jour, supprime l\'ancien d\'abord.',
  [ApiErrorCode.PdfParseFailed]: 'L\'analyse du PDF a échoué. Vérifie qu\'il s\'agit bien d\'un relevé Boursorama valide.',
  [ApiErrorCode.PeriodOverlap]: 'La période de ce relevé chevauche un relevé déjà ingéré. Confirme le remplacement pour continuer.',
  [ApiErrorCode.LlmExtractionFailed]: 'L\'analyse automatique du relevé a échoué. Réessaie ou ajoute les transactions manuellement.',
  [ApiErrorCode.LlmUnavailable]: 'Le service de catégorisation est indisponible. Réessaie dans quelques instants.',
  [ApiErrorCode.ReconciliationFailed]: 'Les transactions extraites ne correspondent pas au solde du relevé. Une vérification manuelle est nécessaire.',
}

const FALLBACK_MESSAGE = 'Une erreur est survenue. Réessaie ou recharge la page.'

/**
 * Composable de mapping erreur API → message utilisateur FR.
 * Accepte n'importe quelle erreur Nuxt/Fetch, extrait `statusMessage`, retourne FR.
 */
export function useApiError() {
  function mapError(err: unknown): string {
    if (!err || typeof err !== 'object') return FALLBACK_MESSAGE

    // Pour les FetchError ofetch/Nuxt, err.statusMessage = phrase HTTP ("Bad Request")
    // et le code domaine est dans err.data.statusMessage. On lit data en priorité.
    const e = err as { statusMessage?: unknown, data?: { statusMessage?: unknown } }
    const code = e.data?.statusMessage ?? e.statusMessage
    if (typeof code !== 'string') return FALLBACK_MESSAGE
    if (!Object.hasOwn(FR_MESSAGES, code)) return FALLBACK_MESSAGE

    return FR_MESSAGES[code as ApiErrorCodeValue]
  }

  return { mapError }
}
