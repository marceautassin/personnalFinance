<script setup lang="ts">
import { useTransactions } from '~/composables/useTransactions'
import { useApiError } from '~/composables/useApiError'
import { isDegraded } from '~~/shared/types/statement-reliability'
import { ratio, formatRatio } from '~~/shared/types/ratio'
import { cents, formatEuros } from '~~/shared/types/money'
import { type MovementNature, NATURE_OPTIONS } from '~~/shared/types/movement-nature'
import { flattenReferential } from '~/composables/useCategories'
import { useSettlements } from '~/composables/useSettlements'
import {
  GRANULARITIES,
  bucketLabel,
  bucketOf,
  bucketBounds,
  shiftBucket,
  type Granularity,
} from '~~/shared/types/granularity'

// Validation du paramètre dynamique : Nuxt rejoue la guard à chaque navigation
// (re-mount ou réutilisation du composant), évitant le bypass d'un throw top-level setup.
//
// Trois formes acceptées depuis le 2026-09-06 — `2026`, `2026-T3`, `2026-08` — pour que la
// page couvre l'année autant que le mois. C'est la FORME du paramètre qui porte l'échelle :
// pas de second paramètre à tenir cohérent avec le premier.
const PERIOD_RE = /^\d{4}(?:-(?:0[1-9]|1[0-2])|-T[1-4])?$/
definePageMeta({
  validate: route => typeof route.params.period === 'string' && PERIOD_RE.test(route.params.period),
})

const route = useRoute()
const router = useRouter()

const period = computed(() => route.params.period as string)

/** L'échelle se lit sur la forme de la tranche : `2026` une année, `2026-T3` un trimestre. */
const granularity = computed<Granularity>(() => {
  if (period.value.length === 4) return 'year'
  return period.value.includes('-T') ? 'quarter' : 'month'
})

const mutationError = ref<string | null>(null)

const { data, pending, error, refresh, mutateCategory, ruleSuggestion, dismissSuggestion }
  = useTransactions(period, granularity)
const { addRule, previewRule, applyRuleToHistory } = useRules()
const { data: groups } = useCategories()

const { mapError } = useApiError()

/**
 * Sélection de lignes pour créer une réconciliation (epic 19).
 *
 * Vidée à chaque changement de période : une sélection qui survivrait au changement porterait
 * sur des lignes qu'on ne voit plus, et le geste suivant s'appliquerait à l'aveugle.
 */
const picked = ref<number[]>([])
const settlementLabel = ref('')
const linking = ref(false)
const { link: linkSettlement, unlink: unlinkSettlement } = useSettlements()

watch(period, () => {
  picked.value = []
  settlementLabel.value = ''
})

/** Somme de ce qui est coché — dire si les deux côtés s'équilibrent AVANT de lier. */
const pickedBalance = computed(() =>
  cents(data.value.transactions
    .filter(t => picked.value.includes(t.id))
    .reduce((sum, t) => sum + t.amountCents, 0)),
)

/** La sélection vit ICI : le tableau n'émet qu'une intention (recette du 2026-09-07). */
function onToggleSelect(id: number) {
  picked.value = picked.value.includes(id)
    ? picked.value.filter(x => x !== id)
    : [...picked.value, id]
}

/**
 * Groupe des lignes cochées, quand elles appartiennent TOUTES au même — la condition pour
 * pouvoir le défaire sans ambiguïté.
 */
const pickedGroupId = computed(() => {
  const groups = new Set(
    data.value.transactions
      .filter(t => picked.value.includes(t.id))
      .map(t => t.settlementGroupId ?? null),
  )
  const only = [...groups]
  return groups.size === 1 && only[0] != null ? only[0] : null
})

async function onUnlink() {
  const groupId = pickedGroupId.value
  if (groupId === null || linking.value) return
  mutationError.value = null
  linking.value = true
  const outcome = await unlinkSettlement(groupId)
  linking.value = false
  if (outcome.error) {
    mutationError.value = outcome.error
    return
  }
  picked.value = []
  await refresh()
}

