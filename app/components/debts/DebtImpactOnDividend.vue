<script setup lang="ts">
import { formatEuros } from '~~/shared/types/money'
import { useDebtImpact } from '~/composables/useDebtImpact'
import { useApiError } from '~/composables/useApiError'

const props = defineProps<{ debtId: number }>()

const { data, pending, error } = useDebtImpact(props.debtId)
const { mapError } = useApiError()

const HORIZONS = [6, 12, 24] as const
const errorMessage = computed(() => (error.value ? mapError(error.value) : null))
</script>

<template>
  <div class="debt-impact">
    <p
      v-if="pending && !data"
      class="debt-impact__pending"
    >
      Calcul…
    </p>
    <p
      v-else-if="errorMessage"
      class="debt-impact__error"
      role="alert"
    >
      {{ errorMessage }}
    </p>
    <template v-else-if="data">
      <ul class="debt-impact__list">
        <li
          v-for="h in HORIZONS"
          :key="h"
        >
          <span class="debt-impact__horizon">{{ h }} mois</span>
          <span class="debt-impact__amount">{{ formatEuros(data.horizonsCents[h]) }}</span>
        </li>
      </ul>
      <p class="debt-impact__note">
        Impact sur les dépenses futures. Le calcul du dividende net correspondant arrive avec le
        forecast (à venir).
      </p>
    </template>
  </div>
</template>

<style scoped>
.debt-impact {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--color-border);
}
.debt-impact__list { list-style: none; margin: 0; padding: 0; display: flex; gap: var(--space-3); flex-wrap: wrap; }
.debt-impact__list li { display: flex; flex-direction: column; }
.debt-impact__horizon { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.debt-impact__amount { font-variant-numeric: tabular-nums; font-weight: var(--font-weight-medium, 500); }
.debt-impact__note { margin: var(--space-2) 0 0; font-size: var(--font-size-xs); color: var(--color-text-muted); }
.debt-impact__pending { color: var(--color-text-muted); font-size: var(--font-size-sm); margin: 0; }
.debt-impact__error { color: var(--color-danger); font-size: var(--font-size-sm); margin: 0; }
</style>
