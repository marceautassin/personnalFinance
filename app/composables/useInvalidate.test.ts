import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useInvalidate } from './useInvalidate'

const refreshMock = vi.fn()
vi.stubGlobal('refreshNuxtData', refreshMock)

beforeEach(() => refreshMock.mockClear())

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
})