async function onLink() {
  if (picked.value.length < 2 || linking.value) return
  mutationError.value = null
  linking.value = true
  const outcome = await linkSettlement(
    settlementLabel.value.trim() || 'Avance remboursée',
    picked.value,
  )
  linking.value = false
  if (outcome.error) {
    mutationError.value = outcome.error
    return
  }
  picked.value = []
  settlementLabel.value = ''
  await refresh()
}

const savingRule = ref(false)
/** Compte rendu de la dernière application d'une règle à l'historique (story 18.2). */
const applyReport = ref<string | null>(null)

/** Au-delà, une règle mérite d'être relue avant d'être créée. Seuil d'attention, pas de blocage. */
const WIDE_RULE_THRESHOLD = 25

/**
 * Motif éditable avant création.
 *
 * L'extraction ne peut pas savoir si le suffixe d'un libellé fait partie du nom du commerçant
 * ou du numéro de terminal : `BOULANGERIE EX 2` est une enseigne, `CDISCOUNT 4` n'en est qu'un
 * point de vente. Proposer sans laisser corriger produirait des règles qui ne se déclenchent
 * qu'une fois — l'inverse du but.
 */
const editablePattern = ref('')

/**
 * Nombre de lignes déjà en base que le motif couvrirait. `null` tant qu'il est inconnu.
 *
 * C'est le garde-fou : une règle « DUPONT Jean », a priori évidente, couvrait 106 lignes
 * dont 7 604 € de remboursement d'emprunt qu'elle aurait sortis des dépenses. Le compteur ne
 * s'affichait alors que sur `/regles`, après coup (revue du 2026-09-05).
 */
const suggestionReach = ref<number | null>(null)

watch(ruleSuggestion, async (suggestion) => {
  editablePattern.value = suggestion?.pattern ?? ''
  suggestionReach.value = suggestion ? await previewRule(suggestion.pattern) : null
})

// Le motif est éditable : sa portée doit suivre ce que l'utilisateur tape, sinon le chiffre
// affiché décrirait une règle qui n'est plus celle qu'il s'apprête à créer.
watch(editablePattern, async (pattern) => {
  if (ruleSuggestion.value) suggestionReach.value = await previewRule(pattern)
})

/** Libellé lisible du poste visé par la proposition — un code ne dit rien à personne. */
const suggestionTarget = computed(() => {
  const code = ruleSuggestion.value?.categoryItemCode
  if (!code) return null
  return flattenReferential(groups.value).find(i => i.code === code) ?? null
})

/**
 * Crée la règle proposée après une correction (FR43).
 *
 * On propose plutôt que de créer d'office : toutes les corrections ne se généralisent pas.
 * Déplacer un restaurant vers la rubrique Voyages vaut pour ce séjour-là, pas pour le bistrot
 * du coin — et une règle posée sans le dire se découvrirait des mois plus tard, en cherchant
 * pourquoi les chiffres ont bougé.
 */
/**
 * Crée la règle proposée, et l'applique à l'historique si on le lui demande (story 18.2).
 *
 * Le moment est le bon : l'utilisateur vient de constater que le modèle s'est trompé sur un
 * libellé récurrent. Lui faire rouvrir `/regles` pour appliquer ce qu'il vient d'écrire, c'est
 * lui faire porter la corvée que la règle supprime.
 */
