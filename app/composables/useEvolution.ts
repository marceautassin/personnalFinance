import type { EvolutionResponse } from '~~/server/api/evolution.get'
import type { Granularity } from '~~/shared/types/granularity'
import { bucketOf, shiftBucket, bucketLabel } from '~~/shared/types/granularity'

export type { EvolutionResponse }

/**
 * État de la page d'évolution : la tranche d'arrivée, le pas, et la cible suivie.
 *
 * La granularité y désigne le PAS de la série, alors que sur `/analyse` elle désigne la
 * période regardée. Ce sont deux rôles distincts, et les avoir confondus sous un sélecteur
 * unique rendait la page d'analyse incompréhensible — on choisissait « juillet 2026 » et le
 * graphique répondait sur douze mois (recette du 2026-09-05).
 */
export function useEvolution(initialBucket?: string, initialGranularity: Granularity = 'month') {
  const granularity = ref<Granularity>(initialGranularity)
  const bucket = ref(initialBucket ?? bucketOf(new Date().toISOString().slice(0, 10), initialGranularity))
  const target = ref<string>('')

  /**
   * Sans période explicite dans l'URL, on ouvre sur la DERNIÈRE période qui contient quelque
   * chose. Se caler sur le mois courant ouvrait l'application sur un écran vide dès que
   * l'historique avait un mois de retard — ce qui est le cas normal, un relevé arrivant en fin
   * de mois (recette du 2026-09-05).
   *
   * ⚠️ **Le repli ne joue QU'UNE FOIS** (recette du 2026-09-06). Le watcher restait armé : la
   * moindre mutation invalide les vues, `/api/periods` est refetché, et l'utilisateur qui
   * corrigeait des lignes de juin était renvoyé sur août à chaque correction. Une fois la
   * période résolue, elle appartient à l'utilisateur.
   */
  if (!initialBucket) {
    const periods = useFetch<{ lastDate: string | null }>('/api/periods', {
      key: 'periods',
      server: false,
      default: () => ({ lastDate: null }),
    })
    const stop = watch(periods.data, (value) => {
      if (!value?.lastDate) return
      bucket.value = bucketOf(value.lastDate, granularity.value)
      stop()
    }, { immediate: true })
  }

  const label = computed(() => bucketLabel(bucket.value, granularity.value))

  const fetchState = useFetch<EvolutionResponse>('/api/evolution', {
    key: 'evolution',
    server: false,
    query: computed(() => ({
      to: bucket.value,
      granularity: granularity.value,
      ...(target.value ? { target: target.value } : {}),
    })),
  })

  function shift(delta: number) {
    bucket.value = shiftBucket(bucket.value, granularity.value, delta)
  }

  /** Change de pas en restant sur la même date, comme le fait la page d'analyse. */
  function setGranularity(next: Granularity) {
    bucket.value = bucketOf(
      `${bucket.value.length === 4 ? `${bucket.value}-12` : bucket.value.replace(/-T(\d)/, (_, q) => `-${String(Number(q) * 3).padStart(2, '0')}`)}-01`,
      next,
    )
    granularity.value = next
  }

  return { ...fetchState, bucket, granularity, target, label, shift, setGranularity }
}
