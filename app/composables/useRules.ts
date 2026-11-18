import type {
  ClassificationRuleWithLabels,
  NewClassificationRuleInput,
} from '~~/shared/schemas/classification-rule.schema'
import type { MutationOutcome } from './useApiError'
import type { RuleApplyResult } from '~~/server/api/rules/[id]/apply.post'
import { useInvalidate } from './useInvalidate'

export type { ClassificationRuleWithLabels }

/**
 * Règles de classement déterministes — lecture et mutations.
 *
 * Les règles s'appliquent à l'ingestion. Depuis la story 18.2, l'utilisateur peut en outre
 * demander l'application d'une règle à l'historique déjà en base — c'est la seule opération de
 * ce composable qui déplace des transactions, et donc la seule dont l'effet dépasse la liste.
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

  /**
   * Crée une règle et rend la règle créée.
   *
   * Le retour porte la règle, et pas seulement un `ok` : l'appelant a besoin de son `id` pour
   * enchaîner sur l'application à l'historique sans repasser par la liste (story 18.2).
   */
  async function addRule(
    input: NewClassificationRuleInput,
  ): Promise<MutationOutcome & { rule?: ClassificationRuleWithLabels }> {
    let rule: ClassificationRuleWithLabels
    try {
      rule = await apiMutate<ClassificationRuleWithLabels>('/api/rules', { method: 'POST', body: input })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await fetchState.refresh()
    await invalidateAnalysis()
    return { ok: true, rule }
  }

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

  /**
   * Applique une règle aux transactions déjà en base (story 18.2).
   *
   * Rend le rapport plutôt qu'un simple `ok` : l'utilisateur doit savoir combien de lignes ont
   * bougé, et combien sont restées parce qu'il les avait corrigées à la main.
   */
  async function applyRuleToHistory(
    id: number,
  ): Promise<{ ok: true, result: RuleApplyResult } | MutationOutcome> {
    let result: RuleApplyResult
    try {
      result = await apiMutate<RuleApplyResult>(`/api/rules/${id}/apply`, { method: 'POST' })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await fetchState.refresh()
    await invalidateAnalysis()
    return { ok: true, result }
  }

  return {
    data: fetchState.data,
    pending: fetchState.pending,
    error: fetchState.error,
    refresh: fetchState.refresh,
    addRule,
    previewRule,
    deleteRule,
    applyRuleToHistory,
  }
}