async function onAcceptSuggestion(applyToHistory = false) {
  const suggestion = ruleSuggestion.value
  if (!suggestion || savingRule.value) return
  const pattern = editablePattern.value.trim()
  if (pattern.length < 2) {
    mutationError.value = 'Le motif doit faire au moins 2 caractères.'
    return
  }
  mutationError.value = null
  applyReport.value = null
  savingRule.value = true

  const outcome = await addRule({ pattern, categoryItemCode: suggestion.categoryItemCode })
  if (outcome.error || !outcome.rule) {
    savingRule.value = false
    mutationError.value = outcome.error ?? 'La règle n\'a pas pu être créée.'
    return
  }

  if (applyToHistory) {
    const applied = await applyRuleToHistory(outcome.rule.id)
    if ('result' in applied) {
      const { updatedCount, skippedManualCount } = applied.result
      applyReport.value = updatedCount === 0
        ? 'Règle créée. Aucune ligne de l\'historique n\'a changé de poste.'
        : `Règle créée et appliquée : ${updatedCount} ligne(s) reclassée(s)`
          + (skippedManualCount > 0 ? `, ${skippedManualCount} laissée(s) de côté car corrigée(s) à la main.` : '.')
    }
    else {
      // La règle EXISTE : l'échec ne porte que sur son application. Le dire, sinon
      // l'utilisateur croit avoir tout perdu et la recrée. L'encart reste ouvert pour qu'un
      // second essai soit possible sans quitter l'écran.
      mutationError.value = `Règle créée, mais son application a échoué : ${applied.error ?? 'raison inconnue'}`
      savingRule.value = false
      return
    }
  }

  savingRule.value = false
  dismissSuggestion()
  suggestionReach.value = null
}

const periodLabel = computed(() => {
  const label = bucketLabel(period.value, granularity.value)
  return label.charAt(0).toUpperCase() + label.slice(1)
})

/** Nom des unités, pour que le pas et le sélecteur disent la même chose que ce qu'ils font. */
const GRANULARITY_LABELS: Record<Granularity, string> = {
  month: 'Mois',
  quarter: 'Trimestre',
  year: 'Année',
}
/**
 * Libellés du pas, écrits en toutes lettres plutôt que composés.
 *
 * « Année » est féminin : concaténer « précédent » donnait « année précédent » dans le nom
 * accessible, lu tel quel par un lecteur d'écran.
 */
const STEP_LABELS: Record<Granularity, { previous: string, next: string }> = {
  month: { previous: 'Mois précédent', next: 'Mois suivant' },
  quarter: { previous: 'Trimestre précédent', next: 'Trimestre suivant' },
  year: { previous: 'Année précédente', next: 'Année suivante' },
}
const stepLabels = computed(() => STEP_LABELS[granularity.value])

function navigate(delta: number) {
  router.push(`/transactions/${shiftBucket(period.value, granularity.value, delta)}`)
}

/**
 * Change d'échelle en RESTANT sur la même date — même règle que l'écran d'analyse.
 *
 * Passer d'août 2026 à l'année doit donner 2026, et non la première tranche de l'historique.
 * On repart de la borne de début, seule information commune aux deux découpages.
 */
function setGranularity(next: Granularity) {
  router.push(`/transactions/${bucketOf(bucketBounds(period.value, granularity.value).from, next)}`)
}

async function onCategoryChange(transactionId: number, categoryItemCode: string) {
  mutationError.value = null
  const outcome = await mutateCategory(transactionId, categoryItemCode)
  if (outcome.error) mutationError.value = outcome.error
}

/**
 * Filtre par libellé — la liste fait une centaine de lignes par mois et plus de mille par
 * année, et rien ne permettait d'en atteindre une sans la dérouler entièrement (epic 16).
 *
 * Le filtrage est CLIENT : les lignes du mois sont déjà toutes chargées, un aller-retour
 * serveur par frappe n'apporterait rien et ferait clignoter la liste.
 */
const filter = ref('')

/** Sans accent ni casse : on tape « croix rouge » pour trouver « Croix-Rouge française ». */
const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Filtres de requalification (story 18.1).
 *
 * Le poste et la nature s'ajoutent à la recherche de libellé, et les trois se CUMULENT. C'est
 * ce qui permet d'isoler les lignes tombées au repli et de les ranger sans les chercher à
 * l'œil — le poste `divers-non-categorise` porte à lui seul 311 des 1 855 lignes de la base.
 */
/** Postes retenus. Vide = aucun filtre de poste — c'est l'absence qui laisse tout passer. */
const itemFilter = ref<string[]>([])
const natureFilter = ref<'' | MovementNature>('')

const natureByItem = computed(() =>
  new Map(flattenReferential(groups.value).map(i => [i.code, i.nature])),
)

