<script setup lang="ts">
import { computeDividendCapacity, type SasConfigInput } from '~~/shared/services/dividend-capacity'
import { formatEuros } from '~~/shared/types/money'

const props = defineProps<{ input: SasConfigInput }>()

// Recalcul live (fonction pure, < 1 ms) à chaque changement des valeurs saisies.
const capacity = computed(() => computeDividendCapacity(props.input))
</script>

<template>
  <div class="capacity-card">
    <h3 class="capacity-card__title">
      Capacité dividendable estimée
    </h3>

    <dl class="capacity-card__rows">
      <div class="capacity-card__row">
        <dt>Résultat avant IS</dt>
        <dd>{{ formatEuros(capacity.profitBeforeTaxCents) }}</dd>
      </div>
      <div class="capacity-card__row">
        <dt>Impôt sur les sociétés</dt>
        <dd>{{ formatEuros(capacity.taxCents) }}</dd>
      </div>
      <div class="capacity-card__row">
        <dt>Résultat après IS</dt>
        <dd>{{ formatEuros(capacity.profitAfterTaxCents) }}</dd>
      </div>
      <div class="capacity-card__row capacity-card__row--total">
        <dt>Capacité dividendable</dt>
        <dd data-testid="dividend-capacity">
          {{ formatEuros(capacity.dividendableCapacityCents) }}
        </dd>
      </div>
    </dl>

    <p class="capacity-card__note">
      Estimation V1 simplifiée (sans reports déficitaires, taux IS réduit ni réserves légales).
    </p>
  </div>
</template>

<style scoped>
.capacity-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.capacity-card__title { margin: 0; font-size: var(--font-size-lg); }
.capacity-card__rows { margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.capacity-card__row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
}
.capacity-card__row dt { color: var(--color-text-muted); margin: 0; }
.capacity-card__row dd { margin: 0; font-variant-numeric: tabular-nums; }
.capacity-card__row--total {
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
  font-size: var(--font-size-base);
  font-weight: 600;
}
.capacity-card__row--total dt { color: var(--color-text); }
.capacity-card__note { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }
</style>
