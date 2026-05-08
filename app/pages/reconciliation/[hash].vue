<script setup lang="ts">
import { useReconciliation, useStatementDetail } from '~/composables/useReconciliation'
import type { AddManualTransactionInput } from '~~/shared/schemas/reconciliation.schema'
import { formatEuros, subCents, sumCents, type Cents } from '~~/shared/types/money'

const HASH_RE = /^[a-f0-9]{64}$/
definePageMeta({
  validate: route => typeof route.params.hash === 'string' && HASH_RE.test(route.params.hash),
})

const route = useRoute()
const hash = computed(() => route.params.hash as string)

const { data, pending, error, refresh } = useStatementDetail(hash)
const { addManualTransaction, acceptGap } = useReconciliation()
const { mapError } = useApiError()

const showAddForm = ref(false)
const showConfirm = ref(false)
const submitting = ref(false)
const actionError = ref<string | null>(null)

const expectedCents = computed<Cents>(() =>
  subCents(data.value.closingBalanceCents, data.value.openingBalanceCents),
)
const foundCents = computed<Cents>(() =>
  sumCents(data.value.transactions.map(t => t.amountCents)),
)

const periodLabel = computed(() => {
  if (!data.value.periodStart) return ''
  return `${data.value.periodStart} → ${data.value.periodEnd}`
})

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

async function onAddSubmit(tx: AddManualTransactionInput) {
  actionError.value = null
  submitting.value = true
  const outcome = await addManualTransaction(hash.value, tx)
  submitting.value = false
  if (outcome.error) {
    actionError.value = outcome.error
    return
  }
  showAddForm.value = false
  await refresh()
}

function onAcceptClick() {
  actionError.value = null
  showConfirm.value = true
}

async function onAcceptConfirm() {
  showConfirm.value = false
  submitting.value = true
  const outcome = await acceptGap(hash.value)
  submitting.value = false
  if (outcome.error) {
    actionError.value = outcome.error
    return
  }
  await refresh()
}
</script>

<template>
  <section class="rec-page">
    <header class="rec-page__header">
      <h2>Réconciliation du relevé</h2>
      <p
        v-if="periodLabel"
        class="rec-page__period"
      >
        Période : <strong>{{ periodLabel }}</strong>
      </p>
    </header>

    <ReliabilityBadge
      v-if="data.reliability === 'unreliable'"
      :reliability="data.reliability"
    />

    <p
      v-if="pending && !data.hash"
      class="rec-page__pending"
    >
      Chargement…
    </p>

    <div
      v-else-if="fetchErrorMessage"
      class="rec-page__error"
      role="alert"
    >
      <p>{{ fetchErrorMessage }}</p>
      <NuxtLink to="/import">
        Retour à l'import
      </NuxtLink>
    </div>

    <template v-else-if="data.hash">
      <ReconciliationGap
        :expected-cents="expectedCents"
        :found-cents="foundCents"
        :gap-cents="data.reconciliation.gapCents"
        :is-balanced="data.reconciliation.isBalanced"
        @add-transaction="showAddForm = true"
        @accept-gap="onAcceptClick"
      />

      <AddManualTransaction
        v-if="showAddForm"
        :submitting="submitting"
        @submit="onAddSubmit"
        @cancel="showAddForm = false"
      />

      <p
        v-if="actionError"
        class="rec-page__error"
        role="alert"
      >
        {{ actionError }}
      </p>

      <section
        v-if="data.transactions.length > 0"
        class="rec-page__tx"
      >
        <h3>Transactions du relevé ({{ data.transactions.length }})</h3>
        <ul class="rec-page__tx-list">
          <li
            v-for="tx in data.transactions"
            :key="tx.id"
            class="rec-page__tx-row"
            :class="{ 'rec-page__tx-row--manual': tx.isManual }"
          >
            <span class="rec-page__tx-date">{{ tx.transactionDate }}</span>
            <span class="rec-page__tx-label">
              {{ tx.label }}
              <small
                v-if="tx.isManual"
                class="rec-page__tx-badge"
              >manuelle</small>
            </span>
            <span
              class="rec-page__tx-amount"
              :class="{ 'rec-page__tx-amount--neg': tx.amountCents < 0 }"
            >
              {{ formatEuros(tx.amountCents) }}
            </span>
          </li>
        </ul>
      </section>

      <ConfirmDialog
        :open="showConfirm"
        title="Accepter l'écart ?"
        message="Cette action marquera le mois comme non fiable et insère une transaction « Écart accepté » dans la catégorie divers. Cette action ne peut pas être annulée. Continuer ?"
        confirm-label="Marquer non fiable"
        @confirm="onAcceptConfirm"
        @cancel="showConfirm = false"
      />
    </template>
  </section>
</template>

<style scoped>
.rec-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.rec-page__header { display: flex; flex-direction: column; gap: var(--space-1); }
.rec-page__header h2 { margin: 0; }
.rec-page__period { margin: 0; color: var(--color-text-muted); }
.rec-page__pending { color: var(--color-text-muted); }
.rec-page__error {
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rec-page__tx {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rec-page__tx h3 { margin: 0; font-size: var(--font-size-base); }
.rec-page__tx-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.rec-page__tx-row {
  display: grid;
  grid-template-columns: 6rem 1fr auto;
  gap: var(--space-3);
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  align-items: baseline;
}
.rec-page__tx-row--manual { background: var(--color-neutral-50); }
.rec-page__tx-date { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.rec-page__tx-amount { font-variant-numeric: tabular-nums; font-weight: 500; color: var(--color-success); }
.rec-page__tx-amount--neg { color: var(--color-danger); }
.rec-page__tx-badge {
  margin-left: var(--space-2);
  padding: 0 var(--space-2);
  background: var(--color-neutral-200);
  color: var(--color-text-muted);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
}
</style>
