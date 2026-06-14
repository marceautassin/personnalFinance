<script setup lang="ts">
import { useRevenueModel } from '~/composables/useRevenueModel'
import { useApiError } from '~/composables/useApiError'
import type { RevenueModelPatch } from '~~/shared/schemas/revenue-model.schema'

const { data, pending, error, update } = useRevenueModel()
const { mapError } = useApiError()

const savingPanel = ref<string | null>(null)
const actionError = ref<string | null>(null)

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

async function onSave(panel: string, patch: RevenueModelPatch) {
  actionError.value = null
  savingPanel.value = panel
  const outcome = await update(patch)
  savingPanel.value = null
  if (outcome.error) actionError.value = outcome.error
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
      v-if="actionError"
      class="revenues-page__error"
      role="alert"
    >
      {{ actionError }}
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
        :saving="savingPanel === 'are'"
        @save="patch => onSave('are', patch)"
      />
      <SasRentPanel
        :monthly-cents="data.sasMonthlyRentCents"
        :saving="savingPanel === 'sas'"
        @save="patch => onSave('sas', patch)"
      />
      <ReimbursementsPanel
        :monthly-cents="data.expenseReimbursementsMonthlyCents"
        :saving="savingPanel === 'reimbursements'"
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
