<script setup lang="ts">
import { useTransactions } from '~/composables/useTransactions'

// Validation du paramètre dynamique : Nuxt rejoue la guard à chaque navigation
// (re-mount ou réutilisation du composant), évitant le bypass d'un throw top-level setup.
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/
definePageMeta({
  validate: route => typeof route.params.period === 'string' && PERIOD_RE.test(route.params.period),
})

const route = useRoute()
const router = useRouter()

const period = computed(() => route.params.period as string)
const mutationError = ref<string | null>(null)

const { data, pending, mutateCategory } = useTransactions(period)

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const monthLabel = computed(() => {
  const [y, m] = period.value.split('-').map(Number)
  const label = monthFormatter.format(new Date(y!, m! - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
})

function navigate(delta: number) {
  const [y, m] = period.value.split('-').map(Number)
  const d = new Date(y!, m! - 1 + delta, 1)
  const newPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  router.push(`/transactions/${newPeriod}`)
}

async function onCategoryChange(transactionId: number, categoryCode: string) {
  mutationError.value = null
  const outcome = await mutateCategory(transactionId, categoryCode)
  if (outcome.error) mutationError.value = outcome.error
}
</script>

<template>
  <section class="tx-page">
    <header class="tx-page__header">
      <button
        type="button"
        class="tx-page__nav"
        aria-label="Mois précédent"
        @click="navigate(-1)"
      >
        ←
      </button>
      <h2 class="tx-page__title">
        {{ monthLabel }}
      </h2>
      <button
        type="button"
        class="tx-page__nav"
        aria-label="Mois suivant"
        @click="navigate(1)"
      >
        →
      </button>
    </header>

    <p
      v-if="data.reliability === 'unreliable'"
      class="tx-page__alert"
      role="alert"
    >
      ⚠️ Mois non fiable — la réconciliation a un écart résiduel.
    </p>

    <p
      v-if="mutationError"
      class="tx-page__error"
      role="alert"
    >
      {{ mutationError }}
    </p>

    <p
      v-if="pending && data.transactions.length === 0"
      class="tx-page__pending"
    >
      Chargement…
    </p>

    <div
      v-else-if="data.transactions.length === 0"
      class="tx-page__empty"
    >
      <p>Aucune transaction pour ce mois.</p>
      <NuxtLink
        to="/import"
        class="tx-page__empty-link"
      >
        Importer un relevé
      </NuxtLink>
    </div>

    <TransactionList
      v-else
      :transactions="data.transactions"
      @category-change="onCategoryChange"
    />
  </section>
</template>

<style scoped>
.tx-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.tx-page__header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
}
.tx-page__title {
  margin: 0;
  font-size: var(--font-size-xl, 1.5rem);
  min-width: 12em;
  text-align: center;
}
.tx-page__nav {
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  font: inherit;
  font-size: var(--font-size-lg, 1.125rem);
  cursor: pointer;
}
.tx-page__nav:hover { border-color: var(--color-accent); }
.tx-page__alert {
  padding: var(--space-3);
  border-left: 3px solid var(--color-warning);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
}
.tx-page__pending { color: var(--color-text-muted); }
.tx-page__error {
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger, #c53030);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
}
.tx-page__empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
  padding: var(--space-4);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
}
.tx-page__empty-link { font-weight: 500; }
</style>
