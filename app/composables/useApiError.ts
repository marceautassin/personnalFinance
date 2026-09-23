import { ApiErrorCode, type ApiErrorCodeValue } from '~~/shared/schemas/api-errors'
import { BANK_LABELS, BANKS, type Bank } from '~~/shared/types/bank'

/**
 * Mapping code stable → message FR utilisateur.
 * Source de vérité côté client. Maintenir en cohérence avec ApiErrorCode.
 */
const FR_MESSAGES: Record<ApiErrorCodeValue, string> = {
  [ApiErrorCode.ValidationFailed]: 'Les données saisies sont invalides. Vérifie les champs en erreur.',
  [ApiErrorCode.NotFound]: 'Ressource introuvable.',
  [ApiErrorCode.Unauthorized]: 'Tu n\'es pas autorisé à effectuer cette action.',
  [ApiErrorCode.PdfAlreadyIngested]: 'Ce relevé a déjà été ingéré. Si c\'est une mise à jour, supprime l\'ancien d\'abord.',
  [ApiErrorCode.PdfParseFailed]: 'L\'analyse du PDF a échoué. Vérifie qu\'il s\'agit bien d\'un relevé valide pour la banque sélectionnée.',
  [ApiErrorCode.PeriodOverlap]: 'La période de ce relevé chevauche un relevé déjà ingéré. Confirme le remplacement pour continuer.',
  [ApiErrorCode.BankMismatch]: 'Ce relevé ne correspond pas à la banque sélectionnée.',
  [ApiErrorCode.LlmExtractionFailed]: 'L\'analyse automatique du relevé a échoué. Réessaie ou ajoute les transactions manuellement.',
  [ApiErrorCode.LlmUnavailable]: 'Le service de catégorisation est indisponible. Réessaie dans quelques instants.',
  [ApiErrorCode.LlmConfigError]: 'Accès au fournisseur refusé : vérifiez la clé MISTRAL_API_KEY dans .env. Réessayer n\'y changera rien.',
  [ApiErrorCode.ReconciliationFailed]: 'Les transactions extraites ne correspondent pas au solde du relevé. Une vérification manuelle est nécessaire.',
  [ApiErrorCode.CategoryInUse]: 'Poste encore utilisé par des transactions — reclasse-les d\'abord.',
  [ApiErrorCode.CategoryProtected]: 'Élément système : il ne peut être ni supprimé, ni réorienté.',
  [ApiErrorCode.CategoryLabelTaken]: 'Ce libellé est déjà utilisé dans cette rubrique.',
  [ApiErrorCode.CategoriesNotSeeded]: 'Référentiel absent en base : relance l\'application pour rejouer l\'initialisation.',
  [ApiErrorCode.GroupNotEmpty]: 'Rubrique encore peuplée — supprime ou déplace ses postes d\'abord.',
  [ApiErrorCode.GroupNotFound]: 'Rubrique introuvable.',
  [ApiErrorCode.RuleAlreadyExists]: 'Une règle existe déjà pour ce motif.',
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
 * Message détaillé du 409 `category_in_use` à partir du compteur renvoyé par l'API. Le mapping
 * statique ne mentionnait aucun chiffre — l'utilisateur ne savait pas combien de transactions
 * reclasser, ni si le blocage venait d'une ou de deux cents lignes (revue 2026-08-04).
 */
function categoryInUseMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const count = (data as Record<string, unknown>).transactionCount
  if (typeof count !== 'number' || count === 0) return null
  return `Poste utilisé par ${plural(count, 'transaction', 'transactions')} — reclasse-les d'abord.`
}

/** Message détaillé du 409 `group_not_empty` : combien de postes bloquent la suppression. */
function groupNotEmptyMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const count = (data as Record<string, unknown>).itemCount
  if (typeof count !== 'number' || count === 0) return null
  return `Rubrique contenant ${plural(count, 'poste', 'postes')} — supprime-les ou déplace-les d'abord.`
}

/**
 * Message détaillé du 400 `bank_mismatch` : nomme la banque reconnue par le contenu du PDF
 * (`data.detected`), ou dit qu'aucune banque n'a été reconnue. Sans ce détail, l'utilisateur
 * ne sait pas quelle banque choisir pour redéposer le même fichier.
 */
function bankMismatchMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const detected = (data as Record<string, unknown>).detected
  if (detected === null) return 'Ce relevé ne correspond pas à la banque sélectionnée, et sa banque n\'a pas pu être reconnue.'
  if (typeof detected !== 'string' || !(BANKS as readonly string[]).includes(detected)) return null
  return `Ce relevé semble être un relevé ${BANK_LABELS[detected as Bank]} — sélectionne cette banque et redépose le fichier.`
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
    if (code === ApiErrorCode.GroupNotEmpty) {
      const detailed = groupNotEmptyMessage(e.data?.data)
      if (detailed) return detailed
    }
    if (code === ApiErrorCode.BankMismatch) {
      const detailed = bankMismatchMessage(e.data?.data)
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
