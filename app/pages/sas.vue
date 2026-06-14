<script setup lang="ts">
import { useSasConfig } from '~/composables/useSasConfig'
import { useApiError } from '~/composables/useApiError'
import type { SasConfigInput } from '~~/shared/services/dividend-capacity'
import type { SasConfigPatch } from '~~/shared/schemas/sas-config.schema'
import type { Cents } from '~~/shared/types/money'

const { data, pending, error, update } = useSasConfig()
const { mapError } = useApiError()

const savingPanel = ref<string | null>(null)
const actionError = ref<string | null>(null)

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

// Valeurs cents courantes (alimentées en live par SasConfigForm) pour la card.
const liveInput = ref<SasConfigInput>({
  revenueForecastCents: 0 as Cents,
  expensesForecastCents: 0 as Cents,
  currentTreasuryCents: 0 as Cents,
  isRatePct: 0,
})

async function onSave(panel: string, patch: SasConfigPatch) {
  actionError.value = null
  savingPanel.value = panel
  const outcome = await update(patch)
  savingPanel.value = null
  if (outcome.error) actionError.value = outcome.error
}
</script>

<template>
  <section class="sas-page">
    <header class="sas-page__header">
      <h2 class="sas-page__title">
        SAS — données fiscales
      </h2>
    </header>

    <p
      v-if="actionError"
      class="sas-page__error"
      role="alert"
    >
      {{ actionError }}
    </p>
    <p
      v-if="fetchErrorMessage"
      class="sas-page__error"
      role="alert"
    >
      {{ fetchErrorMessage }}
    </p>

    <p
      v-if="pending && !data"
      class="sas-page__pending"
    >
      Chargement…
    </p>

    <div
      v-else-if="data"
      class="sas-page__grid"
    >
      <div class="sas-page__forms">
        <SasConfigForm
          :revenue-forecast-cents="data.revenueForecastCents"
          :expenses-forecast-cents="data.expensesForecastCents"
          :current-treasury-cents="data.currentTreasuryCents"
          :is-rate-pct="data.isRatePct"
          :saving="savingPanel === 'config'"
          @change="val => liveInput = val"
          @save="patch => onSave('config', patch)"
        />
        <FiscalYearForm
          :fiscal-year-end-date="data.fiscalYearEndDate"
          :saving="savingPanel === 'fiscal'"
          @save="patch => onSave('fiscal', patch)"
        />
      </div>

      <DividendCapacityCard :input="liveInput" />
    </div>
  </section>
</template>

<style scoped>
.sas-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.sas-page__title { margin: 0; font-size: var(--font-size-xl, 1.5rem); }
.sas-page__grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  align-items: start;
}
.sas-page__forms {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.sas-page__error {
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
  color: var(--color-danger);
}
.sas-page__pending { color: var(--color-text-muted); }
</style>
