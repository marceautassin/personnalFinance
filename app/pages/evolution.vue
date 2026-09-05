<script setup lang="ts">
import { useEvolution } from '~/composables/useEvolution'
import { useApiError } from '~/composables/useApiError'
import { GRANULARITIES, type Granularity } from '~~/shared/types/granularity'
import { formatEuros, type Cents } from '~~/shared/types/money'

const route = useRoute()
const router = useRouter()

const initialGranularity = GRANULARITIES.includes(route.query.g as Granularity)
  ? (route.query.g as Granularity)
  : 'month'

const { data, pending, error, bucket, granularity, target, label, shift, setGranularity }
  = useEvolution(typeof route.query.p === 'string' ? route.query.p : undefined, initialGranularity)

if (typeof route.query.t === 'string') target.value = route.query.t

const { mapError } = useApiError()
const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

watch([bucket, granularity, target], () => {
  router.replace({
    query: { p: bucket.value, g: granularity.value, ...(target.value ? { t: target.value } : {}) },
  })
})

const GRANULARITY_LABELS: Record<Granularity, string> = {
  month: 'Mois',
  quarter: 'Trimestre',
  year: 'Année',
}

const cumulativePoints = computed(() =>
  (data.value?.series ?? []).map(p => ({ bucket: p.bucket, label: p.label, value: p.cumulativeResultCents })),
)

/**
 * Orientation de la courbe de la cible.
 *
 * Les dépenses sont stockées en négatif (D28, le signe est un fait bancaire). Tracées telles
 * quelles, dépenser DAVANTAGE faisait DESCENDRE la courbe — l'inverse de ce que tout le monde
 * lit, et le défaut remonté à la recette du 2026-09-05. On retourne donc l'affichage d'un poste
 * de dépense pour que « plus haut » veuille dire « plus dépensé ».
 *
 * Le retournement vit ICI, dans la couche de rendu, et jamais dans le moteur : `analysis-engine`
 * reste en somme algébrique sans `Math.abs`. Le tableau sous le graphique garde, lui, le montant
 * signé tel qu'il est en base.
 */
const targetInverted = computed(() => data.value?.targetNature === 'expense')

const targetPoints = computed(() => {
  const sign = targetInverted.value ? -1 : 1
  return (data.value?.targetSeries ?? []).map(p => ({
    bucket: p.bucket,
    label: p.label,
    value: p.totalCents * sign,
  }))
})

const targetValueLabel = computed(() => (targetInverted.value ? 'Dépense' : 'Montant'))

/**
 * Écart entre la première et la dernière tranche — la dérive, chiffrée, dans le même sens que
 * la courbe : pour une dépense, un écart positif signifie « on dépense plus qu'au début ».
 */
const targetDrift = computed(() => {
  const points = targetPoints.value
  if (points.length < 2) return null
  return (points.at(-1)!.value - points[0]!.value) as Cents
})
</script>

