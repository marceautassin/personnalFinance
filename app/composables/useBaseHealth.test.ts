import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed, watch } from 'vue'

const statements = ref<Array<Record<string, unknown>>>([])
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)

vi.mock('~/composables/useStatements', () => ({
  useStatementsList: () => ({
    data: computed(() => ({ statements: statements.value })),
    pending: ref(false),
    error: ref(null),
    refresh: vi.fn(),
  }),
}))

/**
 * Un profil courant TOUJOURS présent ici : ces tests exercent la DÉRIVATION des chiffres à
 * partir de `statements`, pas la garde ajoutée en story 27.3 (revue IMPORTANT 2), déjà couverte
 * par `useBaseHealth.profile-guard.test.ts`.
 */
vi.mock('~/composables/useCurrentProfile', () => ({
  useCurrentProfile: () => ({ currentProfile: ref({ id: 1, name: 'marceau', defaultBank: 'boursorama' }) }),
}))

const { useBaseHealth } = await import('./useBaseHealth')

const stmt = (over: Partial<Record<string, unknown>> = {}) => ({
  hash: 'h', periodStart: '2026-08-01', periodEnd: '2026-08-31',
  reliability: 'reliable', ingestedAt: 0,
  transactionCount: 100, manualCount: 1, correctionRate: 0.01, gapCents: 0,
  ...over,
})

beforeEach(() => {
  statements.value = []
})

describe('useBaseHealth', () => {
  it('additionne lignes et relevés sur toute la base', () => {
    statements.value = [stmt({ transactionCount: 92 }), stmt({ transactionCount: 98 })]
    const h = useBaseHealth()

    expect(h.statementCount.value).toBe(2)
    expect(h.transactionCount.value).toBe(190)
  })

  /**
   * Le cas qui justifie la valeur absolue : deux relevés qui divergent de +47 € et -47 € sont
   * DEUX relevés faux. Une somme algébrique afficherait « 0,00 € » sur une base cassée — le
   * pire mode de défaillance possible pour un compteur de santé.
   */
  it('somme les écarts en valeur absolue : deux erreurs ne s\'annulent pas', () => {
    statements.value = [stmt({ gapCents: 4700 }), stmt({ gapCents: -4700 })]
    const h = useBaseHealth()

    expect(h.gapCents.value).toBe(9400)
  })

  it('rend un écart nul quand tous les relevés sont réconciliés', () => {
    statements.value = [stmt(), stmt()]
    expect(useBaseHealth().gapCents.value).toBe(0)
  })

  /** Le taux est GLOBAL : la moyenne des taux par relevé donnerait un autre chiffre. */
  it('calcule le taux de correction sur le total, pas en moyennant les relevés', () => {
    statements.value = [
      stmt({ transactionCount: 10, manualCount: 5 }),
      stmt({ transactionCount: 90, manualCount: 5 }),
    ]
    // 10 / 100 et non (50 % + 5,6 %) / 2.
    expect(useBaseHealth().correctionRate.value).toBeCloseTo(0.1, 10)
  })

  /** Base vide : le taux n'est pas défini, il n'est pas nul (AR10). */
  it('rend null sur une base sans transaction', () => {
    statements.value = [stmt({ transactionCount: 0, manualCount: 0 })]
    const h = useBaseHealth()

    expect(h.correctionRate.value).toBeNull()
    expect(h.transactionCount.value).toBe(0)
  })

  it('rend des compteurs à zéro et un taux null quand aucun relevé n\'est ingéré', () => {
    const h = useBaseHealth()

    expect(h.statementCount.value).toBe(0)
    expect(h.gapCents.value).toBe(0)
    expect(h.correctionRate.value).toBeNull()
  })
})

/**
 * Le mois visé par la navigation : celui du dernier RELEVÉ, jamais celui du calendrier — sans
 * quoi « Transactions » ouvre sur un mois vide dès le 1er du mois.
 */
describe('useBaseHealth — dernière période', () => {
  it('rend le mois du relevé le plus récent', () => {
    statements.value = [
      stmt({ periodStart: '2026-08-01' }),
      stmt({ periodStart: '2026-07-01' }),
    ]
    expect(useBaseHealth().latestPeriod.value).toBe('2026-08')
  })

  /** Un relevé Boursobank court du 28/02 au 31/03 : c'est son DÉBUT qui nomme la période. */
  it('prend le mois du début de période, pas celui de la fin', () => {
    statements.value = [stmt({ periodStart: '2026-02-28', periodEnd: '2026-03-31' })]
    expect(useBaseHealth().latestPeriod.value).toBe('2026-02')
  })

  it('rend null sur une base vide, à charge à l\'appelant de choisir un repli', () => {
    expect(useBaseHealth().latestPeriod.value).toBeNull()
  })
})
