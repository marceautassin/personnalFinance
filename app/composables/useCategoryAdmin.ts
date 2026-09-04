import type { CategoryGroupWithItems } from './useCategories'
import type {
  NewCategoryGroupInput,
  NewCategoryItemInput,
  CategoryItemPatch,
} from '~~/shared/schemas/category.schema'
import type { MutationOutcome } from './useApiError'
import { useInvalidate } from './useInvalidate'

/**
 * Administration du référentiel — lecture + CRUD rubriques et postes + invalidations.
 *
 * Partage la `key` 'categories' avec `useCategories`, pour que le sélecteur de poste voie
 * immédiatement une rubrique ou un poste créé. Pas de `$fetch` dans les composants.
 *
 * Les libellés apparaissent aussi dans les vues d'analyse : une mutation doit les invalider,
 * sinon un renommage n'apparaît qu'après rechargement complet (revue 2026-08-04).
 */
export function useCategoryAdmin() {
  const fetchState = useFetch<CategoryGroupWithItems[]>('/api/categories', {
    key: 'categories',
    default: () => [],
    server: false,
  })

  const { mapMutationError } = useApiError()
  const { invalidateAnalysis } = useInvalidate()

  /**
   * Refetch le référentiel, puis les vues qui en affichent les libellés.
   *
   * ⚠️ `fetchState.refresh()` et NON `refreshNuxtData('categories')`. Le second dépend du
   * contexte Nuxt ambiant, perdu ici : ces fonctions sont appelées APRÈS un `await`, depuis
   * un gestionnaire d'événement. Constaté à la recette du 2026-09-04 — sur le chemin « blur
   * vers un autre élément », le `PATCH` partait, aucun `GET` ne suivait, et l'écran affichait
   * l'ancien libellé pendant que la base portait le nouveau. Divergence silencieuse :
   * l'utilisateur croyait son renommage abandonné alors qu'il était enregistré.
   */
  async function refreshList() {
    await fetchState.refresh()
    await invalidateAnalysis()
  }

  /** Enveloppe commune : appel, mapping d'erreur, refetch. Six mutations, une seule forme. */
  async function mutate(url: string, options: Parameters<typeof apiMutate>[1]): Promise<MutationOutcome> {
    try {
      await apiMutate(url, options)
    }
    catch (err) {
      return mapMutationError(err)
    }
    await refreshList()
    return { ok: true }
  }

  const groupUrl = (code: string) => `/api/categories/groups/${encodeURIComponent(code)}`
  const itemUrl = (code: string) => `/api/categories/items/${encodeURIComponent(code)}`

  const addGroup = (input: NewCategoryGroupInput) =>
    mutate('/api/categories/groups', { method: 'POST', body: input })

  const renameGroup = (code: string, label: string) =>
    mutate(groupUrl(code), { method: 'PATCH', body: { label } })

  const deleteGroup = (code: string) =>
    mutate(groupUrl(code), { method: 'DELETE' })

  const addItem = (input: NewCategoryItemInput) =>
    mutate('/api/categories/items', { method: 'POST', body: input })

  const updateItem = (code: string, patch: CategoryItemPatch) =>
    mutate(itemUrl(code), { method: 'PATCH', body: patch })

  const deleteItem = (code: string) =>
    mutate(itemUrl(code), { method: 'DELETE' })

  return {
    data: fetchState.data,
    pending: fetchState.pending,
    error: fetchState.error,
    refresh: fetchState.refresh,
    addGroup,
    renameGroup,
    deleteGroup,
    addItem,
    updateItem,
    deleteItem,
  }
}
