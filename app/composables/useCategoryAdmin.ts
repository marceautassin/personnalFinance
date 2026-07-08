import type { CategoryListItem } from '~~/server/api/categories/index.get'
import type { NewCategoryInput } from '~~/shared/schemas/category.schema'
import type { MutationOutcome } from './useApiError'

/**
 * Administration des catégories (Story 5.6) — lecture + create/rename/delete + invalidations.
 * Partage la `key` 'categories' avec `useCategories` (le `CategoryEditor` story 2.10 voit les
 * changements). Pas de `$fetch` dans les composants ; chaque mutation refetch la liste.
 */
export function useCategoryAdmin() {
  const fetchState = useFetch<CategoryListItem[]>('/api/categories', {
    key: 'categories',
    default: () => [],
    server: false,
  })

  const { mapMutationError } = useApiError()

  async function refreshList() {
    await refreshNuxtData('categories')
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
