<script setup lang="ts">
import type { Cents } from '~~/shared/types/money'
import { parseEurosToCents, syncEurosInput, MAX_REVENUE_CENTS } from '~/utils/euros'
import { DateIsoSchema } from '~~/shared/schemas/transaction.schema'

const props = defineProps<{
  monthlyCents: Cents
  endDate: string | null
  saving?: boolean
}>()
const emit = defineEmits<{
  save: [patch: { unemploymentBenefitMonthlyCents: Cents, unemploymentBenefitEndDate: string | null }]
}>()

const amountInput = ref('')
const endDateInput = ref('')
const error = ref<string | null>(null)

// Deux gardes contre la perte de saisie (revue 2026-08-04) : `useDirtyForm` bloque toute
// resynchro tant que l'utilisateur a une saisie non enregistrée — un `refresh()` déclenché
// par l'enregistrement d'un AUTRE panneau ne doit rien écraser ici — et `syncEurosInput`
// préserve en plus le format d'une saisie équivalente. Les watchers portent sur des props
// scalaires : le getter tableau d'origine renvoyait une référence neuve à chaque refetch.
const { markDirty, markPristine, syncIfPristine } = useDirtyForm()

function syncFromProps() {
  amountInput.value = syncEurosInput(amountInput.value, props.monthlyCents)
  if (endDateInput.value !== (props.endDate ?? '')) endDateInput.value = props.endDate ?? ''
  error.value = null
}
watch(() => props.monthlyCents, () => syncIfPristine(syncFromProps), { immediate: true })
watch(() => props.endDate, () => syncIfPristine(syncFromProps))

function onSubmit() {
  error.value = null
  const cents = parseEurosToCents(amountInput.value || '0')
  if (cents === null) {
    error.value = 'Montant invalide (nombre positif, max 2 décimales).'
    return
  }
  // Borne alignée sur RevenueAmountCentsSchema.max(1e11) : message inline plutôt qu'un 422.
  if (cents > MAX_REVENUE_CENTS) {
    error.value = 'Montant trop élevé (max 1 000 000 000 €).'
    return
  }
  // Validation déléguée au schéma partagé (comme FiscalYearForm) : une regex locale
  // accepterait `2026-02-30` et laisserait le serveur répondre un 422 opaque.
  if (endDateInput.value && !DateIsoSchema.safeParse(endDateInput.value).success) {
    error.value = 'Date de fin invalide (format AAAA-MM-JJ, date existante).'
    return
  }
  // Invariant serveur reproduit côté client pour un retour immédiat et ciblé
  // (cf. `server/api/revenues.put.ts`) : sans date valide, l'ARE serait ignorée par le forecast.
  if (cents > 0) {
    if (!endDateInput.value) {
      error.value = 'Renseigne la date de fin de droits : sans elle, l\'ARE serait ignorée par le forecast.'
      return
    }
    // `YYYY-MM` en comparaison lexicographique — même granularité mensuelle que le forecast.
    if (endDateInput.value.slice(0, 7) < new Date().toISOString().slice(0, 7)) {
      error.value = 'Date de fin de droits déjà passée : l\'ARE ne serait comptée sur aucun mois.'
      return
    }
  }
  markPristine()
  emit('save', {
    unemploymentBenefitMonthlyCents: cents,
    unemploymentBenefitEndDate: endDateInput.value || null,
  })
}
</script>

<template>
  <form
    class="rev-panel"
    @input="markDirty"
    @submit.prevent="onSubmit"
  >
    <h3 class="rev-panel__title">
      Allocation chômage (ARE)
    </h3>
    <p class="rev-panel__hint">
      Montant net mensuel et date de fin estimée des droits.
    </p>

    <div class="rev-panel__row">
      <label class="rev-panel__field rev-panel__field--grow">
        <span>Montant mensuel (€)</span>
        <input
          v-model="amountInput"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
        >
      </label>
      <label class="rev-panel__field">
        <span>Fin des droits (requise si montant &gt; 0)</span>
        <input
          v-model="endDateInput"
          type="date"
        >
      </label>
    </div>

    <p
      v-if="error"
      class="rev-panel__error"
      role="alert"
    >
      {{ error }}
    </p>

    <div class="rev-panel__actions">
      <button
        type="submit"
        class="rev-panel__btn"
        :disabled="saving"
      >
        {{ saving ? 'Envoi…' : 'Enregistrer' }}
      </button>
    </div>
  </form>
</template>
