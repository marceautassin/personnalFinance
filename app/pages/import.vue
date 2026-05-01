<script setup lang="ts">
import type { IngestionResult } from '~~/shared/schemas/ingestion-result.schema'
import { formatEuros, type Cents } from '~~/shared/types/money'
import { isRetryableErrorCode, type OverlapInfo } from '~/composables/useStatements'

const { uploadStatement } = useStatements()

type Status = 'idle' | 'uploading' | 'success' | 'error' | 'overlap'
const status = ref<Status>('idle')
const result = ref<IngestionResult | null>(null)
const errorMsg = ref<string | null>(null)
const errorCode = ref<string | null>(null)
const overlap = ref<OverlapInfo | null>(null)
const lastFile = ref<File | null>(null)
let abortCtrl: AbortController | null = null

async function handleUpload(file: File, confirmReplace = false) {
  if (status.value === 'uploading') return
  lastFile.value = file
  errorMsg.value = null
  errorCode.value = null
  result.value = null
  abortCtrl = new AbortController()
  status.value = 'uploading'
  const out = await uploadStatement(file, { confirmReplace, signal: abortCtrl.signal })
  abortCtrl = null
  if (out.aborted) {
    status.value = 'idle'
    return
  }
  if (out.result) {
    result.value = out.result
    status.value = 'success'
  }
  else if (out.overlap) {
    overlap.value = out.overlap
    status.value = 'overlap'
  }
  else {
    errorMsg.value = out.error ?? 'Erreur inconnue'
    errorCode.value = out.errorCode ?? null
    status.value = 'error'
  }
}

function onConfirmReplace() {
  if (!lastFile.value || status.value === 'uploading') return
  overlap.value = null
  void handleUpload(lastFile.value, true)
}
function onCancelOverlap() {
  overlap.value = null
  if (status.value === 'overlap') status.value = 'idle'
}
function onRetry() {
  if (lastFile.value && status.value !== 'uploading') void handleUpload(lastFile.value)
}
function onCancelUpload() {
  abortCtrl?.abort()
}

const canRetry = computed(() => isRetryableErrorCode(errorCode.value ?? undefined))

const transactionsLink = computed(() => {
  if (!result.value) return null
  return `/transactions/${result.value.periodStart.slice(0, 7)}`
})
</script>

<template>
  <section class="import">
    <h2>Importer un relevé</h2>

    <PdfDropZone
      v-if="status === 'idle' || status === 'error'"
      @upload="handleUpload($event)"
    />

    <IngestionProgress
      :active="status === 'uploading'"
      @cancel="onCancelUpload"
    />

    <div
      v-if="status === 'success' && result"
      class="success"
    >
      <h3>✅ Relevé ingéré</h3>
      <p>Période : <strong>{{ result.periodStart }} → {{ result.periodEnd }}</strong></p>
      <p>{{ result.transactionCount }} transaction{{ result.transactionCount > 1 ? 's' : '' }} catégorisée{{ result.transactionCount > 1 ? 's' : '' }}.</p>
      <p
        v-if="!result.isBalanced"
        class="success__warning"
      >
        ⚠️ Réconciliation non équilibrée : écart de {{ formatEuros(result.gapCents as Cents) }}.
        <NuxtLink :to="`/reconciliation/${result.hash}`">
          Résoudre l'écart
        </NuxtLink>
        (disponible en Epic 3)
      </p>
      <NuxtLink
        v-if="transactionsLink"
        class="success__link"
        :to="transactionsLink"
      >
        Voir les transactions de {{ result.periodStart.slice(0, 7) }}
      </NuxtLink>
    </div>

    <div
      v-if="status === 'error'"
      class="error"
      role="alert"
    >
      <p>{{ errorMsg }}</p>
      <button
        v-if="canRetry"
        type="button"
        class="btn btn--primary"
        @click="onRetry"
      >
        Réessayer
      </button>
    </div>

    <PeriodOverlapDialog
      :overlap="status === 'overlap' ? overlap : null"
      @confirm="onConfirmReplace"
      @cancel="onCancelOverlap"
    />
  </section>
</template>

<style scoped>
.import {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.success {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-success);
}
.success__warning { color: var(--color-warning); }
.success__link {
  margin-top: var(--space-2);
  font-weight: 500;
}
.error {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-4);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
}
.btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font: inherit;
  cursor: pointer;
}
.btn--primary { background: var(--color-accent); color: white; }
</style>
