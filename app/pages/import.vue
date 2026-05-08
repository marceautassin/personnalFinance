<script setup lang="ts">
import type { IngestionResult } from '~~/shared/schemas/ingestion-result.schema'
import { formatEuros, type Cents } from '~~/shared/types/money'
import { isRetryableErrorCode, useStatementsList, type OverlapInfo } from '~/composables/useStatements'

const { uploadStatement } = useStatements()
const { data: listData, refresh: refreshList } = useStatementsList()

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
function monthLabel(periodStart: string): string {
  const [y, m] = periodStart.split('-').map(Number)
  const label = monthFormatter.format(new Date(y!, m! - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}
function periodSlug(periodStart: string): string {
  return periodStart.slice(0, 7)
}

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
    void refreshList()
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

    <section
      class="statements"
      aria-labelledby="statements-heading"
    >
      <h3 id="statements-heading">
        Relevés ingérés
      </h3>
      <p
        v-if="listData.statements.length === 0"
        class="statements__empty"
      >
        Aucun relevé ingéré pour le moment.
      </p>
      <ul
        v-else
        class="statements__list"
      >
        <li
          v-for="stmt in listData.statements"
          :key="stmt.hash"
          class="statements__row"
        >
          <span class="statements__period">{{ monthLabel(stmt.periodStart) }}</span>
          <span class="statements__count">{{ stmt.transactionCount }} tx</span>
          <ReliabilityBadge :reliability="stmt.reliability" />
          <span class="statements__links">
            <NuxtLink :to="`/transactions/${periodSlug(stmt.periodStart)}`">
              Transactions
            </NuxtLink>
            <NuxtLink :to="`/reconciliation/${stmt.hash}`">
              Réconciliation
            </NuxtLink>
          </span>
        </li>
      </ul>
    </section>
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
.statements {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.statements h3 { margin: 0; font-size: var(--font-size-lg); }
.statements__empty { color: var(--color-text-muted); margin: 0; }
.statements__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.statements__row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
.statements__period { font-weight: 500; }
.statements__count { color: var(--color-text-muted); font-size: var(--font-size-sm); font-variant-numeric: tabular-nums; }
.statements__links { display: flex; gap: var(--space-3); font-size: var(--font-size-sm); }
</style>
