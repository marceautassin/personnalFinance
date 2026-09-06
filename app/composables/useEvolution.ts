import type { EvolutionResponse } from '~~/server/api/evolution.get'
import { bucketOf, bucketLabel } from '~~/shared/types/granularity'
import { EVOLUTION_ALL } from '~~/shared/schemas/evolution.schema'
import { usePeriodBounds } from '~/composables/usePeriodBounds'

export type { EvolutionResponse }

/** Les trois façons de regarder l'historique. `all` n'a pas de tranche voisine. */
export type EvolutionView = 'quarter' | 'year' | typeof EVOLUTION_ALL

export const EVOLUTION_VIEW_LABELS: Record<EvolutionView, string> = {
  quarter: 'Trimestre',
  year: 'Année',
  [EVOLUTION_ALL]: 'Tout l\'historique',
}

/**
 * État de la page d'évolution : LA PÉRIODE REGARDÉE, et la cible suivie.
 *
 * **Refonte du 2026-09-07.** Le sélecteur désignait le PAS de la série, la fenêtre valant
 * douze tranches de ce pas : choisir « Année » donnait douze ANNÉES, alors que l'utilisateur
 * attendait les douze mois de l'année regardée. Le même mot ne voulait pas dire la même chose
 * que sur l'écran d'analyse — « ça se lit jusqu'à », comme il l'a formulé.
 *
 * Désormais la période dit ce qu'on regarde et le découpage en découle : toujours le mois.
 * Un mot, un sens, sur les deux écrans.
 */
export function useEvolution(initialPeriod?: string) {
  const period = ref(initialPeriod ?? new Date().toISOString().slice(0, 4))
  const target = ref<string>('')

  /** L'échelle se lit sur la forme de la période, comme sur l'écran des transactions. */
  const view = computed<EvolutionView>(() => {
    if (period.value === EVOLUTION_ALL) return EVOLUTION_ALL
    return period.value.includes('-T') ? 'quarter' : 'year'
  })

  /**
   * Sans période explicite dans l'URL, on ouvre sur la DERNIÈRE année qui contient quelque
   * chose. Se caler sur l'année civile ouvrirait un écran vide chaque 1er janvier, tant que le
   * relevé n'est pas importé.
   *
   * ⚠️ **Le repli ne joue QU'UNE FOIS** (recette du 2026-09-06). Le watcher restait armé : la
   * moindre mutation invalide les vues, `/api/periods` est refetché, et l'utilisateur était
   * renvoyé sur la dernière période à chaque correction.
   */
  if (!initialPeriod) {
    const periods = usePeriodBounds()
    // Un drapeau, et non le handle du watcher : avec `immediate: true`, le callback part
    // pendant l'appel à `watch()`, donc AVANT que la constante qui le reçoit ne soit
    // initialisée. Y toucher lève une `ReferenceError`.
    let resolved = false
    watch(periods.data, (value) => {
      if (resolved || !value?.lastDate) return
      resolved = true
      period.value = bucketOf(value.lastDate, 'year')
    }, { immediate: true })
  }

  const label = computed(() =>
    period.value === EVOLUTION_ALL
      ? EVOLUTION_VIEW_LABELS[EVOLUTION_ALL]
      : bucketLabel(period.value, view.value === 'quarter' ? 'quarter' : 'year'),
  )

  const fetchState = useFetch<EvolutionResponse>('/api/evolution', {
    key: 'evolution',
    server: false,
    query: computed(() => ({
      period: period.value,
      ...(target.value ? { target: target.value } : {}),
    })),
  })

  /** Tout l'historique n'a pas de voisin : le pas n'y a pas de sens. */
  const canShift = computed(() => period.value !== EVOLUTION_ALL)

  function shift(delta: number) {
    if (period.value === EVOLUTION_ALL) return
    if (view.value === 'year') {
      period.value = String(Number(period.value) + delta)
      return
    }
    const [year, quarter] = period.value.split('-T')
    const index = Number(year) * 4 + (Number(quarter) - 1) + delta
    period.value = `${Math.floor(index / 4)}-T${(index % 4) + 1}`
  }

  /**
   * Change d'échelle en RESTANT sur la même date, comme le fait l'écran d'analyse.
   *
   * Depuis « tout l'historique », on n'a pas de date de référence : on retombe sur la dernière
   * tranche affichée, qui est ce que l'utilisateur a sous les yeux.
   */
  function setView(next: EvolutionView) {
    if (next === EVOLUTION_ALL) {
      period.value = EVOLUTION_ALL
      return
    }
    const anchor = period.value === EVOLUTION_ALL
      ? (fetchState.data.value?.buckets.at(-1) ?? new Date().toISOString().slice(0, 7))
      : period.value
    const firstMonth = anchor.includes('-T')
      ? `${anchor.slice(0, 4)}-${String((Number(anchor.slice(-1)) - 1) * 3 + 1).padStart(2, '0')}`
      : anchor.length === 4 ? `${anchor}-01` : anchor
    period.value = bucketOf(`${firstMonth}-01`, next)
  }

  return { ...fetchState, period, view, target, label, canShift, shift, setView }
}
