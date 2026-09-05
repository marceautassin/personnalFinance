import type {
  ClassificationRuleWithLabels,
  NewClassificationRuleInput,
} from '~~/shared/schemas/classification-rule.schema'
import type { MutationOutcome } from './useApiError'
import { useInvalidate } from './useInvalidate'

export type { ClassificationRuleWithLabels }

/**
 * Règles de classement déterministes — lecture et mutations.
 *
 * Les règles ne reclassent PAS l'existant : elles s'appliquent à l'ingestion. Une mutation
 * n'a donc rien à invalider côté analyse, seulement la liste elle-même.
 */
export function useRules() {
  const fetchState = useFetch<ClassificationRuleWithLabels[]>('/api/rules', {
    key: 'rules',
    default: () => [],
    server: false,
  })

  const { mapMutationError } = useApiError()
  const { invalidateAnalysis } = useInvalidate()

  async function mutate(url: string, options: Parameters<typeof apiMutate>[1]): Promise<MutationOutcome> {
    try {
      await apiMutate(url, options)
    }
    catch (err) {
      return mapMutationError(err)
    }
    await fetchState.refresh()
    await invalidateAnalysis()
    return { ok: true }
  }

  const addRule = (input: NewClassificationRuleInput) =>
    mutate('/api/rules', { method: 'POST', body: input })

  /**
   * Portée qu'aurait une règle, AVANT de la créer.
   *
   * Sans cet aperçu, une proposition se créait en un clic sans montrer combien de lignes elle
   * allait rafler : le compteur n'apparaissait que sur `/regles`, donc après coup.
   */
  async function previewRule(pattern: string): Promise<number | null> {
    if (pattern.trim().length < 2) return null
    try {
      const res = await $fetch<{ matchCount: number }>('/api/rules/preview', { query: { pattern } })
      return res.matchCount
    }
    catch {
      // L'aperçu est une aide, pas un prérequis : son échec ne doit pas empêcher de créer
      // une règle. On rend `null`, que l'appelant affiche comme « portée inconnue ».
      return null
    }
  }

  const deleteRule = (id: number) =>
    mutate(`/api/rules/${id}`, { method: 'DELETE' })

  return {
    data: fetchState.data,
    pending: fetchState.pending,
    error: fetchState.error,
    refresh: fetchState.refresh,
    addRule,
    previewRule,
    deleteRule,
  }
}
