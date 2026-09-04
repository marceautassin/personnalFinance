import type { CategoryListItem } from './useCategories'
import type { NewCategoryInput } from '~~/shared/schemas/category.schema'
import type { MutationOutcome } from './useApiError'
import { useInvalidate } from './useInvalidate'

/**
 * Administration des catégories (Story 5.6) — lecture + create/rename/delete + invalidations.
 * Partage la `key` 'categories' avec `useCategories` (le `CategoryEditor` story 2.10 voit les
 * changements). Pas de `$fetch` dans les composants ; chaque mutation refetch la liste.
 *
 * Les libellés de catégorie apparaissent aussi dans le dashboard et le forecast : une mutation
 * doit les invalider, sinon un renommage n'apparaît qu'après rechargement complet de la page
 * (revue 2026-08-04).
 */
export function useCategoryAdmin() {
  const fetchState = useFetch<CategoryListItem[]>('/api/categories', {
    key: 'categories',
    default: () => [],
    server: false,
  })

  const { mapMutationError } = useApiError()
  const { invalidateAnalysis } = useInvalidate()

  /**
   * Refetch la liste, puis les vues qui affichent des libellés de catégorie.
   *
   * ⚠️ `fetchState.refresh()` et NON `refreshNuxtData('categories')`. Le second dépend du
   * contexte Nuxt ambiant, qui est perdu ici : ces fonctions sont appelées APRÈS un `await`,
   * depuis un gestionnaire d'événement du composant. Constaté à la recette du 2026-09-04 —
   * sur le chemin « blur vers un autre élément », le `PATCH` partait, aucun `GET` ne suivait,
   * et l'écran continuait d'afficher l'ancien libellé pendant que la base portait le nouveau.
   * Divergence silencieuse : l'utilisateur croyait son renommage abandonné alors qu'il était
   * enregistré. `fetchState.refresh()` s'appuie sur l'instance capturée et ne peut pas rater.
   */
  async function refreshList() {
    await fetchState.refresh()
    await invalidateAnalysis()
  }

  async function addCategory(input: NewCategoryInput): Promise<MutationOutcome> {
    try {
      await apiMutate('/api/categories', { method: 'POST', body: input })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await refreshList()
    return { ok: true }
  }

  async function updateCategory(code: string, label: string): Promise<MutationOutcome> {
    try {
      await apiMutate(`/api/categories/${encodeURIComponent(code)}`, { method: 'PATCH', body: { label } })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await refreshList()
    return { ok: true }
  }

  async function deleteCategory(code: string): Promise<MutationOutcome> {
    try {
      await apiMutate(`/api/categories/${encodeURIComponent(code)}`, { method: 'DELETE' })
    }
    catch (err) {
      return mapMutationError(err)
    }
    await refreshList()
    return { ok: true }
  }

  return {
    data: fetchState.data,
    pending: fetchState.pending,
    error: fetchState.error,
    refresh: fetchState.refresh,
    addCategory,
    updateCategory,
    deleteCategory,
  }
}
