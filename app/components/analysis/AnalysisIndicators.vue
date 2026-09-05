<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import { formatRatio } from '~~/shared/types/ratio'
import type { AnalysisResponse } from '~/composables/useAnalysis'
import { formatDate } from '~/utils/dates'

const props = defineProps<{
  indicators: AnalysisResponse['indicators']
  bankBalance: AnalysisResponse['bankBalance']
  /** Bornes demandées, pour dire quand le solde couvre autre chose. */
  from: string
  to: string
}>()

/** FR33 — le déficit doit se voir sans lire les chiffres. */
const isDeficit = computed(() => props.indicators.resultCents < 0)

/**
 * Variation du solde bancaire, affichée à côté du résultat et jamais à sa place.
 *
 * Les deux répondent à des questions différentes : le résultat dit si la période a coûté plus
 * qu'elle n'a rapporté, le solde dit ce qu'il reste sur le compte. Sur mars 2026, le premier
 * vaut −1 893 € et le second +472 € — l'écart étant l'épargne rapatriée. Les confondre est
 * précisément ce que le produit corrige (NFR4).
 */
const bankDelta = computed(() => {
  if (!props.bankBalance) return null
  return (props.bankBalance.closingCents - props.bankBalance.openingCents) as Cents
})

/**
 * Un relevé bancaire ne coïncide presque jamais avec le calendrier : chez Boursobank il court
 * du 28/02 au 31/03. Le solde reste utile, mais il faut dire ce qu'il couvre — sinon l'écran
 * affiche une variation sur une autre période sous le titre du mois demandé.
 */
const balanceIsOffset = computed(() =>
  props.bankBalance !== null && (props.bankBalance.from !== props.from || props.bankBalance.to !== props.to),
)
</script>

<template>
  <div class="indic">
    <div
      class="indic__card indic__card--result"
      :class="{ 'indic__card--deficit': isDeficit }"
      data-testid="indicator-result"
    >
      <span class="indic__label">Trésorerie de la période</span>
      <strong class="indic__value">{{ formatEuros(indicators.resultCents as Cents) }}</strong>
      <span
        v-if="isDeficit"
        class="indic__flag"
        role="status"
      >Période déficitaire</span>
      <span
        v-else
        class="indic__hint"
      >Recettes {{ formatEuros(indicators.incomeCents as Cents) }} · dépenses {{ formatEuros(indicators.expenseCents as Cents) }}</span>
    </div>

    <div class="indic__card">
      <span class="indic__label">Taux de dépense</span>
      <strong class="indic__value">{{ formatRatio(indicators.spendRate) }}</strong>
      <span class="indic__hint">des recettes consommées</span>
    </div>

    <div class="indic__card">
      <span class="indic__label">Taux d'épargne</span>
      <strong class="indic__value">{{ formatRatio(indicators.savingsRate) }}</strong>
      <span class="indic__hint">des recettes conservées</span>
    </div>

    <div class="indic__card">
      <span class="indic__label">Trésorerie cumulée</span>
      <strong class="indic__value">{{ formatEuros(indicators.cumulativeResultCents as Cents) }}</strong>
      <span class="indic__hint">sur la série affichée</span>
    </div>

    <div class="indic__card indic__card--aside">
      <span class="indic__label">Solde bancaire</span>
      <strong class="indic__value">{{ bankDelta === null ? '—' : formatEuros(bankDelta) }}</strong>
      <span class="indic__hint">
        <template v-if="bankDelta === null">Historique incomplet sur la période</template>
        <template v-else-if="balanceIsOffset">
          Du {{ formatDate(bankBalance!.from) }} au {{ formatDate(bankBalance!.to) }}, mouvements internes compris
        </template>
        <template v-else>Mouvements internes compris : {{ formatEuros(indicators.internalCents as Cents) }}</template>
      </span>
    </div>
  </div>
</template>

<style scoped>
.indic {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--space-3);
}
.indic__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.indic__card--result { border-left: 3px solid var(--color-success); }
.indic__card--deficit { border-left-color: var(--color-danger); }
.indic__card--aside { background: transparent; }
.indic__label { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.indic__value { font-size: var(--font-size-xl, 1.5rem); font-variant-numeric: tabular-nums; }
.indic__card--deficit .indic__value { color: var(--color-danger); }
.indic__hint { color: var(--color-text-muted); font-size: var(--font-size-xs); }
.indic__flag {
  align-self: flex-start;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-danger);
  color: white;
  font-size: var(--font-size-xs);
  font-weight: 600;
}
</style>
