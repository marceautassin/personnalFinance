<script setup lang="ts">
import { useAnalysis } from '~/composables/useAnalysis'
import { useApiError } from '~/composables/useApiError'
import { GRANULARITIES, type Granularity } from '~~/shared/types/granularity'
import { isDegraded } from '~~/shared/types/statement-reliability'
import { formatEuros, type Cents } from '~~/shared/types/money'
import type { MovementNature } from '~~/shared/types/movement-nature'
import type { AnalysisResponse } from '~/composables/useAnalysis'

type AnalysisNature = AnalysisResponse['natures'][number]

const route = useRoute()
const router = useRouter()

const initialGranularity = GRANULARITIES.includes(route.query.g as Granularity)
  ? (route.query.g as Granularity)
  : 'month'

const {
  data,
  pending,
  error,
  bucket,
  granularity,
  bounds,
  label,
  shift,
  setGranularity,
} = useAnalysis(typeof route.query.p === 'string' ? route.query.p : undefined, initialGranularity)

const { mapError } = useApiError()
const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

// L'URL porte la période : un lien vers « avril 2026 » doit rouvrir avril 2026.
watch([bucket, granularity], () => {
  router.replace({ query: { p: bucket.value, g: granularity.value } })
})

const GRANULARITY_LABELS: Record<Granularity, string> = {
  month: 'Mois',
  quarter: 'Trimestre',
  year: 'Année',
}

/**
 * Une nature absente de l'arbre — aucun mouvement de ce type sur la période — est rendue par
 * un nœud vide plutôt que masquée : voir « Recettes : aucun mouvement » est une information,
 * une colonne qui disparaît en est une autre, et elle inquiète pour rien.
 */
function natureOr(nature: MovementNature): AnalysisNature {
  return data.value?.natures.find(n => n.nature === nature)
    ?? { nature, totalCents: 0 as Cents, previousTotalCents: null, groups: [] }
}

const income = computed(() => natureOr('income'))
const expense = computed(() => natureOr('expense'))
const internal = computed(() => natureOr('internal_transfer'))

/**
 * Descente vers les lignes sources (FR35, NFR2).
 *
 * L'arbre ne transporte aucune transaction : le poste et les bornes suffisent à les demander.
 * C'est ce qui rend n'importe quel montant affiché vérifiable sans alourdir chaque changement
 * de période.
 */
const drill = ref<{ itemCode: string, label: string } | null>(null)
const drillState = useTransactionsRange()

async function onDrill(itemCode: string, itemLabel: string) {
  drill.value = { itemCode, label: itemLabel }
  await drillState.load(bounds.value, itemCode)
}

function closeDrill() {
  drill.value = null
  drillState.reset()
}

// Changer de période referme la descente : garder à l'écran les lignes d'un autre mois sous
// un titre qui a changé serait pire que de ne rien montrer.
watch(bounds, () => {
  if (drill.value) closeDrill()
})

/** Somme des lignes affichées : elle doit retomber sur le montant du nœud d'où l'on vient. */
const drillTotal = computed(() =>
  drillState.data.value.transactions.reduce((sum, t) => sum + t.amountCents, 0) as Cents,
)
</script>

