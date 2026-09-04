<script setup lang="ts">
import type { MovementNature } from '~~/shared/types/movement-nature'
import { MOVEMENT_NATURES } from '~~/shared/types/movement-nature'

/**
 * Formulaire d'ajout, utilisé pour les rubriques comme pour les postes.
 *
 * `withNature` est la seule différence entre les deux usages : un poste doit déclarer sa
 * nature à la création (FR17), une rubrique n'en porte pas.
 *
 * ⚠️ Ce composant portait les classes `rev-panel__*`, définies dans une feuille supprimée avec
 * le périmètre forecast le 2026-09-04 : il s'affichait sans style depuis. Les styles sont
 * désormais scopés ici, où ils ne peuvent plus être emportés par une suppression voisine.
 */
const props = withDefaults(defineProps<{
  title: string
  submitLabel?: string
  placeholder?: string
  withNature?: boolean
  saving?: boolean
}>(), {
  submitLabel: 'Ajouter',
  placeholder: '',
  withNature: false,
  saving: false,
})

const emit = defineEmits<{
  add: [input: { label: string, nature: MovementNature }]
}>()

const NATURE_LABELS: Record<MovementNature, string> = {
  income: 'Recette',
  expense: 'Dépense',
  internal_transfer: 'Mouvement interne',
}
const NATURE_OPTIONS = MOVEMENT_NATURES.map(n => [n, NATURE_LABELS[n]] as const)

const labelInput = ref('')
const nature = ref<MovementNature>('expense')
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
  emit('add', { label, nature: nature.value })
}

/** Vidé par le parent après un ajout réussi. */
function reset() {
  labelInput.value = ''
  nature.value = 'expense'
  error.value = null
}
defineExpose({ reset })
</script>

<template>
  <form
    class="cat-form"
    @submit.prevent="onSubmit"
  >
    <h3 class="cat-form__title">
      {{ props.title }}
    </h3>

    <div class="cat-form__row">
      <label class="cat-form__field cat-form__field--grow">
        <span>Libellé</span>
        <input
          v-model="labelInput"
          type="text"
          :placeholder="props.placeholder"
          maxlength="50"
        >
      </label>
      <label
        v-if="props.withNature"
        class="cat-form__field"
      >
        <span>Nature</span>
        <select v-model="nature">
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
        type="submit"
        class="cat-form__btn"
        :aria-disabled="props.saving"
      >
        {{ props.saving ? 'Ajout…' : props.submitLabel }}
      </button>
    </div>

    <p
      v-if="error"
      class="cat-form__error"
      role="alert"
    >
      {{ error }}
    </p>
  </form>
</template>

<style scoped>
.cat-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.cat-form__title {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium, 500);
}
.cat-form__row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.cat-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
}
.cat-form__field--grow { flex: 1 1 12rem; }
.cat-form__field span { color: var(--color-text-muted); }
.cat-form__field input,
.cat-form__field select {
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: inherit;
  font: inherit;
}
.cat-form__btn {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: var(--color-bg);
  font: inherit;
  cursor: pointer;
}
.cat-form__btn[aria-disabled='true'] { opacity: 0.6; cursor: default; }
.cat-form__error { margin: 0; color: var(--color-danger); font-size: var(--font-size-sm); }
</style>
