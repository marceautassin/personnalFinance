<script setup lang="ts">
import { useTaxSettings } from '~/composables/useTaxSettings'
import { useApiError } from '~/composables/useApiError'
import type { TaxSettingsPatch } from '~~/shared/schemas/tax-settings.schema'

const { data, pending, error, update } = useTaxSettings()
const { mapError } = useApiError()

const saving = ref(false)
const actionError = ref<string | null>(null)

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

async function onSave(patch: TaxSettingsPatch) {
  actionError.value = null
  saving.value = true
  const outcome = await update(patch)
  saving.value = false
  if (outcome.error) actionError.value = outcome.error
}
</script>

<template>
  <section class="params-page">
    <header class="params-page__header">
      <h2 class="params-page__title">
        Paramètres — fiscalité
      </h2>
    </header>

    <p
      v-if="actionError"
      class="params-page__error"
      role="alert"
    >
      {{ actionError }}
    </p>
    <p
      v-if="fetchErrorMessage"
      class="params-page__error"
      role="alert"
    >
      {{ fetchErrorMessage }}
    </p>

    <p
      v-if="pending && !data"
      class="params-page__pending"
    >
      Chargement…
    </p>

    <div
      v-else-if="data"
      class="params-page__forms"
    >
      <TaxSettingsForm
        :dividend-tax-rate-pct="data.dividendTaxRatePct"
        :dividend-tax-mode="data.dividendTaxMode"
        :saving="saving"
        @save="onSave"
      />
    </div>
  </section>
</template>

<style scoped>
.params-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.params-page__title { margin: 0; font-size: var(--font-size-xl, 1.5rem); }
.params-page__forms {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  align-items: start;
}
.params-page__error {
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
  color: var(--color-danger);
}
.params-page__pending { color: var(--color-text-muted); }
</style>
