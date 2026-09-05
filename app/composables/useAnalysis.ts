import type { AnalysisResponse } from '~~/server/api/analysis.get'
import type { Granularity } from '~~/shared/types/granularity'
import { bucketBounds, shiftBucket, bucketLabel, bucketOf } from '~~/shared/types/granularity'

export type { AnalysisResponse }

/**
 * État de la période analysée + chargement de l'agrégat.
 *
 * La tranche (`bucket`) est l'unité que l'utilisateur manipule ; les bornes en sont dérivées.
 * L'API, elle, reçoit des bornes explicites et une granularité (AR9) : le périmètre et le
 * découpage restent deux notions distinctes, ce qui laissera la porte ouverte à une plage
 * libre sans rien casser.
 */
export function useAnalysis(initialBucket?: string, initialGranularity: Granularity = 'month') {
  const granularity = ref<Granularity>(initialGranularity)

  // Repli provisoire sur le mois courant : remplacé dès que l'on sait où s'arrête l'historique.
  const bucket = ref(initialBucket ?? bucketOf(new Date().toISOString().slice(0, 10), initialGranularity))

  /**
   * Sans période explicite dans l'URL, on ouvre sur la DERNIÈRE période qui contient quelque
   * chose. Se caler sur le mois courant ouvrait l'application sur un écran vide dès que
   * l'historique avait un mois de retard — ce qui est le cas normal, un relevé arrivant en fin
   * de mois (recette du 2026-09-05).
   */
  if (!initialBucket) {
    const periods = useFetch<{ lastDate: string | null }>('/api/periods', {
      key: 'periods',
      server: false,
      default: () => ({ lastDate: null }),
    })
    watch(periods.data, (value) => {
      if (value?.lastDate) bucket.value = bucketOf(value.lastDate, granularity.value)
    }, { immediate: true })
  }

  const bounds = computed(() => bucketBounds(bucket.value, granularity.value))
  const label = computed(() => bucketLabel(bucket.value, granularity.value))

  const fetchState = useFetch<AnalysisResponse>('/api/analysis', {
    key: 'analysis',
    server: false,
    query: computed(() => ({
      from: bounds.value.from,
      to: bounds.value.to,
      granularity: granularity.value,
    })),
  })

  function shift(delta: number) {
    bucket.value = shiftBucket(bucket.value, granularity.value, delta)
  }

  /**
   * Change de granularité en RESTANT sur la même date.
   *
   * Passer de « mars 2026 » à l'année doit donner 2026, pas la première tranche de l'historique.
   * On repart donc de la borne de début, seule information commune aux deux découpages.
   */
  function setGranularity(next: Granularity) {
    bucket.value = bucketOf(bounds.value.from, next)
    granularity.value = next
  }

  return { ...fetchState, bucket, granularity, bounds, label, shift, setGranularity }
}
