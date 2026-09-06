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
 * Couleur de la dérive, orientée par la NATURE de la cible.
 *
 * Sur un mouvement interne, ni la hausse ni la baisse n'est favorable : un virement peut aller
 * dans les deux sens et aucun des deux n'est anormal. `DistributionChart` traite déjà ce cas ;
 * cette page le rendait rouge ou vert au hasard du signe (revue du 2026-09-05).
 */
const driftClass = computed(() => {
  const drift = targetDrift.value
  if (drift === null || data.value?.targetNature === 'internal_transfer') return undefined
  const alarming = targetInverted.value ? drift > 0 : drift < 0
  return alarming ? 'evo-page__neg' : undefined
})

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
    <header class="page-head">
      <h2 class="page-head__title">
        Évolution
      </h2>
      <span class="page-head__sub">Les douze dernières tranches, jusqu'à {{ label }}</span>

      <div class="evo-page__period">
        <div class="stepper">
          <button
            type="button"
            class="stepper__btn"
            aria-label="Tranche précédente"
            @click="shift(-1)"
          >
            ‹
          </button>
          <strong class="stepper__label evo-page__label">{{ label }}</strong>
          <button
            type="button"
            class="stepper__btn"
            aria-label="Tranche suivante"
            @click="shift(1)"
          >
            ›
          </button>
        </div>

        <label class="evo-page__field">
          <span>Pas</span>
          <select
            class="select select--sm"
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
      class="notice"
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
        <table class="table table--framed evo-page__table">
          <caption class="table__caption">
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
              class="evo-page__clickable"
            >
              <th scope="row">
                <NuxtLink
                  class="evo-page__jump"
                  :to="{ path: '/analyse', query: { p: point.bucket, g: granularity } }"
                  :aria-label="`Analyser ${point.label}`"
                >{{ point.label }}</NuxtLink>
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
            <select
              v-model="target"
              class="select select--sm"
            >
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
              <span :class="driftClass">{{ formatEuros(targetDrift) }}</span>
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
          <table class="table table--framed evo-page__table">
            <caption class="table__caption">
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
                class="evo-page__clickable"
              >
                <th scope="row">
                  <NuxtLink
                    class="evo-page__jump"
                    :to="{ path: '/analyse', query: { p: point.bucket, g: granularity } }"
                    :aria-label="`Analyser ${point.label}`"
                  >{{ point.label }}</NuxtLink>
                </th>
                <!--
                  Montant NEUTRE : sur une cible de dépense, les douze lignes sont négatives et
                  les peindre toutes en rouge ne distingue plus rien (revue du 2026-09-05). Le
                  signal orienté est porté par l'écart, au-dessus du graphique.
                -->
                <td>
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
.evo-page__section { margin: 0 0 var(--space-2); font-size: var(--font-size-md); }
.evo-page__period { display: flex; align-items: center; gap: var(--space-3); margin-left: auto; }
.evo-page__label { min-width: 9rem; }
.evo-page__field { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); }
.evo-page__field span { color: var(--color-text-muted); }
.evo-page__target-header { display: flex; align-items: baseline; gap: var(--space-4); flex-wrap: wrap; }
.evo-page__target-header .evo-page__field { margin-left: auto; }
.evo-page__target-summary { margin: 0 0 var(--space-2); color: var(--color-text-muted); font-size: var(--font-size-sm); }
.evo-page__pending { color: var(--color-text-muted); }
.evo-page__hint { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }

/* Le tableau reprend la primitive partagée. Ne subsistent ici que le cadre et l'alignement à
   droite d'ensemble — toutes ses colonnes sauf la première portent des nombres. */
/* Le cadre vient de `.table--framed` : un `overflow` ici ferait du tableau le scrollport de
   son propre en-tête collant, qui cesserait alors de coller. */
.evo-page__table { margin-top: var(--space-3); }
.evo-page__table td { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.evo-page__table thead th { text-align: right; }
.evo-page__table thead th:first-child { text-align: left; }
.evo-page__table th[scope='row'] { text-align: left; font-family: var(--font-sans); }
/*
  Ligne cliquable : UN SEUL lien, étiré sur toute la rangée par `::after` (demande du
  2026-09-06). Un gestionnaire de clic sur la `<tr>` donnerait la même zone de clic, mais une
  rangée n'est pas un lien : ni focus au clavier, ni ouverture dans un onglet, ni annonce par
  un lecteur d'écran. Si `position: relative` sur `tr` n'est pas honoré, seule la cellule de
  période reste cliquable — dégradation acceptable, jamais une régression.
*/
.evo-page__clickable { position: relative; }
.evo-page__clickable:hover { background: var(--color-bg-subtle, var(--color-accent-subtle)); }
.evo-page__jump { color: inherit; text-decoration: none; }
.evo-page__jump::after { content: ''; position: absolute; inset: 0; }
.evo-page__clickable:focus-within { outline: 2px solid var(--color-accent); outline-offset: -2px; }

.evo-page__neg { color: var(--color-danger); }
</style>
