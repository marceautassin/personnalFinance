import { defineStore } from 'pinia'

const STORAGE_KEY = 'pf_disclaimer_seen_v1'

/**
 * State UI pur (G1 — pas de table, pas d'endpoint).
 * `seen` est synchronisé avec localStorage via `initFromStorage` et `acknowledge`.
 */
export const useDisclaimerStore = defineStore('disclaimer', {
  state: () => ({
    seen: false,
    initialized: false,
  }),
  actions: {
    initFromStorage() {
      if (this.initialized) return
      if (typeof window !== 'undefined') {
        // localStorage peut throw (Safari private mode, quota, blocked) — fallback en mémoire.
        try {
          this.seen = window.localStorage.getItem(STORAGE_KEY) === '1'
        }
        catch {
          this.seen = false
        }
      }
      this.initialized = true
    },
    acknowledge() {
      this.seen = true
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, '1')
        }
        catch {
          // Persistance impossible — disclaimer s'affichera de nouveau au prochain démarrage.
        }
      }
    },
  },
})
