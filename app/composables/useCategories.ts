import type { CategoryGroupWithItems, CategoryItemWithCount } from '~~/shared/schemas/category.schema'

export type { CategoryGroupWithItems, CategoryItemWithCount }

/**
 * Référentiel complet — rubriques et postes. Partagé via la `key` constante du `useFetch`,
 * que Nuxt déduplique entre composants.
 */
export function useCategories() {
  return useFetch<CategoryGroupWithItems[]>('/api/categories', {
    key: 'categories',
    default: () => [],
    server: false,
  })
}

/**
 * Vue à plat des postes, rubrique comprise — la forme dont a besoin un sélecteur de poste.
 *
 * Le libellé seul ne suffit pas à désigner un poste : « Restaurant » existe sous Alimentation
 * et sous Voyages (FR19). Tout affichage d'un poste hors de son arbre doit donc porter sa
 * rubrique, sinon l'utilisateur choisit à l'aveugle entre deux entrées identiques.
 */
export interface FlatCategoryItem extends CategoryItemWithCount {
  groupLabel: string
}

export function flattenReferential(groups: CategoryGroupWithItems[]): FlatCategoryItem[] {
  return groups.flatMap(g => g.items.map(i => ({ ...i, groupLabel: g.label })))
}
