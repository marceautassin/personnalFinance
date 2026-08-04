import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useInvalidate } from './useInvalidate'

const refreshMock = vi.fn()
vi.stubGlobal('refreshNuxtData', refreshMock)

beforeEach(() => refreshMock.mockClear())

describe('useInvalidate (FR53)', () => {
  it('invalidateForecast rafraîchit les 3 clés forecast', async () => {
    await useInvalidate().invalidateForecast()
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(refreshMock).toHaveBeenCalledWith(['forecast-6', 'forecast-12', 'forecast-24'])
  })

  it('invalidateDashboard rafraîchit les données actives (sans clé — clés dashboard dynamiques)', async () => {
    await useInvalidate().invalidateDashboard()
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(refreshMock).toHaveBeenCalledWith()
  })

  it('invalidateStatementsList cible la clé statements-list', async () => {
    await useInvalidate().invalidateStatementsList()
    expect(refreshMock).toHaveBeenCalledWith('statements-list')
  })
})
