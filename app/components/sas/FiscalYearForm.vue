<script setup lang="ts">
import { FiscalYearEndDateSchema } from '~~/shared/schemas/sas-config.schema'

const props = defineProps<{
  fiscalYearEndDate: string
  saving?: boolean
}>()
const emit = defineEmits<{
  save: [patch: { fiscalYearEndDate: string }]
}>()

const dateInput = ref('')
const error = ref<string | null>(null)

function syncFromProps() {
  dateInput.value = props.fiscalYearEndDate
  error.value = null
}
watch(() => props.fiscalYearEndDate, syncFromProps, { immediate: true })

const isStandardClose = computed(() => dateInput.value === '12-31')

function setStandardClose() {
  dateInput.value = '12-31'
}

function onSubmit() {
  error.value = null
  // Validation déléguée au schéma partagé : même règle que le serveur (rejette aussi les
  // dates impossibles comme 02-30), évite la divergence regex client/serveur.
  if (!FiscalYearEndDateSchema.safeParse(dateInput.value).success) {
    error.value = 'Date MM-JJ invalide (ex. 12-31).'
    return
  }
  emit('save', { fiscalYearEndDate: dateInput.value })
}
</script>

<template>
  <form
    class="rev-panel"
    @submit.prevent="onSubmit"
  >
    <h3 class="rev-panel__title">
      Clôture d'exercice
    </h3>
    <p class="rev-panel__hint">
      Date de clôture annuelle au format MM-JJ (sans année — récurrente).
    </p>

    <div class="rev-panel__row">
      <label class="rev-panel__field">
        <span>Clôture (MM-JJ)</span>
        <input
          v-model="dateInput"
          type="text"
          placeholder="12-31"
          aria-label="Date de clôture (MM-JJ)"
        >
      </label>
      <button
        type="button"
        class="rev-panel__standard-btn"
        :disabled="isStandardClose"
        @click="setStandardClose"
      >
        Clôture standard au 31/12
      </button>
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

<style scoped>
.rev-panel__standard-btn {
  align-self: flex-end;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  cursor: pointer;
}
.rev-panel__standard-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
