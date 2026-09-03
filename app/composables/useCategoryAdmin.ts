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
  const { invalidateForecast, invalidateDashboard } = useInvalidate()

  /** Refetch la liste, puis les vues qui affichent des libellés de catégorie. */
  async function refreshList() {
    await refreshNuxtData('categories')
    await Promise.all([invalidateForecast(), invalidateDashboard()])
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
