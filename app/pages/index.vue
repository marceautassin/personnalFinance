<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '~/composables/useDashboard'
import { useStatementsList } from '~/composables/useStatements'
import { useApiError } from '~/composables/useApiError'

const route = useRoute()
const router = useRouter()
const { mapError } = useApiError()

const { data: statementsData, pending: statementsPending } = useStatementsList()

const hasStatements = computed(() => statementsData.value.statements.length > 0)

// Mois par défaut : le plus récent ingéré, sinon le mois courant (l'API renverra l'état vide).
const currentMonth = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
const defaultMonth = computed(() => statementsData.value.statements[0]?.periodEnd.slice(0, 7) ?? currentMonth())

// Mois sélectionné ↔ URL (?month=YYYY-MM) : bookmarkable, navigable back/forward (FR40).
const monthRef = computed({
  get: () => (route.query.month as string) || defaultMonth.value,
  set: (m: string) => router.push({ query: { ...route.query, month: m } }),
})

const { data, pending, error } = useDashboard(monthRef)

const errorMessage = computed(() => (error.value ? mapError(error.value) : null))
</script>

<template>
  <section class="dashboard">
    <h1 class="dashboard__title">
      Tableau de bord
    </h1>

    <!-- État vide : aucun relevé ingéré -->
    <div
      v-if="!statementsPending && !hasStatements"
      class="dashboard__empty"
    >
      <h2 class="dashboard__empty-title">
        Aucun relevé importé
      </h2>
      <p>Importe ton premier relevé Boursorama pour voir apparaître ton dashboard.</p>
      <NuxtLink
        to="/import"
        class="dashboard__empty-cta"
      >
        Importer un relevé
      </NuxtLink>
    </div>

    <template v-else-if="hasStatements">
      <MonthSelector v-model="monthRef" />

      <p
        v-if="errorMessage"
        class="dashboard__error"
        role="alert"
      >
        {{ errorMessage }}
      </p>

      <p
        v-else-if="pending && !data.month"
        class="dashboard__pending"
      >
        Chargement…
      </p>

      <template v-else>
        <BalanceSummary
          :balance-cents="data.balanceCents"
          :income-cents="data.totals.incomeCents"
          :expense-cents="data.totals.expenseCents"
        />

        <MonthlyNarrative :phrases="data.phrases" />

        <div
          v-if="data.reliability === 'unreliable'"
          class="dashboard__alert"
          role="alert"
        >
          <ReliabilityBadge :reliability="data.reliability" />
          <span class="dashboard__alert-hint">Les chiffres de ce mois peuvent être inexacts.</span>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: var(--content-max);
}
.dashboard__title {
  margin: 0;
  font-size: var(--font-size-2xl, 1.75rem);
}
.dashboard__empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-6);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
}
.dashboard__empty-title {
  margin: 0;
  font-size: var(--font-size-xl, 1.5rem);
}
.dashboard__empty-cta {
  display: inline-block;
  background: var(--color-accent);
  color: white;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-weight: 500;
  transition: background-color var(--transition-fast);
}
.dashboard__empty-cta:hover { background: var(--color-accent-hover); }
.dashboard__pending { color: var(--color-text-muted); }
.dashboard__error {
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger, #c53030);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
}
.dashboard__alert {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-left: 3px solid var(--color-warning);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
}
.dashboard__alert-hint { color: var(--color-text-muted); font-size: var(--font-size-sm); }
</style>
