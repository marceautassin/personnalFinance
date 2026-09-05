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

  const deleteRule = (id: number) =>
    mutate(`/api/rules/${id}`, { method: 'DELETE' })

  return {
    data: fetchState.data,
    pending: fetchState.pending,
    error: fetchState.error,
    refresh: fetchState.refresh,
    addRule,
    deleteRule,
  }
}
