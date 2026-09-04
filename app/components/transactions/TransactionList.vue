<script setup lang="ts">
import type { TransactionListItem } from '~/composables/useTransactions'

defineProps<{
  transactions: TransactionListItem[]
}>()

defineEmits<{
  categoryChange: [transactionId: number, code: string]
}>()
</script>

<template>
  <table class="tx-list">
    <thead>
      <tr>
        <th
          scope="col"
          class="tx-list__col-date"
        >
          Date
        </th>
        <th scope="col">
          Libellé
        </th>
        <th
          scope="col"
          class="tx-list__col-amount"
        >
          Montant
        </th>
        <th
          scope="col"
          class="tx-list__col-cat"
        >
          Catégorie
        </th>
      </tr>
    </thead>
    <tbody>
      <TransactionRow
        v-for="tx in transactions"
        :key="tx.id"
        :transaction="tx"
        @category-change="(id, code) => $emit('categoryChange', id, code)"
      />
    </tbody>
  </table>
</template>

<style scoped>
.tx-list {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}
.tx-list th {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
  color: var(--color-text-muted);
}
.tx-list__col-date { width: 6em; }
.tx-list__col-amount { width: 9em; text-align: right; }
.tx-list__col-cat { width: 14em; }
</style>
