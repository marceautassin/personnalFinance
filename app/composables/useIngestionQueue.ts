import type { IngestionResult } from '~~/shared/schemas/ingestion-result.schema'
import { useInvalidate } from '~/composables/useInvalidate'
import { useStatements, useStatementsList, type OverlapInfo } from './useStatements'

/**
 * File d'ingestion — traitement séquentiel côté client (D22).
 *
 * Le serveur reste SANS ÉTAT : le client itère sur les fichiers et appelle
 * `POST /api/statements` une fois par fichier. La progression est l'état de cette boucle, et
 * un échec est capturé par fichier — FR3 et NFR13 sont donc satisfaits par construction,
 * sans file serveur ni machinerie de reprise.
 *
 * **Renoncement assumé** : fermer l'onglet pendant l'ingestion perd la progression. La reprise
 * consiste à redéposer les fichiers — le hash rend l'opération idempotente (D3). Pour une
 * opération faite une fois dans la vie du produit, une file serveur avec état persisté et
 * endpoint de suivi serait disproportionnée.
 */

export type QueueItemStatus
  = | 'pending'
    | 'running'
    /** Chevauchement de période détecté : la file ATTEND une décision (FR6). */
    | 'awaiting-decision'
    | 'success'
    | 'failed'
    /** Refusé sans erreur : doublon, ou remplacement annulé par l'utilisateur. */
    | 'skipped'

export interface QueueItem {
  id: number
  file: File
  name: string
  status: QueueItemStatus
  result?: IngestionResult
  error?: string
  errorCode?: string
  overlap?: OverlapInfo
}

export function useIngestionQueue() {
  const { uploadStatement } = useStatements()
  const { refresh: refreshList } = useStatementsList()
  // Capturé en setup, avant tout `await` : voir `useInvalidate`.
  const invalidate = useInvalidate()

  const items = ref<QueueItem[]>([])
  const running = ref(false)
  let nextId = 1
  let abortCtrl: AbortController | null = null

  /** Élément en attente d'un arbitrage de l'utilisateur, s'il y en a un. */
  const awaiting = computed(() => items.value.find(i => i.status === 'awaiting-decision') ?? null)

  const counts = computed(() => ({
    total: items.value.length,
    done: items.value.filter(i => ['success', 'failed', 'skipped'].includes(i.status)).length,
    success: items.value.filter(i => i.status === 'success').length,
    failed: items.value.filter(i => i.status === 'failed').length,
    skipped: items.value.filter(i => i.status === 'skipped').length,
  }))

  const finished = computed(() =>
    items.value.length > 0 && !running.value && awaiting.value === null
    && counts.value.done === counts.value.total,
  )

  function set(item: QueueItem, patch: Partial<QueueItem>) {
    Object.assign(item, patch)
    // Le tableau est réassigné pour que les vues qui l'observent par référence se rafraîchissent.
    items.value = [...items.value]
  }

  /** Traite un fichier. Retourne `false` si la file doit s'arrêter pour attendre l'utilisateur. */
  async function process(item: QueueItem, confirmReplace: boolean): Promise<boolean> {
    set(item, { status: 'running', error: undefined, errorCode: undefined, overlap: undefined })
    abortCtrl = new AbortController()
    const out = await uploadStatement(item.file, { confirmReplace, signal: abortCtrl.signal })
    abortCtrl = null

    if (out.aborted) {
      set(item, { status: 'skipped', error: 'Ingestion annulée.' })
      return true
    }
    if (out.result) {
      set(item, { status: 'success', result: out.result })
      return true
    }
    if (out.overlap) {
      // La file s'arrête ici : traiter les suivants en arrière-plan pendant que l'utilisateur
      // décide rendrait la progression incompréhensible, et un remplacement pourrait entrer
      // en concurrence avec le relevé suivant (FR6).
      set(item, { status: 'awaiting-decision', overlap: out.overlap })
      return false
    }
    // Un doublon n'est pas un échec : FR5 demande de le REJETER et de l'INDIQUER, pas de le
    // signaler comme un problème à corriger. Redéposer un dossier entier est le geste normal
    // d'une reprise après interruption, et il ne doit pas produire vingt lignes rouges.
    const isDuplicate = out.errorCode === 'pdf_already_ingested'
    set(item, {
      status: isDuplicate ? 'skipped' : 'failed',
      error: out.error ?? 'Erreur inconnue',
      errorCode: out.errorCode,
    })
    return true
  }

  /**
   * Reprend la file au premier élément non traité.
   *
   * La garde porte AUSSI sur `awaiting` : un dépôt survenant pendant un arbitrage lancerait
   * sinon un upload en parallèle de la boucle, et `cancelCurrent()` — qui ne connaît qu'un
   * seul `AbortController` — annulerait le mauvais fichier. L'invariant de FR6 tenait jusqu'ici
   * par le `v-if` de la page, donc par l'UI et non par la file (revue du 2026-09-05).
   */
  async function drain() {
    if (running.value || awaiting.value) return
    running.value = true
    try {
      for (;;) {
        const next = items.value.find(i => i.status === 'pending')
        if (!next) break
        const shouldContinue = await process(next, false)
        if (!shouldContinue) break
      }
    }
    finally {
      running.value = false
      await refreshList()
      // Une seule invalidation des vues d'analyse pour toute la file (story 17.7), au lieu
      // d'une par fichier.
      await invalidate.invalidateAnalysis()
    }
  }

  function enqueue(files: readonly File[]) {
    const added = files.map(file => ({
      id: nextId++,
      file,
      name: file.name,
      status: 'pending' as QueueItemStatus,
    }))
    items.value = [...items.value, ...added]
    void drain()
  }

  /** Remplace le relevé chevauchant et reprend la file. */
  async function confirmReplace() {
    const item = awaiting.value
    if (!item) return
    await process(item, true)
    await drain()
  }

  /** Renonce à ce fichier et reprend la file. */
  async function skipAwaiting() {
    const item = awaiting.value
    if (!item) return
    set(item, { status: 'skipped', error: 'Remplacement annulé.', overlap: undefined })
    await drain()
  }

  /** Rejoue un fichier en échec, sans toucher aux autres. */
  async function retry(id: number) {
    const item = items.value.find(i => i.id === id)
    if (!item || running.value) return
    set(item, { status: 'pending' })
    await drain()
  }

  function cancelCurrent() {
    abortCtrl?.abort()
  }

  function clear() {
    if (running.value) return
    items.value = []
  }

  return {
    items,
    running,
    awaiting,
    counts,
    finished,
    enqueue,
    confirmReplace,
    skipAwaiting,
    retry,
    cancelCurrent,
    clear,
  }
}