const visibleTransactions = computed(() => {
  const needle = normalize(filter.value.trim())
  return data.value.transactions.filter((t) => {
    if (needle !== '' && !normalize(t.label).includes(needle)) return false
    if (itemFilter.value.length > 0 && !itemFilter.value.includes(t.categoryItemCode)) return false
    if (natureFilter.value !== '' && natureByItem.value.get(t.categoryItemCode) !== natureFilter.value) return false
    return true
  })
})

/**
 * Un filtre sans sous-total oblige à additionner de tête ce qu'on vient d'isoler.
 *
 * Il somme les montants du RELEVÉ, sciemment, et non les montants effectifs des descentes
 * d'analyse : cet écran est le relevé, et c'est ici qu'on sélectionne des lignes pour les lier
 * en comparant ce que la banque a débité. Le badge dit, lui, ce que l'analyse en fait.
 */
const visibleTotalCents = computed(() =>
  cents(visibleTransactions.value.reduce((sum, t) => sum + t.amountCents, 0)),
)

const hasFilter = computed(() =>
  filter.value.trim() !== '' || itemFilter.value.length > 0 || natureFilter.value !== '',
)

function clearFilters() {
  filter.value = ''
  itemFilter.value = []
  natureFilter.value = ''
}

/**
 * Compteurs BORNÉS À LA PÉRIODE affichée — la barre d'application porte, elle, les mêmes grandeurs
 * sur toute la base. Chaque libellé dit sa portée : « 1,1 % sur ce relevé » à côté de
 * « 0,2 % » se lirait autrement comme une contradiction.
 */
const manualCount = computed(() => data.value.transactions.filter(t => t.isManual).length)
const periodCorrectionRate = computed(() =>
  ratio(manualCount.value, data.value.transactions.length),
)
</script>

