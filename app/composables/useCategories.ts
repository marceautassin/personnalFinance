import type { CategoryListItem } from '~~/server/api/categories.get'

/**
 * Référentiel des catégories — partagé via la `key` constante du useFetch (cache Nuxt
 * dédupliquera entre composants). Refresh manuel via la valeur retournée si besoin.
 */
export function useCategories() {
  return useFetch<CategoryListItem[]>('/api/categories', {
    key: 'categories',
    default: () => [],
    server: false,
  })
}
