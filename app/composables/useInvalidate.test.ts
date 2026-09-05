import { describe, it, expect, vi, beforeEach } from 'vitest'

const refreshMock = vi.fn()
/**
 * `runWithContext` est ce qui rend l'invalidation opérante APRÈS un `await`. Le mock le rend
 * transparent, mais son ABSENCE est testée plus bas : c'est elle qui faisait échouer le
 * refetch en silence.
 */
const runWithContext = vi.fn((fn: () => unknown) => fn())

vi.stubGlobal('refreshNuxtData', refreshMock)
vi.stubGlobal('useNuxtApp', () => ({ runWithContext }))

const { useInvalidate } = await import('./useInvalidate')

beforeEach(() => {
  refreshMock.mockClear()
  runWithContext.mockClear()
})

describe('useInvalidate', () => {
  it('invalidateAnalysis rafraîchit les données actives (clés d\'analyse dynamiques)', async () => {
    await useInvalidate().invalidateAnalysis()
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(refreshMock).toHaveBeenCalledWith()
  })

  it('invalidateStatementsList cible la clé statements-list', async () => {
    await useInvalidate().invalidateStatementsList()
    expect(refreshMock).toHaveBeenCalledWith('statements-list')
  })

  /**
   * Le défaut corrigé le 2026-09-05 : appelée après un `await`, l'invalidation partait hors
   * contexte Nuxt et ne déclenchait aucun refetch. Sans ce passage par `runWithContext`, un
   * reclassement de transaction laissait `/analyse` sur ses anciens chiffres.
   */
  it('passe TOUJOURS par runWithContext, y compris après un await', async () => {
    const invalidate = useInvalidate()
    await Promise.resolve()
    await invalidate.invalidateAnalysis()
    expect(runWithContext).toHaveBeenCalledTimes(1)
  })

  it('capture le contexte au montage, pas au moment de l\'appel', async () => {
    const invalidate = useInvalidate()
    vi.stubGlobal('useNuxtApp', () => {
      throw new Error('hors contexte Nuxt')
    })
    await expect(invalidate.invalidateAnalysis()).resolves.toBeUndefined()
    vi.stubGlobal('useNuxtApp', () => ({ runWithContext }))
  })
})
