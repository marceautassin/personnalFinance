import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed, watch } from 'vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)

/** Données de `/api/periods`, pilotées par le test pour rejouer un refetch. */
const periodsData = ref<{ firstDate: string | null, lastDate: string | null }>({
  firstDate: null,
  lastDate: null,
})

vi.stubGlobal('useFetch', (url: string) => {
  if (url === '/api/periods') return { data: periodsData }
  return { data: ref(null), pending: ref(false), error: ref(null), refresh: vi.fn() }
})

const { useAnalysis } = await import('./useAnalysis')

beforeEach(() => {
  periodsData.value = { firstDate: null, lastDate: null }
})

/**
 * Repli sur la dernière période — recette du 2026-09-06.
 *
 * Le watcher restait armé après avoir joué : la moindre mutation invalide les vues,
 * `/api/periods` est refetché, et l'utilisateur qui corrigeait des lignes de juin se retrouvait
 * renvoyé sur août à chaque correction. Une période choisie appartient à l'utilisateur.
 */
describe('useAnalysis — repli sur la dernière période', () => {
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))

  it('ouvre sur la dernière période connue quand l\'URL n\'en porte pas', async () => {
    const analysis = useAnalysis(undefined, 'month')
    periodsData.value = { firstDate: '2025-01-02', lastDate: '2026-08-31' }
    await flush()

    expect(analysis.bucket.value).toBe('2026-08')
  })

  it('NE revient PAS sur la dernière période quand /api/periods est refetché', async () => {
    const analysis = useAnalysis(undefined, 'month')
    periodsData.value = { firstDate: '2025-01-02', lastDate: '2026-08-31' }
    await flush()

    // L'utilisateur remonte à juin, puis une correction invalide les vues.
    analysis.shift(-2)
    expect(analysis.bucket.value).toBe('2026-06')

    periodsData.value = { firstDate: '2025-01-02', lastDate: '2026-08-31' }
    await flush()

    expect(analysis.bucket.value).toBe('2026-06')
  })

  /**
   * Cas du SECOND passage sur la page : `/api/periods` a déjà sa donnée en cache, donc le
   * callback `immediate` part pendant l'appel à `watch()`. Référencer le handle du watcher à
   * cet instant levait une `ReferenceError` et cassait la navigation (recette du 2026-09-06).
   */
  it('se cale sans erreur quand la période est déjà chargée au montage', async () => {
    periodsData.value = { firstDate: '2025-01-02', lastDate: '2026-08-31' }

    const analysis = useAnalysis(undefined, 'month')
    await flush()

    expect(analysis.bucket.value).toBe('2026-08')
  })

  it('ne se ré-applique pas non plus après un montage sur donnée déjà chargée', async () => {
    periodsData.value = { firstDate: '2025-01-02', lastDate: '2026-08-31' }
    const analysis = useAnalysis(undefined, 'month')
    await flush()

    analysis.shift(-2)
    periodsData.value = { firstDate: '2025-01-02', lastDate: '2026-08-31' }
    await flush()

    expect(analysis.bucket.value).toBe('2026-06')
  })

  it('ignore le repli quand l\'URL porte déjà une période', async () => {
    const analysis = useAnalysis('2026-03', 'month')
    periodsData.value = { firstDate: '2025-01-02', lastDate: '2026-08-31' }
    await flush()

    expect(analysis.bucket.value).toBe('2026-03')
  })

  it('ne se cale sur rien tant que l\'historique est vide', async () => {
    const analysis = useAnalysis(undefined, 'month')
    const initial = analysis.bucket.value
    await flush()

    expect(analysis.bucket.value).toBe(initial)
  })
})
