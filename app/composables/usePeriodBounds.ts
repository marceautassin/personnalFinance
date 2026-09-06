/**
 * Bornes de l'historique — première et dernière date portant une transaction.
 *
 * **Un seul endroit, parce que la clé est partagée.** `useFetch` met en cache par clé et
 * compare les options des appelants : trois composables qui déclaraient `key: 'periods'` avec
 * des `default` différents faisaient sortir Nuxt en avertissement, et laissaient planer le
 * doute sur celui qui gagnait (recette du 2026-09-06). La clé, le type et la valeur par défaut
 * appartiennent donc à cette fonction, et à elle seule.
 */
export function usePeriodBounds() {
  return useFetch<{ firstDate: string | null, lastDate: string | null }>('/api/periods', {
    key: 'periods',
    server: false,
    default: () => ({ firstDate: null, lastDate: null }),
  })
}
