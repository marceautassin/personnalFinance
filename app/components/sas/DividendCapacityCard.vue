<script setup lang="ts">
import { computeDividendCapacity, type SasConfigInput } from '~~/shared/services/dividend-capacity'
import { formatEuros } from '~~/shared/types/money'

// `input` est `null` quand une saisie du formulaire est invalide ou hors bornes : on affiche
// alors un état « indisponible » plutôt qu'une estimation calculée sur des zéros implicites,
// qui se lirait comme un chiffre financier valide (revue 2026-08-04).
const props = defineProps<{ input: SasConfigInput | null }>()

// Recalcul live (fonction pure, < 1 ms) à chaque changement des valeurs saisies.
const capacity = computed(() => (props.input ? computeDividendCapacity(props.input) : null))
</script>

<template>
  <div class="capacity-card">
    <h3 class="capacity-card__title">
      Capacité dividendable estimée
    </h3>

    <p
      v-if="!capacity"
      class="capacity-card__unavailable"
      role="status"
    >
      Estimation indisponible — corrige les montants saisis.
    </p>

    <dl
      v-else
      class="capacity-card__rows"
    >
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
      Le report à nouveau saisi doit exclure le résultat de l'exercice en cours.
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
.capacity-card__unavailable { margin: 0; color: var(--color-danger); font-size: var(--font-size-sm); }
</style>
