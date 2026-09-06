<script setup lang="ts">
import { useAnalysis } from '~/composables/useAnalysis'
import { useApiError } from '~/composables/useApiError'
import { GRANULARITIES, type Granularity, bucketLabel, shiftBucket } from '~~/shared/types/granularity'
import { isDegraded } from '~~/shared/types/statement-reliability'
import type { MovementNature } from '~~/shared/types/movement-nature'
import type { AnalysisResponse } from '~/composables/useAnalysis'
import type { RangeTransaction } from '~/composables/useItemTransactions'

type AnalysisNature = AnalysisResponse['natures'][number]

const route = useRoute()
const router = useRouter()

/**
 * L'analyse s'ouvre sur l'ANNÉE, pas sur le mois (demande du 2026-09-06).
 *
 * Un mois isolé se lit mal : douze relevés de vacances, de rentrée et de Noël n'ont pas la
 * même tête, et la question « où part mon argent » se pose sur une échelle où les à-coups se
 * compensent. Le sélecteur reste là pour descendre au mois quand on cherche une ligne précise,
 * et l'URL retient le choix.
 *
 * La tranche, elle, reste la DERNIÈRE qui contient quelque chose (cf. `useAnalysis`) : ouvrir
 * sur l'année civile en cours donnerait un écran vide chaque 1er janvier.
 */
const initialGranularity = GRANULARITIES.includes(route.query.g as Granularity)
  ? (route.query.g as Granularity)
  : 'year'

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

/** Replier un poste le sort du cache : le rouvrir redemandera des lignes fraîches. */
function onCollapseItem(itemCode: string) {
  itemTransactions.forget(itemCode)
}

/** Dernier échec de reclassement — une correction qui échoue en silence est un mensonge. */
const recategorizeError = ref<string | null>(null)

async function onRecategorize(transaction: RangeTransaction, categoryItemCode: string) {
  const outcome = await itemTransactions.recategorize(transaction, categoryItemCode)
  recategorizeError.value = 'error' in outcome ? outcome.error : null
}

// Changer de période vide le cache ET recharge les postes restés ouverts (story 17.6). Les
// vider sans les recharger affichait « 0 ligne(s), total 0,00 € » sous un montant non nul.
watch(bounds, newBounds => void itemTransactions.setRange(newBounds))
</script>

<template>
  <section class="analyse">
    <header class="page-head">
      <h2 class="page-head__title">
        Analyse
      </h2>

      <div class="analyse__period">
        <div class="stepper">
          <button
            type="button"
            class="stepper__btn"
            aria-label="Période précédente"
            @click="shift(-1)"
          >
            ‹
          </button>
          <strong class="stepper__label analyse__label">{{ label }}</strong>
          <button
            type="button"
            class="stepper__btn"
            aria-label="Période suivante"
            @click="shift(1)"
          >
            ›
          </button>
        </div>

        <label class="analyse__granularity">
          <span class="analyse__granularity-label">Granularité</span>
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

        <NuxtLink
          class="analyse__link"
          :to="`/evolution?p=${bucket}&g=${granularity}`"
        >
          Voir l'évolution sur douze tranches →
        </NuxtLink>
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
        class="notice notice--warn analyse__alert"
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
        class="notice analyse__alert"
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
        <span>Tout ce qui suit décrit <strong>{{ label }}</strong>. Les écarts se lisent contre <strong>{{ previousLabel }}</strong>.</span>
      </p>

      <p
        v-if="recategorizeError"
        class="notice"
        role="alert"
      >
        {{ recategorizeError }}
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
          @collapse-item="onCollapseItem"
          @recategorize="onRecategorize"
        />
        <DistributionChart
          :nature="income"
          :previous-label="previousLabel"
          :transactions-by-item="itemTransactions.byItem.value"
          :loading-items="itemTransactions.loading.value"
          :failed-items="itemTransactions.failed.value"
          title="Recettes"
          @expand-item="onExpandItem"
          @collapse-item="onCollapseItem"
          @recategorize="onRecategorize"
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
        @collapse-item="onCollapseItem"
        @recategorize="onRecategorize"
      />
    </template>
  </section>
</template>

<style scoped>
/* Ne subsiste ici que la MISE EN PAGE. Boutons, champs, encarts et bandeau d'indicateurs
   viennent de `components.css` — les redéfinir localement est ce que l'epic 16 a supprimé. */
.analyse { display: flex; flex-direction: column; gap: var(--space-3); }
.analyse__period { display: flex; align-items: center; gap: var(--space-3); margin-left: auto; }
.analyse__granularity { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); }
.analyse__granularity-label { color: var(--color-text-muted); }
.analyse__link { font-size: var(--font-size-sm); color: var(--color-accent); }
.analyse__alert { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.analyse__pending { color: var(--color-text-muted); }
.analyse__scope { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.analyse__columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(30rem, 1fr)); gap: var(--space-3); }
</style>
