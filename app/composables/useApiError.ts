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
  [ApiErrorCode.CategoryInUse]: 'Catégorie encore utilisée — supprime les références d\'abord.',
  [ApiErrorCode.CategoryProtected]: 'Catégorie système, ne peut pas être supprimée.',
  [ApiErrorCode.CategoryLabelTaken]: 'Ce libellé est déjà utilisé par une autre catégorie.',
  [ApiErrorCode.CategoriesNotSeeded]: 'Aucune catégorie en base : relance l\'application pour rejouer l\'initialisation.',
  [ApiErrorCode.SingletonMissing]: 'Données de configuration absentes en base. Relance l\'application pour rejouer l\'initialisation.',
  [ApiErrorCode.UnemploymentEndDateRequired]: 'Renseigne la date de fin de droits : sans elle, le montant d\'ARE serait ignoré par le forecast.',
  [ApiErrorCode.UnemploymentEndDatePast]: 'La date de fin de droits est déjà passée : l\'ARE ne serait comptée sur aucun mois du forecast.',
}

const FALLBACK_MESSAGE = 'Une erreur est survenue. Réessaie ou recharge la page.'

/**
 * Résultat d'une mutation composable : `ok` en succès, sinon `error` (message FR utilisateur)
 * + `errorCode` (code stable API, pour réagir au code côté appelant). Forme partagée par tous
 * les composables de mutation — voir `mapMutationError`.
 */
export interface MutationOutcome {
  ok?: true
  error?: string
  errorCode?: string
}

/** Pluriel FR simple : `1 transaction` / `3 transactions`. */
function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`
}

/**
 * Message détaillé du 409 `category_in_use` à partir des compteurs renvoyés par l'API
 * (story 5.6 AC#14 : « Catégorie utilisée par X transactions, Y charges fixes »). Le mapping
 * statique ne mentionnait ni les chiffres, ni les ajustements mensuels — l'utilisateur
 * cherchait des transactions inexistantes (revue 2026-08-04).
 */
function categoryInUseMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const parts = [
    [d.transactionCount, 'transaction', 'transactions'],
    [d.fixedChargeCount, 'charge fixe', 'charges fixes'],
    [d.monthlyOverrideCount, 'ajustement mensuel', 'ajustements mensuels'],
  ] as const
  const listed = parts
    .filter(([n]) => typeof n === 'number' && n > 0)
    .map(([n, s, p]) => plural(n as number, s, p))
  if (listed.length === 0) return null
  return `Catégorie utilisée par ${listed.join(', ')} — supprime les références d'abord.`
}

/**
 * Composable de mapping erreur API → message utilisateur FR.
 * Accepte n'importe quelle erreur Nuxt/Fetch, extrait `statusMessage`, retourne FR.
 */
export function useApiError() {
  function mapError(err: unknown): string {
    if (!err || typeof err !== 'object') return FALLBACK_MESSAGE

    // Pour les FetchError ofetch/Nuxt, err.statusMessage = phrase HTTP ("Bad Request")
    // et le code domaine est dans err.data.statusMessage. On lit data en priorité.
    const e = err as {
      statusMessage?: unknown
      data?: { statusMessage?: unknown, data?: unknown }
    }
    const code = e.data?.statusMessage ?? e.statusMessage
    if (typeof code !== 'string') return FALLBACK_MESSAGE
    if (!Object.hasOwn(FR_MESSAGES, code)) return FALLBACK_MESSAGE

    if (code === ApiErrorCode.CategoryInUse) {
      const detailed = categoryInUseMessage(e.data?.data)
      if (detailed) return detailed
    }

    return FR_MESSAGES[code as ApiErrorCodeValue]
  }

  /**
   * Variante pour les mutations : message FR utilisateur + code stable (pour réagir au
   * code côté appelant). Centralise l'extraction dupliquée dans les composables de mutation.
   */
  function mapMutationError(err: unknown): { error: string, errorCode?: string } {
    const e = err as { statusMessage?: string, data?: { statusMessage?: string } }
    return { error: mapError(err), errorCode: e.data?.statusMessage ?? e.statusMessage }
  }

  return { mapError, mapMutationError }
}
