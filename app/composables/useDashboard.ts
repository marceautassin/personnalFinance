import { computed, type Ref } from 'vue'
import type { Cents } from '~~/shared/types/money'
import type { ReliabilityValue } from '~~/server/db/schema'

export interface DashboardDelta {
  categoryCode: string
  label: string
  currentCents: Cents
  priorAvgCents: Cents
  diffCents: Cents
  pct: number | null
}

/**
 * Miroir client de la réponse `GET /api/dashboard` (story 4.1). Les types `server/` ne sont
 * pas importés ici (l'arbre serveur est exclu du bundle client) — on duplique la forme.
 */
export interface DashboardResponse {
  month: string
  balanceCents: Cents
  totals: {
    incomeCents: Cents
    expenseCents: Cents
    byCategory: Record<string, Cents>
  }
  deltasVsPriorMonths: DashboardDelta[]
  phrases: string[]
  reliability: ReliabilityValue | null
}

/**
 * Factory pour le `default` de `useFetch` — chaque appel produit un objet frais (pas de
 * singleton partagé, cf. defer story 3.2). `month` est posé à vide ; il est écrasé au fetch.
 */
function emptyDashboard(): DashboardResponse {
  return {
    month: '',
    balanceCents: 0 as Cents,
    totals: { incomeCents: 0 as Cents, expenseCents: 0 as Cents, byCategory: {} },
    deltasVsPriorMonths: [],
    phrases: [],
    reliability: null,
  }
}

/**
 * Agrégats du dashboard pour un mois (`YYYY-MM`). `monthRef` est réactif : changer sa valeur
 * déclenche un refetch via la `key` calculée. Pas de cache Pinia — la source de vérité est l'API
 * (cf. CLAUDE.md anti-patterns). Read-only : aucune mutation.
 */
export function useDashboard(monthRef: Ref<string>) {
  const key = computed(() => `dashboard-${monthRef.value}`)
  return useFetch<DashboardResponse>('/api/dashboard', {
    query: { month: monthRef },
    key,
    default: emptyDashboard,
    server: false,
  })
}
