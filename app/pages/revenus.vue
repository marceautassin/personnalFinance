<script setup lang="ts">
import { useRevenueModel } from '~/composables/useRevenueModel'
import { useApiError } from '~/composables/useApiError'
import type { RevenueModelPatch } from '~~/shared/schemas/revenue-model.schema'

const { data, pending, error, update } = useRevenueModel()
const { mapError } = useApiError()

// État par panneau : deux enregistrements rapprochés ne doivent ni écraser l'erreur de
// l'autre, ni éteindre son indicateur « Envoi… » (revue 2026-08-04).
const savingPanels = ref<Set<string>>(new Set())
const panelErrors = ref<Record<string, string>>({})
const isSaving = (panel: string) => savingPanels.value.has(panel)

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))
const actionErrors = computed(() => Object.values(panelErrors.value))

async function onSave(panel: string, patch: RevenueModelPatch) {
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
  <section class="revenues-page">
    <header class="revenues-page__header">
      <h2 class="revenues-page__title">
        Revenus récurrents
      </h2>
    </header>

    <p
      v-for="msg in actionErrors"
      :key="msg"
      class="revenues-page__error"
      role="alert"
    >
      {{ msg }}
    </p>
    <p
      v-if="fetchErrorMessage"
      class="revenues-page__error"
      role="alert"
    >
      {{ fetchErrorMessage }}
    </p>

    <p
      v-if="pending && !data"
      class="revenues-page__pending"
    >
      Chargement…
    </p>

    <div
      v-else-if="data"
      class="revenues-page__panels"
    >
      <ArePanel
        :monthly-cents="data.unemploymentBenefitMonthlyCents"
        :end-date="data.unemploymentBenefitEndDate"
        :saving="isSaving('are')"
        @save="patch => onSave('are', patch)"
      />
      <SasRentPanel
        :monthly-cents="data.sasMonthlyRentCents"
        :saving="isSaving('sas')"
        @save="patch => onSave('sas', patch)"
      />
      <ReimbursementsPanel
        :monthly-cents="data.expenseReimbursementsMonthlyCents"
        :saving="isSaving('reimbursements')"
        @save="patch => onSave('reimbursements', patch)"
      />
    </div>
  </section>
</template>

<style scoped>
.revenues-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.revenues-page__title { margin: 0; font-size: var(--font-size-xl, 1.5rem); }
.revenues-page__panels {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
}
.revenues-page__error {
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
  color: var(--color-danger);
}
.revenues-page__pending { color: var(--color-text-muted); }
</style>
