<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import { parseEurosToCents } from '~/utils/euros'
import { useOverrides } from '~/composables/useOverrides'
import { useCategories } from '~/composables/useCategories'

const props = defineProps<{
  open: boolean
  /** Mois du forecast proposables à l'override (YYYY-MM). */
  months: string[]
}>()
const emit = defineEmits<{ close: [] }>()

const { data: overrides, addOverride, removeOverride } = useOverrides()
const { data: categories } = useCategories()

const variableCategories = computed(() => categories.value.filter(c => c.isVariable))

const month = ref('')
const categoryCode = ref('')
const amountEuros = ref('')
const error = ref<string | null>(null)
const saving = ref(false)

const dialogRef = ref<HTMLDialogElement | null>(null)
watch(() => props.open, (open) => {
  const el = dialogRef.value
  if (!el) return
  if (open && !el.open) el.showModal()
  else if (!open && el.open) el.close()
})

/** Libellé d'une catégorie depuis son code (pour la liste des overrides existants). */
function catLabel(code: string) {
  return categories.value.find(c => c.code === code)?.label ?? code
}

async function onAdd() {
  error.value = null
  if (!month.value || !categoryCode.value) {
    error.value = 'Mois et catégorie requis.'
    return
  }
  const amount = parseEurosToCents(amountEuros.value || '')
  if (amount === null) {
    error.value = 'Montant invalide (nombre positif, max 2 décimales).'
    return
  }
  saving.value = true
  const outcome = await addOverride({ month: month.value, categoryCode: categoryCode.value, amountCents: amount })
  saving.value = false
  if (outcome.error) {
    error.value = outcome.error
    return
  }
  amountEuros.value = ''
}

async function onRemove(id: number) {
  error.value = null
  const outcome = await removeOverride(id)
  if (outcome.error) error.value = outcome.error
}
</script>

<template>
  <dialog
    ref="dialogRef"
    class="ovr"
    @close="emit('close')"
  >
    <header class="ovr__head">
      <h3 class="ovr__title">
        Ajuster une catégorie variable
      </h3>
      <button
        type="button"
        class="ovr__close"
        aria-label="Fermer"
        @click="emit('close')"
      >
        ✕
      </button>
    </header>

    <form
      class="ovr__form"
      @submit.prevent="onAdd"
    >
      <label class="ovr__field">
        <span>Mois</span>
        <select v-model="month">
          <option
            value=""
            disabled
          >
            Choisir…
          </option>
          <option
            v-for="m in months"
            :key="m"
            :value="m"
          >
            {{ m }}
          </option>
        </select>
      </label>
      <label class="ovr__field">
        <span>Catégorie</span>
        <select v-model="categoryCode">
          <option
            value=""
            disabled
          >
            Choisir…
          </option>
          <option
            v-for="cat in variableCategories"
            :key="cat.code"
            :value="cat.code"
          >
            {{ cat.label }}
          </option>
        </select>
      </label>
      <label class="ovr__field">
        <span>Montant (€)</span>
        <input
          v-model="amountEuros"
          type="text"
          inputmode="decimal"
          placeholder="0,00"
        >
      </label>
      <button
        type="submit"
        class="ovr__btn"
        :disabled="saving"
      >
        {{ saving ? 'Envoi…' : 'Enregistrer' }}
      </button>
    </form>

    <p
      v-if="error"
      class="ovr__error"
      role="alert"
    >
      {{ error }}
    </p>

    <ul
      v-if="overrides.length"
      class="ovr__list"
    >
      <li
        v-for="o in overrides"
        :key="o.id"
        class="ovr__item"
        :data-testid="`override-${o.month}-${o.categoryCode}`"
      >
        <span>{{ o.month }} · {{ catLabel(o.categoryCode) }} · {{ formatEuros(o.amountCents as Cents) }}</span>
        <button
          type="button"
          class="ovr__del"
          :aria-label="`Supprimer l'override ${o.month} ${catLabel(o.categoryCode)}`"
          @click="onRemove(o.id)"
        >
          Retirer
        </button>
      </li>
    </ul>
    <p
      v-else
      class="ovr__empty"
    >
      Aucun ajustement.
    </p>
  </dialog>
</template>

<style scoped>
.ovr { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4); background: var(--color-bg-elevated); color: var(--color-text); max-width: 34rem; width: 90vw; box-shadow: var(--shadow-md); }
.ovr::backdrop { background: rgba(0,0,0,0.4); }
.ovr__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
.ovr__title { margin: 0; font-size: var(--font-size-lg); }
.ovr__close { border: none; background: none; font-size: 1.1rem; cursor: pointer; color: var(--color-text-muted); }
.ovr__form { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: flex-end; }
.ovr__field { display: flex; flex-direction: column; gap: 2px; font-size: var(--font-size-sm); }
.ovr__field span { color: var(--color-text-muted); }
.ovr__btn { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-accent); border-radius: var(--radius-md); background: var(--color-accent); color: white; font: inherit; cursor: pointer; }
.ovr__error { color: var(--color-danger); font-size: var(--font-size-sm); margin: var(--space-2) 0 0; }
.ovr__list { list-style: none; margin: var(--space-3) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.ovr__item { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); padding: var(--space-1) 0; border-bottom: 1px solid var(--color-border); }
.ovr__del { border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-elevated); font: inherit; font-size: var(--font-size-xs); padding: 1px var(--space-2); cursor: pointer; }
.ovr__del:hover { border-color: var(--color-danger); color: var(--color-danger); }
.ovr__empty { color: var(--color-text-muted); font-size: var(--font-size-sm); margin: var(--space-3) 0 0; }
</style>
