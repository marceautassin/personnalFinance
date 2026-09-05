<script setup lang="ts">
import { useTransactions } from '~/composables/useTransactions'
import { isDegraded } from '~~/shared/types/statement-reliability'

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

const { data, pending, mutateCategory, ruleSuggestion, dismissSuggestion } = useTransactions(period)
const { addRule, previewRule } = useRules()
const { data: groups } = useCategories()

const savingRule = ref(false)

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
async function onAcceptSuggestion() {
  const suggestion = ruleSuggestion.value
  if (!suggestion || savingRule.value) return
  const pattern = editablePattern.value.trim()
  if (pattern.length < 2) {
    mutationError.value = 'Le motif doit faire au moins 2 caractères.'
    return
  }
  mutationError.value = null
  savingRule.value = true
  const outcome = await addRule({ pattern, categoryItemCode: suggestion.categoryItemCode })
  savingRule.value = false
  if (outcome.error) mutationError.value = outcome.error
  else {
    dismissSuggestion()
    suggestionReach.value = null
  }
}

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

async function onCategoryChange(transactionId: number, categoryItemCode: string) {
  mutationError.value = null
  const outcome = await mutateCategory(transactionId, categoryItemCode)
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

    <div
      v-if="data.reliability && isDegraded(data.reliability)"
      class="tx-page__alert"
      :role="data.reliability === 'gap_unreviewed' ? 'alert' : 'status'"
    >
      <ReliabilityBadge :reliability="data.reliability" />
      <span class="tx-page__alert-hint">{{
        data.reliability === 'gap_accepted'
          ? 'Un écart a été assumé sur ce mois.'
          : 'La réconciliation laisse un écart, encore inexaminé.'
      }}</span>
    </div>

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
          class="tx-page__suggestion-input"
          maxlength="120"
          aria-label="Motif de la règle"
          @keyup.enter="onAcceptSuggestion"
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
        class="tx-page__suggestion-accept"
        :aria-disabled="savingRule"
        @click="onAcceptSuggestion"
      >
        {{ savingRule ? 'Création…' : 'Créer la règle' }}
      </button>
      <button
        type="button"
        class="tx-page__suggestion-dismiss"
        @click="dismissSuggestion"
      >
        Non merci
      </button>
    </div>

    <TransactionList
      v-if="data.transactions.length > 0"
      :transactions="data.transactions"
      @category-change="onCategoryChange"
    />
  </section>
</template>

<style scoped>
.tx-page__suggestion {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-3);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  font-size: var(--font-size-sm);
}
.tx-page__suggestion-label { display: flex; align-items: center; gap: var(--space-2); }
.tx-page__suggestion-input {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
  font-family: var(--font-mono, monospace);
  min-width: 14rem;
}
.tx-page__suggestion-accept {
  margin-left: auto;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: var(--color-bg);
  font: inherit;
  cursor: pointer;
}
.tx-page__suggestion-accept[aria-disabled='true'] { opacity: 0.6; cursor: default; }
.tx-page__suggestion-reach { color: var(--color-text-muted); font-size: var(--font-size-xs); }
.tx-page__suggestion-reach--wide { color: var(--color-danger); font-weight: 600; }
.tx-page__suggestion-dismiss {
  border: none;
  background: none;
  font: inherit;
  color: var(--color-text-muted);
  cursor: pointer;
}
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
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-left: 3px solid var(--color-warning);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  margin: 0;
}
.tx-page__alert-hint { color: var(--color-text-muted); font-size: var(--font-size-sm); }
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
