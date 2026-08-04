<script setup lang="ts">
import { useForecast } from '~/composables/useForecast'
import { useApiError } from '~/composables/useApiError'

const horizon = ref(12)
const { data, pending, error } = useForecast(horizon)
const { mapError } = useApiError()

const errorMessage = computed(() => (error.value ? mapError(error.value) : null))

const overrideOpen = ref(false)
const forecastMonths = computed(() => data.value?.forecast.months.map(m => m.month) ?? [])
</script>

<template>
  <section class="forecast-page">
    <header class="forecast-page__header">
      <h2 class="forecast-page__title">
        Forecast
      </h2>
      <HorizonSelector
        :horizon="horizon"
        @update:horizon="h => horizon = h"
      />
    </header>

    <p
      v-if="errorMessage"
      class="forecast-page__error"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <p
      v-if="pending && !data"
      class="forecast-page__pending"
    >
      Calcul du forecast…
    </p>

    <template v-else-if="data">
      <p
        v-if="data.reducedReliability"
        class="forecast-page__reliability"
        role="note"
      >
        Fiabilité réduite : moins de 3 mois de relevés ingérés, les projections variables sont
        approximatives.
      </p>

      <AreCompatibilityWarning
        v-if="data.warnings.areOverlap"
        :ag-month="data.agMonth"
        :are-end-month="data.warnings.areEndMonth"
      />

      <div class="forecast-page__chart-head">
        <ForecastSourceLegend />
        <button
          type="button"
          class="forecast-page__adjust"
          @click="overrideOpen = true"
        >
          Ajuster une catégorie
        </button>
      </div>

      <ForecastChart
        :months="data.forecast.months"
        :first-negative-month="data.forecast.firstNegativeMonth"
      />

      <p
        v-if="data.forecast.firstNegativeMonth"
        class="forecast-page__negative"
        role="alert"
      >
        ⚠️ Solde projeté négatif à partir de {{ data.forecast.firstNegativeMonth }}.
      </p>

      <DividendTargetCard
        :dividend="data.dividend"
        :ag-month="data.agMonth"
      />

      <LeversPanel
        v-if="data.levers.length"
        :levers="data.levers"
      />

      <VariableOverrideDialog
        :open="overrideOpen"
        :months="forecastMonths"
        @close="overrideOpen = false"
      />
    </template>
  </section>
</template>

<style scoped>
.forecast-page { display: flex; flex-direction: column; gap: var(--space-4); }
.forecast-page__header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.forecast-page__title { margin: 0; font-size: var(--font-size-xl, 1.5rem); }
.forecast-page__error { padding: var(--space-3); border-left: 3px solid var(--color-danger); background: var(--color-bg-elevated); border-radius: var(--radius-md); margin: 0; color: var(--color-danger); }
.forecast-page__pending, .forecast-page__reliability { color: var(--color-text-muted); }
.forecast-page__reliability { padding: var(--space-2) var(--space-3); background: var(--color-warning-bg, #fff4cc); color: var(--color-warning, #8a6500); border-radius: var(--radius-md); margin: 0; font-size: var(--font-size-sm); }
.forecast-page__negative { margin: 0; color: var(--color-danger); font-size: var(--font-size-sm); }
.forecast-page__chart-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.forecast-page__adjust { padding: var(--space-1) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-elevated); font: inherit; font-size: var(--font-size-sm); cursor: pointer; }
.forecast-page__adjust:hover { border-color: var(--color-accent); }
</style>
