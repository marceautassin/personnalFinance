<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import type { StatementSource } from '~~/shared/types/statement-source'

const props = defineProps<{
  expectedCents: Cents
  foundCents: Cents
  gapCents: Cents
  isBalanced: boolean
  /**
   * Origine du relevé (D44, story 28.4). Sur un export, l'équilibre est vrai PAR CONSTRUCTION
   * (le solde de départ est déduit du solde final et de la somme des lignes) : il ne prouve
   * rien, contrairement au PDF où les deux soldes sont lus indépendamment sur le document.
   */
  source: StatementSource
}>()

defineEmits<{ addTransaction: [], acceptGap: [] }>()

/**
 * Un export « équilibré » ne l'est pas au même titre qu'un PDF réconcilié : afficher
 * « ✅ Soldes équilibrés » à côté de « Non vérifié » laisserait croire à une vérification qui
 * n'a pas eu lieu (revue pr-reviewer de la story 28.4, IMPORTANT 4).
 */
const exportUnverified = computed(() => props.isBalanced && props.source === 'export')
</script>

<template>
  <section class="rec-gap">
    <header class="rec-gap__header">
      <h3 class="rec-gap__title">
        Réconciliation
      </h3>
      <p
        v-if="exportUnverified"
        class="rec-gap__status rec-gap__status--warn"
        role="status"
      >
        ⚠️ Export non vérifié — le solde de départ est déduit, pas lu sur un relevé PDF
      </p>
      <p
        v-else-if="isBalanced"
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
        class="btn btn--primary"
        @click="$emit('addTransaction')"
      >
        Ajouter une transaction
      </button>
      <button
        type="button"
        class="btn"
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
.rec-gap__title { margin: 0; font-size: var(--font-size-md); }
.rec-gap__status { margin: 0; font-weight: 500; }
.rec-gap__status--ok { color: var(--color-success); }
.rec-gap__status--gap { color: var(--color-warning); }
.rec-gap__status--warn { color: var(--color-warning); }
.rec-gap__balances {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin: 0;
}
.rec-gap__balances > div { display: flex; flex-direction: column; gap: var(--space-1); }
.rec-gap__balances dt { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.rec-gap__balances dd { margin: 0; font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 500; }
.rec-gap__actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