<template>
  <section class="analyse">
    <header class="analyse__header">
      <h2 class="analyse__title">
        Analyse
      </h2>

      <div class="analyse__period">
        <button
          type="button"
          class="analyse__nav"
          aria-label="Période précédente"
          @click="shift(-1)"
        >
          ‹
        </button>
        <strong class="analyse__label">{{ label }}</strong>
        <button
          type="button"
          class="analyse__nav"
          aria-label="Période suivante"
          @click="shift(1)"
        >
          ›
        </button>

        <label class="analyse__granularity">
          <span class="analyse__granularity-label">Granularité</span>
          <select
            :value="granularity"
            @change="setGranularity(($event.target as HTMLSelectElement).value as Granularity)"
          >
            <option
              v-for="g in GRANULARITIES"
              :key="g"
              :value="g"
            >
              {{ GRANULARITY_LABELS[g] }}
            </option>
          </select>
        </label>
      </div>
    </header>

    <p
      v-if="fetchErrorMessage"
      class="analyse__error"
      role="alert"
    >
      {{ fetchErrorMessage }}
    </p>

    <p
      v-if="pending && !data"
      class="analyse__pending"
    >
      Chargement…
    </p>

    <template v-else-if="data">
      <!--
        La fiabilité est portée par la PÉRIODE (D23) : un seul relevé bancal contamine tous les
        totaux affichés ici, et le taire donnerait à des chiffres faux l'apparence du normal.
      -->
      <div
        v-if="isDegraded(data.reliability)"
        class="analyse__alert"
        :role="data.reliability === 'gap_unreviewed' ? 'alert' : 'status'"
      >
        <ReliabilityBadge :reliability="data.reliability" />
        <span>
          {{ data.unreliableStatements.length }} relevé(s) de cette période présentent un écart —
          les totaux ci-dessous en héritent.
        </span>
        <NuxtLink
          v-if="data.unreliableStatements[0]"
          :to="`/reconciliation/${data.unreliableStatements[0].hash}`"
        >
          Examiner
        </NuxtLink>
      </div>

      <p
        v-if="data.orphanCount > 0"
        class="analyse__alert"
        role="alert"
      >
        {{ data.orphanCount }} transaction(s) référencent un poste supprimé et ne sont comptées
        nulle part.
      </p>

      <AnalysisIndicators
        :indicators="data.indicators"
        :bank-balance="data.bankBalance"
        :from="data.from"
        :to="data.to"
      />

      <EvolutionChart :series="data.series" />

      <div class="analyse__columns">
        <DistributionChart
          :nature="expense"
          title="Dépenses"
          @drill="onDrill"
        />
        <DistributionChart
          :nature="income"
          title="Recettes"
          @drill="onDrill"
        />
      </div>

      <!--
        Les mouvements internes sont montrés À PART (FR30) : ils n'entrent dans aucun des deux
        totaux, mais les cacher rendrait le solde bancaire incompréhensible.
      -->
      <DistributionChart
        :nature="internal"
        title="Mouvements internes"
        @drill="onDrill"
      />

      <section
        v-if="drill"
        class="analyse__drill"
        aria-labelledby="drill-heading"
      >
        <header class="analyse__drill-header">
          <h3
            id="drill-heading"
            class="analyse__drill-title"
          >
            {{ drill.label }}
          </h3>
          <span class="analyse__drill-total">{{ formatEuros(drillTotal) }}</span>
          <button
            type="button"
            class="analyse__drill-close"
            @click="closeDrill"
          >
            Fermer
          </button>
        </header>
        <ul class="analyse__drill-list">
          <li
            v-for="tx in drillState.data.value.transactions"
            :key="tx.id"
            class="analyse__drill-row"
          >
            <span>{{ tx.transactionDate }}</span>
            <span class="analyse__drill-label">{{ tx.label }}</span>
            <span class="analyse__drill-amount">{{ formatEuros(tx.amountCents as Cents) }}</span>
            <NuxtLink
              :to="`/reconciliation/${tx.statementHash}`"
              class="analyse__drill-source"
            >
              relevé
            </NuxtLink>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.analyse { display: flex; flex-direction: column; gap: var(--space-4); }
.analyse__header { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; }
.analyse__title { margin: 0; font-size: var(--font-size-xl, 1.5rem); }
.analyse__period { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
.analyse__nav {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
  color: inherit;
  font: inherit;
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
}
.analyse__label { min-width: 9rem; text-align: center; }
.analyse__granularity { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); }
.analyse__granularity-label { color: var(--color-text-muted); }
.analyse__granularity select {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
.analyse__error, .analyse__alert {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin: 0;
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.analyse__pending { color: var(--color-text-muted); }
.analyse__columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr));
  gap: var(--space-4);
}
.analyse__drill {
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}
.analyse__drill-header { display: flex; align-items: baseline; gap: var(--space-3); }
.analyse__drill-title { margin: 0; font-size: var(--font-size-lg); }
.analyse__drill-total { font-variant-numeric: tabular-nums; margin-left: auto; }
.analyse__drill-close { border: none; background: none; font: inherit; color: var(--color-accent); cursor: pointer; }
.analyse__drill-list { list-style: none; margin: var(--space-2) 0 0; padding: 0; }
.analyse__drill-row {
  display: grid;
  grid-template-columns: 6rem 1fr 7rem 4rem;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
}
.analyse__drill-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.analyse__drill-amount { text-align: right; font-variant-numeric: tabular-nums; }
.analyse__drill-source { text-align: right; }
</style>
