<script setup lang="ts">
import type { TransactionListItem } from '~/composables/useTransactions'
import { formatEuros, type Cents } from '~~/shared/types/money'

const props = defineProps<{
  transaction: TransactionListItem
}>()

defineEmits<{
  categoryChange: [transactionId: number, code: string]
}>()

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })

const dayLabel = computed(() => {
  const [y, m, d] = props.transaction.transactionDate.split('-').map(Number)
  return dayFormatter.format(new Date(y!, m! - 1, d!))
})

const amountLabel = computed(() => formatEuros(props.transaction.amountCents as Cents))

const isNegative = computed(() => props.transaction.amountCents < 0)
</script>

<template>
  <tr class="tx-row">
    <td class="tx-row__date">
      {{ dayLabel }}
    </td>
    <td class="tx-row__label">
      <span>{{ transaction.label }}</span>
      <small
        v-if="transaction.isManual"
        class="tx-row__badge tx-row__badge--manual"
        :title="'Catégorie modifiée manuellement'"
      >modifié</small>
      <small
        v-if="transaction.isDebtRepayment"
        class="tx-row__badge tx-row__badge--debt"
        :title="'Marqué comme remboursement de dette'"
      >remb. dette</small>
    </td>
    <td
      class="tx-row__amount"
      :class="{ 'tx-row__amount--neg': isNegative, 'tx-row__amount--pos': !isNegative }"
    >
      {{ amountLabel }}
    </td>
    <td class="tx-row__cat">
      <CategoryEditor
        :current-code="transaction.categoryCode"
        :transaction-id="transaction.id"
        @change="(id, code) => $emit('categoryChange', id, code)"
      />
    </td>
  </tr>
</template>

<style scoped>
.tx-row td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}
.tx-row__date { color: var(--color-text-muted); white-space: nowrap; }
.tx-row__label { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.tx-row__amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tx-row__amount--neg { color: var(--color-danger); }
.tx-row__amount--pos { color: var(--color-success); }
.tx-row__badge {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  background: var(--color-neutral-100);
  color: var(--color-text-muted);
}
.tx-row__badge--debt { background: var(--color-warning-bg, #fff4cc); color: var(--color-warning, #8a6500); }
</style>