<template>
  <section class="tx-page">
    <header class="page-head">
      <h2 class="page-head__title">
        Transactions
      </h2>

      <div class="stepper">
        <button
          type="button"
          class="stepper__btn"
          :aria-label="stepLabels.previous"
          @click="navigate(-1)"
        >
          ‹
        </button>
        <strong class="stepper__label tx-page__title">{{ periodLabel }}</strong>
        <button
          type="button"
          class="stepper__btn"
          :aria-label="stepLabels.next"
          @click="navigate(1)"
        >
          ›
        </button>
      </div>

      <label class="tx-page__scale">
        <span class="tx-page__filter-label">Échelle</span>
        <select
          class="input input--sm"
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

      <ReliabilityBadge
        v-if="data.reliability"
        :reliability="data.reliability"
      />

      <div class="page-head__meta">
        <span><strong>{{ data.transactions.length }}</strong> lignes</span>
        <span><strong>{{ formatRatio(periodCorrectionRate) }}</strong> corrigé sur la période</span>
      </div>
    </header>

    <div
      v-if="data.reliability && isDegraded(data.reliability)"
      class="notice notice--warn"
      :role="data.reliability === 'gap_unreviewed' ? 'alert' : 'status'"
    >
      {{
        data.reliability === 'gap_accepted'
          ? 'Un écart a été assumé sur cette période.'
          : 'La réconciliation laisse un écart, encore inexaminé.'
      }}
    </div>

    <p
      v-if="mutationError"
      class="notice"
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

    <!-- Story 17.7 : une panne ne se déguise pas en mois vide. Sur une erreur serveur, cet
         écran annonçait « Aucune transaction pour ce mois » — l'utilisateur pouvait en
         conclure que son historique avait disparu. -->
    <div
      v-else-if="error"
      class="panel state state--error"
    >
      <p class="state__title">
        Impossible de charger les transactions de ce mois.
      </p>
      <p class="state__hint">
        {{ mapError(error) }}
      </p>
    </div>

    <div
      v-else-if="data.transactions.length === 0"
      class="panel state"
    >
      <p class="state__title">
        Aucune transaction pour ce mois.
      </p>
      <NuxtLink
        to="/import"
        class="btn btn--sm"
      >
        Importer un relevé
      </NuxtLink>
    </div>

    <!--
      La proposition survit au refetch de la liste : la faire disparaître avec le re-rendu
      reviendrait à ne jamais la montrer.
    -->
    <div
      v-if="ruleSuggestion"
      class="tx-page__suggestion"
      role="status"
    >
      <label class="tx-page__suggestion-label">
        <span>Toujours ranger les libellés contenant</span>
        <input
          v-model="editablePattern"
          type="text"
          class="input input--sm tx-page__suggestion-input"
          maxlength="120"
          aria-label="Motif de la règle"
          @keyup.enter="onAcceptSuggestion(false)"
        >
      </label>
      <span>
        dans
        <strong>{{ suggestionTarget ? `${suggestionTarget.groupLabel} · ${suggestionTarget.label}` : ruleSuggestion.categoryItemCode }}</strong> ?
      </span>
      <!--
        La portée s'affiche AVANT la création, pas après : c'est elle qui permet de repérer un
        motif trop large, et un chiffre vu trop tard ne sert à rien.
      -->
      <span
        class="tx-page__suggestion-reach"
        :class="{ 'tx-page__suggestion-reach--wide': (suggestionReach ?? 0) > WIDE_RULE_THRESHOLD }"
      >
        <template v-if="suggestionReach === null">portée inconnue</template>
        <template v-else>couvrira {{ suggestionReach }} ligne(s) déjà en base</template>
      </span>
      <button
        type="button"
        class="btn btn--primary btn--sm tx-page__suggestion-accept"
        :aria-disabled="savingRule"
        @click="onAcceptSuggestion(false)"
      >
        {{ savingRule ? 'Création…' : 'Créer la règle' }}
      </button>
      <!-- Une règle écrite après coup ne sert qu'aux relevés futurs si rien ne la rejoue sur
           l'historique : c'est là que le geste a le plus de valeur (story 18.2). -->
      <button
        v-if="(suggestionReach ?? 0) > 0"
        type="button"
        class="btn btn--sm"
        :aria-disabled="savingRule"
        :aria-label="`Créer la règle et la ranger sur les ${suggestionReach} ligne(s) déjà en base`"
        @click="onAcceptSuggestion(true)"
      >
        Créer et appliquer à l'historique
      </button>
      <button
        type="button"
        class="btn btn--quiet btn--sm"
        @click="dismissSuggestion"
      >
        Non merci
      </button>
    </div>

    <p
      v-if="applyReport"
      class="tx-page__apply-report"
      role="status"
    >
      {{ applyReport }}
    </p>

    <template v-if="data.transactions.length > 0">
      <div class="tx-page__tools">
        <label class="tx-page__filter">
          <span class="tx-page__filter-label">Filtrer par libellé</span>
          <input
            v-model="filter"
            type="search"
            class="input input--sm tx-page__filter-input"
            placeholder="Ex : croix rouge"
          >
        </label>

        <span class="tx-page__filter">
          <span class="tx-page__filter-label">Postes</span>
          <CategoryFilter v-model="itemFilter" />
        </span>

        <label class="tx-page__filter">
          <span class="tx-page__filter-label">Nature</span>
          <select
            v-model="natureFilter"
            class="input input--sm"
          >
            <option value="">
              Toutes
            </option>
            <option
              v-for="[value, label] in NATURE_OPTIONS"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </label>

        <button
          v-if="hasFilter"
          type="button"
          class="btn btn--quiet btn--sm"
          @click="clearFilters"
        >
          Tout afficher
        </button>

        <!-- Le sous-total accompagne le compte : isoler des lignes sans savoir ce qu'elles
             pèsent oblige à les additionner de tête (story 18.1). -->
        <span
          v-if="hasFilter"
          class="tx-page__filter-count"
          role="status"
        >
          {{ visibleTransactions.length }} sur {{ data.transactions.length }} ·
          <strong>{{ formatEuros(visibleTotalCents) }}</strong>
        </span>
      </div>

      <!-- L'état vide doit dire que le FILTRE est en cause : « aucune transaction » laisserait
           croire que le mois est vide (story 18.1). -->
      <p
        v-if="visibleTransactions.length === 0"
        class="tx-page__pending"
      >
        Aucune ligne de ce mois ne passe les filtres actifs.
      </p>
      <!--
        Barre de réconciliation : elle n'apparaît qu'une fois des lignes cochées, et dit ce
        qu'elles totalisent. Un solde à zéro annonce une couverture exacte ; sinon, l'écart
        restera à charge (epic 19).
      -->
      <div
        v-if="picked.length > 0"
        class="tx-page__link-bar"
        role="status"
      >
        <span>
          <strong>{{ picked.length }}</strong> ligne(s) ·
          solde <strong>{{ formatEuros(pickedBalance) }}</strong>
          <template v-if="pickedBalance === 0"> — couverture exacte</template>
        </span>
        <input
          v-if="pickedGroupId === null"
          v-model="settlementLabel"
          type="text"
          class="input input--sm"
          maxlength="120"
          placeholder="Ex : courses parents"
          aria-label="Nom de la réconciliation"
        >
        <!-- Défaire prime sur lier : quand la sélection est déjà un groupe, proposer de la
             lier n'aurait aucun sens (le serveur la refuserait). -->
        <button
          v-if="pickedGroupId !== null"
          type="button"
          class="btn btn--danger btn--sm"
          :aria-disabled="linking"
          aria-label="Défaire cette réconciliation"
          @click="onUnlink"
        >
          {{ linking ? 'Suppression…' : 'Défaire la réconciliation' }}
        </button>
        <button
          v-else
          type="button"
          class="btn btn--primary btn--sm"
          :aria-disabled="picked.length < 2 || linking"
          :aria-label="picked.length < 2
            ? 'Lier — indisponible, il faut au moins deux lignes'
            : `Lier ces ${picked.length} lignes`"
          @click="onLink"
        >
          {{ linking ? 'Liaison…' : 'Lier ces lignes' }}
        </button>
        <button
          type="button"
          class="btn btn--quiet btn--sm"
          @click="picked = []"
        >
          Annuler
        </button>
      </div>

      <TransactionList
        v-if="visibleTransactions.length > 0"
        :selected="picked"
        :transactions="visibleTransactions"
        @toggle-select="onToggleSelect"
        @toggle-all-visible="ids => picked = ids"
        @category-change="onCategoryChange"
      />
    </template>
  </section>