<template>
  <section class="evo-page">
    <header class="evo-page__header">
      <div>
        <h2 class="evo-page__title">
          Évolution
        </h2>
        <p class="evo-page__lead">
          Les douze dernières tranches, jusqu'à {{ label }}.
        </p>
      </div>

      <div class="evo-page__period">
        <button
          type="button"
          class="evo-page__nav"
          aria-label="Tranche précédente"
          @click="shift(-1)"
        >
          ‹
        </button>
        <strong class="evo-page__label">{{ label }}</strong>
        <button
          type="button"
          class="evo-page__nav"
          aria-label="Tranche suivante"
          @click="shift(1)"
        >
          ›
        </button>

        <label class="evo-page__field">
          <span>Pas</span>
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
      class="evo-page__error"
      role="alert"
    >
      {{ fetchErrorMessage }}
    </p>
    <p
      v-if="pending && !data"
      class="evo-page__pending"
    >
      Chargement…
    </p>

    <template v-else-if="data">
      <section aria-labelledby="flow-heading">
        <h3
          id="flow-heading"
          class="evo-page__section"
        >
          Recettes et dépenses
        </h3>
        <FlowChart :series="data.series" />
        <!--
          Le tableau n'est pas un doublon du graphique : c'est SA version lisible. Les SVG sont
          en `aria-hidden`, et c'est ici que le clavier et le lecteur d'écran trouvent les
          valeurs. La grille en trois colonnes qu'il remplace ne correspondait à aucune barre.
        -->
        <table class="evo-page__table">
          <caption class="evo-page__caption">
            Recettes, dépenses, résultat et trésorerie cumulée par tranche
          </caption>
          <thead>
            <tr>
              <th scope="col">
                Période
              </th>
              <th scope="col">
                Recettes
              </th>
              <th scope="col">
                Dépenses
              </th>
              <th scope="col">
                Résultat
              </th>
              <th scope="col">
                Trésorerie cumulée
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="point in data.series"
              :key="point.bucket"
              :data-testid="`evo-row-${point.bucket}`"
            >
              <th scope="row">
                {{ point.label }}
              </th>
              <td>{{ formatEuros(point.incomeCents as Cents) }}</td>
              <td>{{ formatEuros(point.expenseCents as Cents) }}</td>
              <td :class="{ 'evo-page__neg': point.resultCents < 0 }">
                {{ formatEuros(point.resultCents as Cents) }}
              </td>
              <td :class="{ 'evo-page__neg': point.cumulativeResultCents < 0 }">
                {{ formatEuros(point.cumulativeResultCents as Cents) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="cumul-heading">
        <h3
          id="cumul-heading"
          class="evo-page__section"
        >
          Trésorerie cumulée
        </h3>
        <TrendChart
          :points="cumulativePoints"
          value-label="Trésorerie cumulée"
          filled
        />
      </section>

      <section aria-labelledby="target-heading">
        <div class="evo-page__target-header">
          <h3
            id="target-heading"
            class="evo-page__section"
          >
            Suivre une rubrique ou un poste
          </h3>
          <label class="evo-page__field">
            <span class="evo-page__field-label">Cible</span>
            <select v-model="target">
              <option value="">
                Choisir…
              </option>
              <optgroup
                v-for="group in data.groups"
                :key="group.code"
                :label="group.label"
              >
                <option :value="`group:${group.code}`">
                  {{ group.label }} — toute la rubrique
                </option>
                <option
                  v-for="item in group.items"
                  :key="item.code"
                  :value="`item:${item.code}`"
                >
                  {{ item.label }}
                </option>
              </optgroup>
            </select>
          </label>
        </div>

        <p
          v-if="!data.targetSeries"
          class="evo-page__pending"
        >
          Choisis une rubrique ou un poste pour voir sa trajectoire sur les douze tranches.
        </p>
        <template v-else>
          <p class="evo-page__target-summary">
            <strong>{{ data.targetLabel ?? 'Cible inconnue' }}</strong>
            <template v-if="targetDrift !== null">
              · écart entre la première et la dernière tranche :
              <span :class="{ 'evo-page__neg': targetInverted ? targetDrift > 0 : targetDrift < 0 }">{{ formatEuros(targetDrift) }}</span>
            </template>
          </p>
          <TrendChart
            :points="targetPoints"
            :value-label="targetValueLabel"
          />
          <p
            v-if="targetInverted"
            class="evo-page__hint"
          >
            Poste de dépense : la courbe monte quand on dépense davantage. Le tableau ci-dessous
            garde le montant signé tel qu'il figure sur les relevés.
          </p>
          <table class="evo-page__table">
            <caption class="evo-page__caption">
              Montant par tranche pour {{ data.targetLabel }}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Période
                </th>
                <th scope="col">
                  Montant
                </th>
                <th scope="col">
                  Transactions
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="point in data.targetSeries"
                :key="point.bucket"
              >
                <th scope="row">
                  {{ point.label }}
                </th>
                <td :class="{ 'evo-page__neg': point.totalCents < 0 }">
                  {{ formatEuros(point.totalCents as Cents) }}
                </td>
                <td>{{ point.transactionCount }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </section>
    </template>
  </section>
</template>

<style scoped>
.evo-page { display: flex; flex-direction: column; gap: var(--space-6); }
.evo-page__header { display: flex; align-items: flex-start; gap: var(--space-4); flex-wrap: wrap; }
.evo-page__title { margin: 0; font-size: var(--font-size-xl, 1.5rem); }
.evo-page__lead { margin: var(--space-1) 0 0; color: var(--color-text-muted); }
.evo-page__section { margin: 0 0 var(--space-2); font-size: var(--font-size-lg); }
.evo-page__period { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
.evo-page__nav {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
  color: inherit;
  font: inherit;
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
}
.evo-page__label { min-width: 9rem; text-align: center; }
.evo-page__field { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); }
.evo-page__field span { color: var(--color-text-muted); }
.evo-page__field select {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
.evo-page__target-header { display: flex; align-items: baseline; gap: var(--space-4); flex-wrap: wrap; }
.evo-page__target-header .evo-page__field { margin-left: auto; }
.evo-page__target-summary { margin: 0 0 var(--space-2); color: var(--color-text-muted); }
.evo-page__error {
  margin: 0;
  padding: var(--space-3);
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.evo-page__pending { color: var(--color-text-muted); }
.evo-page__hint { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.evo-page__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
  margin-top: var(--space-3);
}
.evo-page__caption {
  text-align: left;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  padding-bottom: var(--space-1);
}
.evo-page__table th,
.evo-page__table td {
  padding: var(--space-1) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.evo-page__table thead th { color: var(--color-text-muted); font-weight: 500; }
.evo-page__table th[scope='row'] { text-align: left; font-weight: 400; }
.evo-page__table thead th:first-child { text-align: left; }
.evo-page__neg { color: var(--color-danger); }
</style>
