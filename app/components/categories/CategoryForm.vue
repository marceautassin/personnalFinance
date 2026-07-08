<script setup lang="ts">
import type { NewCategoryInput } from '~~/shared/schemas/category.schema'

defineProps<{
  saving?: boolean
}>()
const emit = defineEmits<{
  add: [input: NewCategoryInput]
}>()

const labelInput = ref('')
const isVariable = ref(true)
const error = ref<string | null>(null)

function onSubmit() {
  error.value = null
  const label = labelInput.value.trim()
  if (label.length === 0) {
    error.value = 'Le libellé est requis.'
    return
  }
  if (label.length > 50) {
    error.value = 'Libellé trop long (50 caractères max).'
    return
  }
  emit('add', { label, isVariable: isVariable.value })
}

/** Vidé par le parent après un ajout réussi. */
function reset() {
  labelInput.value = ''
  isVariable.value = true
  error.value = null
}
defineExpose({ reset })
</script>

<template>
  <form
    class="rev-panel"
    @submit.prevent="onSubmit"
  >
    <h3 class="rev-panel__title">
      Ajouter une catégorie
    </h3>

    <div class="rev-panel__row">
      <label class="rev-panel__field rev-panel__field--grow">
        <span>Libellé</span>
        <input
          v-model="labelInput"
          type="text"
          placeholder="Ex : Carburant"
          maxlength="50"
        >
      </label>
      <label class="rev-panel__field">
        <span>Type</span>
        <select v-model="isVariable">
          <option :value="true">
            Variable
          </option>
          <option :value="false">
            Fixe
          </option>
        </select>
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
        {{ saving ? 'Ajout…' : 'Ajouter' }}
      </button>
    </div>
  </form>
</template>
