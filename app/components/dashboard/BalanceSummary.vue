<script setup lang="ts">
import { formatEuros } from '~~/shared/types/money'
import type { Cents } from '~~/shared/types/money'

defineProps<{
  balanceCents: Cents
  incomeCents: Cents
  expenseCents: Cents
}>()
</script>

<template>
  <div class="balance">
    <div class="balance__primary">
      <span class="balance__label">Solde fin de mois</span>
      <span class="balance__amount balance__amount--primary">{{ formatEuros(balanceCents) }}</span>
    </div>
    <div class="balance__secondary">
      <div class="balance__item">
        <span class="balance__label">Revenus</span>
        <span class="balance__amount balance__amount--income">{{ formatEuros(incomeCents) }}</span>
      </div>
      <div class="balance__item">
        <span class="balance__label">Dépenses</span>
        <span class="balance__amount balance__amount--expense">{{ formatEuros(expenseCents) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.balance {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
}
.balance__primary {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.balance__secondary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}
.balance__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.balance__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.balance__amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.balance__amount--primary {
  font-size: var(--font-size-3xl, 2rem);
}
.balance__amount--income { color: var(--color-success); }
.balance__amount--expense { color: var(--color-danger); }

@media (min-width: 640px) {
  .balance {
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--space-6);
  }
}
</style>
