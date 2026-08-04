<script setup lang="ts">
import { useSasConfig } from '~/composables/useSasConfig'
import { useApiError } from '~/composables/useApiError'
import type { SasConfigInput } from '~~/shared/services/dividend-capacity'
import type { SasConfigPatch } from '~~/shared/schemas/sas-config.schema'

const { data, pending, error, update } = useSasConfig()
const { mapError } = useApiError()

// État par panneau : deux enregistrements rapprochés ne doivent ni écraser l'erreur de
// l'autre, ni éteindre son indicateur « Envoi… » (revue 2026-08-04).
const savingPanels = ref<Set<string>>(new Set())
const panelErrors = ref<Record<string, string>>({})
const isSaving = (panel: string) => savingPanels.value.has(panel)

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))
const actionErrors = computed(() => Object.values(panelErrors.value))

// Valeurs cents courantes (alimentées en live par SasConfigForm), `null` si saisie invalide.
const liveInput = ref<SasConfigInput | null>(null)

async function onSave(panel: string, patch: SasConfigPatch) {
  const { [panel]: _dropped, ...rest } = panelErrors.value
  panelErrors.value = rest
  savingPanels.value = new Set(savingPanels.value).add(panel)
  const outcome = await update(patch)
  const next = new Set(savingPanels.value)
  next.delete(panel)
  savingPanels.value = next
  if (outcome.error) panelErrors.value = { ...panelErrors.value, [panel]: outcome.error }
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
      v-for="msg in actionErrors"
      :key="msg"
      class="sas-page__error"
      role="alert"
    >
      {{ msg }}
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
          :saving="isSaving('config')"
          @change="val => liveInput = val"
          @save="patch => onSave('config', patch)"
        />
        <FiscalYearForm
          :fiscal-year-end-date="data.fiscalYearEndDate"
          :saving="isSaving('fiscal')"
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
