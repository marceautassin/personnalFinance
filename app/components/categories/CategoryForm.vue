<script setup lang="ts">
import type { MovementNature } from '~~/shared/types/movement-nature'
import { NATURE_OPTIONS } from '~~/shared/types/movement-nature'

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
          class="input"
          :placeholder="props.placeholder"
          maxlength="50"
        >
      </label>
      <label
        v-if="props.withNature"
        class="cat-form__field"
      >
        <span>Nature</span>
        <select
          v-model="nature"
          class="select"
        >
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
        class="btn btn--primary cat-form__btn"
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
  background: var(--color-neutral-50);
}
.cat-form__title { margin: 0; font-size: var(--font-size-sm); color: var(--color-text-muted); font-weight: 500; }
.cat-form__row { display: flex; align-items: flex-end; gap: var(--space-3); flex-wrap: wrap; }
.cat-form__field { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--font-size-sm); }
/* Le champ fait la largeur de ce qu'on y écrit, pas celle du conteneur : le libellé d'un
   poste tient en un mot, et le champ s'étirait jusqu'à 1 350 px avant l'epic 16. */
.cat-form__field--grow { flex: 0 1 20rem; }
.cat-form__field span { color: var(--color-text-muted); }
.cat-form__error { margin: 0; color: var(--color-danger); font-size: var(--font-size-sm); }
</style>
