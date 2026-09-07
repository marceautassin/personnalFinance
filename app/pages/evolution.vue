<script setup lang="ts">
import { useEvolution } from '~/composables/useEvolution'
import { useApiError } from '~/composables/useApiError'
import { bucketBounds } from '~~/shared/types/granularity'
import { EVOLUTION_VIEW_LABELS, type EvolutionView } from '~/composables/useEvolution'
import { useTargetTransactions } from '~/composables/useTargetTransactions'
import { formatDate } from '~/utils/dates'
import { formatEuros, type Cents } from '~~/shared/types/money'

const route = useRoute()
const router = useRouter()

const { data, pending, error, period, view, target, label, canShift, shift, setView }
  = useEvolution(typeof route.query.p === 'string' ? route.query.p : undefined)

if (typeof route.query.t === 'string') target.value = route.query.t

const { mapError } = useApiError()
const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

watch([period, target], () => {
  router.replace({
    query: { p: period.value, ...(target.value ? { t: target.value } : {}) },
  })
})

const VIEWS: EvolutionView[] = ['quarter', 'year', 'all']

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
    // `0 * -1` vaut `-0`, que `formatEuros` rend « -0,00 € » sur les tranches vides.
    value: p.totalCents === 0 ? 0 : p.totalCents * sign,
    // La répartition subit la MÊME orientation que la valeur : mélanger une dépense affichée
    // en positif et ses postes en négatif rendrait l'infobulle illisible.
    breakdown: p.breakdown.map(b => ({ label: b.label, totalCents: b.totalCents * sign })),
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
 * Descente vers les lignes d'une tranche de la cible (story 16.5).
 *
 * Le graphique montrait une trajectoire sans qu'on puisse l'ouvrir : NFR2 veut qu'un montant
 * mène toujours à ses lignes.
 */
const targetTx = useTargetTransactions()

/** Libellés des postes, pour nommer les groupes de la descente sans second appel. */
const itemLabels = computed<Record<string, string>>(() =>
  Object.fromEntries(
    (data.value?.groups ?? []).flatMap(g => g.items.map(i => [i.code, i.label] as const)),
  ),
)

function onToggleBucket(pointBucket: string) {
  if (!target.value) return
  // Les tranches sont toujours des MOIS depuis la refonte du 2026-09-07.
  void targetTx.toggle(pointBucket, bucketBounds(pointBucket, 'month'), target.value)
}

// Changer de cible, de pas ou de fenêtre referme la tranche ouverte : ses lignes ne la
// décrivent plus.
watch([target, period], () => targetTx.reset())

/**
 * Écart entre la première et la dernière tranche PORTEUSE de la cible.
 *
 * ⚠️ Les tranches vides sont écartées, et ce n'est pas cosmétique (revue du 2026-09-07).
 * Depuis que la vue couvre une année entière, elle contient les mois à venir, à zéro. Comparer
 * décembre à janvier donnait « −964 € » sur une Alimentation qui avait en réalité AUGMENTÉ
 * de 318 € entre janvier et août — chiffre faux, et signal de couleur inversé.
 */
const targetDrift = computed(() => {
  const filled = (data.value?.targetSeries ?? []).filter(p => p.transactionCount > 0)
  if (filled.length < 2) return null
  const sign = targetInverted.value ? -1 : 1
  return ((filled.at(-1)!.totalCents - filled[0]!.totalCents) * sign) as Cents
})
</script>

