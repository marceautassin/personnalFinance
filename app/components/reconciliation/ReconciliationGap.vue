<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'

defineProps<{
  expectedCents: Cents
  foundCents: Cents
  gapCents: Cents
  isBalanced: boolean
}>()

defineEmits<{ addTransaction: [], acceptGap: [] }>()
</script>

<template>
  <section class="rec-gap">
    <header class="rec-gap__header">
      <h3 class="rec-gap__title">
        Réconciliation
      </h3>
      <p
        v-if="isBalanced"
        class="rec-gap__status rec-gap__status--ok"
        role="status"
      >
        ✅ Soldes équilibrés
      </p>
      <p
        v-else
        class="rec-gap__status rec-gap__status--gap"
        role="status"
      >
        ⚠️ Écart : {{ formatEuros(gapCents) }}
      </p>
    </header>

    <dl class="rec-gap__balances">
      <div>
        <dt>Solde attendu (clôture - ouverture)</dt>
        <dd>{{ formatEuros(expectedCents) }}</dd>
      </div>
      <div>
        <dt>Somme des transactions</dt>
        <dd>{{ formatEuros(foundCents) }}</dd>
      </div>
    </dl>

    <div
      v-if="!isBalanced"
      class="rec-gap__actions"
    >
      <button
        type="button"
        class="rec-gap__btn rec-gap__btn--primary"
        @click="$emit('addTransaction')"
      >
        Ajouter une transaction
      </button>
      <button
        type="button"
        class="rec-gap__btn"
        @click="$emit('acceptGap')"
      >
        Accepter l'écart (mois non fiable)
      </button>
    </div>
  </section>
</template>

<style scoped>
.rec-gap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.rec-gap__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.rec-gap__title {
  margin: 0;
  font-size: var(--font-size-lg);
}
.rec-gap__status { margin: 0; font-weight: 500; }
.rec-gap__status--ok { color: var(--color-success); }
.rec-gap__status--gap { color: var(--color-warning); }
.rec-gap__balances {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin: 0;
}
.rec-gap__balances > div { display: flex; flex-direction: column; gap: var(--space-1); }
.rec-gap__balances dt { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.rec-gap__balances dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 500; }
.rec-gap__actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.rec-gap__btn {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  font: inherit;
  cursor: pointer;
}
.rec-gap__btn:hover { border-color: var(--color-accent); }
.rec-gap__btn--primary {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}
.rec-gap__btn--primary:hover { filter: brightness(1.05); }
</style>
