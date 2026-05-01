// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDisclaimerStore } from './disclaimer'

const STORAGE_KEY = 'pf_disclaimer_seen_v1'

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('useDisclaimerStore', () => {
  it('initFromStorage lit la valeur "1" comme seen=true', () => {
    window.localStorage.setItem(STORAGE_KEY, '1')
    const store = useDisclaimerStore()
    store.initFromStorage()
    expect(store.seen).toBe(true)
    expect(store.initialized).toBe(true)
  })

  it('initFromStorage retourne seen=false si la clé est absente', () => {
    const store = useDisclaimerStore()
    store.initFromStorage()
    expect(store.seen).toBe(false)
    expect(store.initialized).toBe(true)
  })

  it('acknowledge() met seen=true et persiste "1" dans localStorage', () => {
    const store = useDisclaimerStore()
    store.initFromStorage()
    store.acknowledge()
    expect(store.seen).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1')
  })

  it('initFromStorage est idempotent (n\'écrase pas après acknowledge)', () => {
    const store = useDisclaimerStore()
    store.initFromStorage()
    store.acknowledge()
    // Simule une seconde initialisation (e.g. remount du composant)
    store.initFromStorage()
    expect(store.seen).toBe(true)
  })

  it('valeur ≠ "1" en localStorage est ignorée et donne seen=false', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const store = useDisclaimerStore()
    store.initFromStorage()
    expect(store.seen).toBe(false)
  })

  it('initFromStorage ne propage pas une exception localStorage (private mode / quota)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage blocked')
    })
    const store = useDisclaimerStore()
    expect(() => store.initFromStorage()).not.toThrow()
    expect(store.seen).toBe(false)
    expect(store.initialized).toBe(true)
  })

  it('acknowledge ne propage pas une exception localStorage', () => {
    const store = useDisclaimerStore()
    store.initFromStorage()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => store.acknowledge()).not.toThrow()
    expect(store.seen).toBe(true)
  })
})