<template>
  <section class="evo-page">
    <header class="page-head">
      <h2 class="page-head__title">
        Évolution
      </h2>
      <span class="page-head__sub">Mois par mois · {{ label }}</span>

      <div class="evo-page__period">
        <!-- Tout l'historique n'a pas de voisin : `aria-disabled` plutôt que `disabled`, avec
             la raison dans le nom accessible (NFR18). -->
        <div class="stepper">
          <button
            type="button"
            class="stepper__btn"
            :aria-disabled="!canShift"
            :aria-label="canShift ? 'Période précédente' : 'Période précédente — indisponible sur tout l\'historique'"
            @click="shift(-1)"
          >
            ‹
          </button>
          <strong class="stepper__label evo-page__label">{{ label }}</strong>
          <button
            type="button"
            class="stepper__btn"
            :aria-disabled="!canShift"
            :aria-label="canShift ? 'Période suivante' : 'Période suivante — indisponible sur tout l\'historique'"
            @click="shift(1)"
          >
            ›
          </button>
        </div>

        <label class="evo-page__field">
          <span>Vue</span>
          <select
            class="select select--sm"
            :value="view"
            @change="setView(($event.target as HTMLSelectElement).value as EvolutionView)"
          >
            <option
              v-for="v in VIEWS"
              :key="v"
              :value="v"
            >
              {{ EVOLUTION_VIEW_LABELS[v] }}
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

    <!--
      Historique vide : trois sections de tableaux sans ligne et de graphiques vides ne disent
      pas qu'il n'y a rien à montrer — elles laissent croire à une panne (AC de 18.16).
    -->
    <div
      v-else-if="data && data.buckets.length === 0"
      class="panel state"
    >
      <p class="state__title">
        Aucune transaction dans l'historique.
      </p>
      <NuxtLink
        to="/import"
        class="btn btn--sm"
      >
        Importer un relevé
      </NuxtLink>
    </div>

    <template v-else-if="data">
      <!--
        Le suivi d'une cible passe EN TÊTE (recette du 2026-09-06). Il vivait en bas de page :
        choisir une rubrique dépliait un graphique que l'utilisateur ne voyait pas, et l'outil
        restait ignoré. C'est pourtant celui qui répond à « qu'est-ce qui a dérapé, et depuis
        quand » — la question qu'on se pose en arrivant.
      -->
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
          Choisis une rubrique ou un poste pour voir sa trajectoire sur la période affichée.
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
              <!--
                PAS de lien vers l'analyse ici, contrairement au tableau du dessus : on suit
                UNE cible, et partir sur l'analyse générale ferait perdre ce focus. La ligne
                ouvre ses transactions sur place (recette du 2026-09-06).
              -->
              <template
                v-for="point in data.targetSeries"
                :key="point.bucket"
              >
                <tr :class="{ 'evo-page__row--open': targetTx.openBucket.value === point.bucket }">
                  <th scope="row">
                    <button
                      type="button"
                      class="evo-page__expand"
                      :aria-expanded="targetTx.openBucket.value === point.bucket"
                      :aria-label="`${targetTx.openBucket.value === point.bucket ? 'Replier' : 'Déplier'} les transactions de ${point.label}`"
                      @click="onToggleBucket(point.bucket)"
                    >
                      <span aria-hidden="true">{{ targetTx.openBucket.value === point.bucket ? '▾' : '▸' }}</span>
                      {{ point.label }}
                    </button>
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
                <tr v-if="targetTx.openBucket.value === point.bucket">
                  <td
                    colspan="3"
                    class="evo-page__tx-cell"
                  >
                    <p
                      v-if="targetTx.loading.value"
                      class="evo-page__pending"
                    >
                      Chargement…
                    </p>
                    <p
                      v-else-if="targetTx.failed.value"
                      class="evo-page__tx-error"
                      role="alert"
                    >
                      Impossible de charger les lignes de cette tranche.
                    </p>
                    <p
                      v-else-if="targetTx.transactions.value.length === 0"
                      class="evo-page__pending"
                    >
                      Aucune ligne sur cette tranche.
                    </p>
                    <!--
                      Regroupées par POSTE : sur une rubrique, une tranche porte jusqu'à
                      cinquante lignes, et les lire à plat oblige à trier de tête ce qu'on est
                      précisément venu voir réparti (demande du 2026-09-06).
                    -->
                    <div
                      v-else
                      class="evo-page__tx-groups"
                    >
                      <section
                        v-for="g in targetTx.groups.value"
                        :key="g.itemCode"
                      >
                        <h4 class="evo-page__tx-group">
                          <span>{{ itemLabels[g.itemCode] ?? g.itemCode }}</span>
                          <span class="evo-page__tx-group-meta">
                            {{ g.transactions.length }} ligne(s)
                            <b class="num">{{ formatEuros(g.totalCents) }}</b>
                          </span>
                        </h4>
                        <ul class="evo-page__tx">
                          <li
                            v-for="tx in g.transactions"
                            :key="tx.id"
                            class="evo-page__tx-row"
                          >
                            <span class="evo-page__tx-date">{{ formatDate(tx.transactionDate) }}</span>
                            <span class="evo-page__tx-label">{{ tx.label }}</span>
                            <span class="num">{{ formatEuros(tx.amountCents) }}</span>
                          </li>
                        </ul>
                      </section>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </template>
      </section>

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
            Recettes, dépenses, résultat et patrimoine cumulé, mois par mois
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
                Patrimoine cumulé
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
                  :to="{ path: '/analyse', query: { p: point.bucket, g: 'month' } }"
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
          Patrimoine financier
        </h3>
        <!--
          La courbe cumule depuis le DÉBUT de l'historique, pas depuis le début de la fenêtre
          (demande du 2026-09-06). Les mouvements internes en sont exclus : déplacer de l'argent
          entre ses propres comptes n'enrichit ni n'appauvrit. Ce qui reste est donc ce que le
          patrimoine a gagné ou perdu — et un solde bancaire stable peut très bien masquer une
          baisse, l'épargne comblant l'écart.
        -->
        <p class="evo-page__hint">
          Recettes moins dépenses, cumulées depuis le début de l'historique. Les virements entre
          vos comptes n'y entrent pas : ils ne changent pas ce que vous possédez.
          <template v-if="data.priorCumulativeCents !== 0">
            La courbe démarre à {{ formatEuros(data.priorCumulativeCents as Cents) }}, acquis
            avant la première tranche affichée.
          </template>
        </p>
        <TrendChart
          :points="cumulativePoints"
          value-label="Patrimoine"
          filled
        />
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

.evo-page__expand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.evo-page__expand:hover { color: var(--color-accent); }
.evo-page__row--open { background: var(--color-accent-subtle); }

.evo-page__tx-cell { padding: 0 var(--space-3) var(--space-2); }
.evo-page__tx { list-style: none; display: flex; flex-direction: column; }
.evo-page__tx-row {
  display: grid;
  grid-template-columns: 5.5rem 1fr 7rem;
  gap: var(--space-2);
  align-items: baseline;
  font-size: var(--font-size-sm);
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--color-hairline);
}
.evo-page__tx-row:last-child { border-bottom: 0; }
.evo-page__tx-date { font-family: var(--font-mono); color: var(--color-text-muted); }
/* `.evo-page__table td { text-align: right }` s'applique aussi à la cellule de descente : les
   libellés se retrouvaient collés aux montants, à droite (revue du 2026-09-07). */
.evo-page__tx-label { overflow-wrap: anywhere; text-align: left; }
.evo-page__tx-date { text-align: left; }
.evo-page__tx-groups { display: flex; flex-direction: column; gap: var(--space-2); }
.evo-page__tx-group {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: 600;
  padding-top: var(--space-1);
}
.evo-page__tx-group-meta { font-weight: 400; color: var(--color-text-muted); display: flex; gap: var(--space-2); }
.evo-page__tx-error { color: var(--color-danger); font-size: var(--font-size-sm); }

.evo-page__neg { color: var(--color-danger); }
</style>