</template>

<style scoped>
.tx-page { display: flex; flex-direction: column; gap: var(--space-3); }
.tx-page__title { min-width: 10rem; }
.tx-page__pending { color: var(--color-text-muted); }
.tx-page__scale { display: flex; align-items: center; gap: var(--space-2); }
.tx-page__link-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-accent-border, var(--color-border));
  border-radius: var(--radius-md);
  background: var(--color-accent-subtle);
  font-size: var(--font-size-sm);
}

.tx-page__tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.tx-page__filter { display: flex; align-items: center; gap: var(--space-2); }
.tx-page__filter-label { font-size: var(--font-size-sm); color: var(--color-text-muted); }
.tx-page__filter-input { width: 100%; max-width: 20rem; }
.tx-page__filter-count { font-size: var(--font-size-sm); color: var(--color-text-muted); }

/* La proposition de règle est le seul encart bordé d'accent : c'est une question posée à
   l'utilisateur, pas un état de la page. */
.tx-page__suggestion {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-3);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-accent-subtle);
  font-size: var(--font-size-sm);
}
.tx-page__suggestion-label { display: flex; align-items: center; gap: var(--space-2); }
.tx-page__suggestion-input { font-family: var(--font-mono); min-width: 14rem; }
.tx-page__suggestion-accept { margin-left: auto; }
.tx-page__suggestion-reach { color: var(--color-text-muted); font-size: var(--font-size-xs); }
.tx-page__suggestion-reach--wide { color: var(--color-danger); font-weight: 600; }
</style>
