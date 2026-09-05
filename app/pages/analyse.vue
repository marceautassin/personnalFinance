<script setup lang="ts">
import { useAnalysis } from '~/composables/useAnalysis'
import { useApiError } from '~/composables/useApiError'
import { GRANULARITIES, type Granularity, bucketLabel, shiftBucket } from '~~/shared/types/granularity'
import { isDegraded } from '~~/shared/types/statement-reliability'
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

/** Nom de la période à laquelle les écarts se comparent — jamais « la précédente ». */
const previousLabel = computed(() =>
  bucketLabel(shiftBucket(bucket.value, granularity.value, -1), granularity.value),
)

const income = computed(() => natureOr('income'))
const expense = computed(() => natureOr('expense'))
const internal = computed(() => natureOr('internal_transfer'))

/**
 * Descente vers les lignes sources, EN PLACE sous chaque poste (FR35, NFR2).
 *
 * L'arbre ne transporte aucune transaction : le poste et les bornes suffisent à les demander,
 * au moment où l'utilisateur les demande. C'est ce qui rend n'importe quel montant vérifiable
 * sans alourdir chaque changement de période.
 */
const itemTransactions = useItemTransactions()

function onExpandItem(itemCode: string) {
  void itemTransactions.load(itemCode, bounds.value)
}

// Changer de période vide le cache : des lignes d'un autre mois affichées sous un total qui a
// changé seraient pire que pas de lignes du tout.
watch(bounds, () => itemTransactions.reset())
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

      <p class="analyse__scope">
        <!-- Le texte est un seul nœud : en éléments séparés, le flex détachait la ponctuation. -->
        <span>Tout ce qui suit décrit <strong>{{ label }}</strong>.</span>
        <NuxtLink :to="`/evolution?p=${bucket}&g=${granularity}`">
          Voir l'évolution sur douze tranches
        </NuxtLink>
      </p>

      <div class="analyse__columns">
        <DistributionChart
          :nature="expense"
          :previous-label="previousLabel"
          :transactions-by-item="itemTransactions.byItem.value"
          :loading-items="itemTransactions.loading.value"
          :failed-items="itemTransactions.failed.value"
          title="Dépenses"
          @expand-item="onExpandItem"
        />
        <DistributionChart
          :nature="income"
          :previous-label="previousLabel"
          :transactions-by-item="itemTransactions.byItem.value"
          :loading-items="itemTransactions.loading.value"
          :failed-items="itemTransactions.failed.value"
          title="Recettes"
          @expand-item="onExpandItem"
        />
      </div>

      <!--
        Les mouvements internes sont montrés À PART (FR30) : ils n'entrent dans aucun des deux
        totaux, mais les cacher rendrait le solde bancaire incompréhensible.
      -->
      <DistributionChart
        :nature="internal"
        :previous-label="previousLabel"
        :transactions-by-item="itemTransactions.byItem.value"
        :loading-items="itemTransactions.loading.value"
        :failed-items="itemTransactions.failed.value"
        title="Mouvements internes"
        @expand-item="onExpandItem"
      />
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
/* La portée est écrite noir sur blanc : la page mélangeait auparavant la période choisie et
   une fenêtre de douze tranches, sans que rien ne le dise (recette du 2026-09-05). */
.analyse__scope {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.analyse__columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr));
  gap: var(--space-4);
}
</style>
