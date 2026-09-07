<script setup lang="ts">
import { useCategories } from '~/composables/useCategories'

const props = defineProps<{
  /** Codes de postes retenus. Vide = aucun filtre, donc TOUT passe. */
  modelValue: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [codes: string[]]
}>()

/**
 * Filtre multi-catégories (demande du 2026-09-07 : « filtrer sur certaines catégories »).
 *
 * **Deux niveaux, un seul état.** L'utilisateur pense parfois « toute l'Alimentation », parfois
 * « Courses et Restaurant ». Cocher une rubrique coche ses postes : la sélection reste une
 * simple liste de postes, et rien n'a besoin de savoir si elle vient d'un clic de rubrique ou
 * de postes pris un à un.
 */
const { data: groups } = useCategories()
const groupsWithItems = computed(() => groups.value.filter(g => g.items.length > 0))

const open = ref(false)
const query = ref('')
const triggerRef = ref<HTMLButtonElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)

const selected = computed(() => new Set(props.modelValue))

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Rubriques et postes filtrés par la recherche. Une rubrique qui correspond garde tous ses postes. */
const visibleGroups = computed(() => {
  const needle = normalize(query.value.trim())
  if (needle === '') return groupsWithItems.value
  return groupsWithItems.value
    .map((g) => {
      if (normalize(g.label).includes(needle)) return g
      return { ...g, items: g.items.filter(i => normalize(i.label).includes(needle)) }
    })
    .filter(g => g.items.length > 0)
})

const isItemChecked = (code: string) => selected.value.has(code)

/** Une rubrique est cochée quand TOUS ses postes le sont ; partiellement, elle est indéterminée. */
function groupState(items: Array<{ code: string }>) {
  const on = items.filter(i => selected.value.has(i.code)).length
  return { all: on === items.length && on > 0, some: on > 0 && on < items.length }
}

function setCodes(codes: Iterable<string>) {
  emit('update:modelValue', [...new Set(codes)])
}

function toggleItem(code: string) {
  const next = new Set(selected.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  setCodes(next)
}

function toggleGroup(items: Array<{ code: string }>) {
  const next = new Set(selected.value)
  const { all } = groupState(items)
  for (const i of items) {
    if (all) next.delete(i.code)
    else next.add(i.code)
  }
  setCodes(next)
}

function clear() {
  setCodes([])
}

/**
 * Résumé porté par le déclencheur.
 *
 * Un compteur seul (« 3 postes ») oblige à ouvrir le panneau pour savoir lesquels ; un poste
 * unique se nomme donc, et une rubrique entière aussi.
 */
const summary = computed(() => {
  if (props.modelValue.length === 0) return 'Tous les postes'
  const flat = groupsWithItems.value.flatMap(g => g.items.map(i => ({ ...i, groupLabel: g.label })))
  if (props.modelValue.length === 1) {
    const only = flat.find(i => i.code === props.modelValue[0])
    return only ? `${only.groupLabel} · ${only.label}` : props.modelValue[0]!
  }
  const whole = groupsWithItems.value.find(g => g.items.length === props.modelValue.length
    && g.items.every(i => selected.value.has(i.code)))
  return whole ? `${whole.label} — toute la rubrique` : `${props.modelValue.length} postes`
})

function toggle() {
  open.value = !open.value
  if (open.value) {
    query.value = ''
    void nextTick(() => searchRef.value?.focus())
  }
}

function closeAndRestoreFocus() {
  open.value = false
  void nextTick(() => triggerRef.value?.focus())
}

function onClickOutside(event: MouseEvent) {
  const target = event.target as Node | null
  if (rootRef.value && target && !rootRef.value.contains(target)) open.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) closeAndRestoreFocus()
}

// Les écouteurs ne vivent que pendant l'ouverture — même raison que dans `CategoryEditor` :
// un écouteur par instance posé au montage se paie sur toutes les lignes de la page.
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('click', onClickOutside)
    document.addEventListener('keydown', onKey)
  }
  else {
    document.removeEventListener('click', onClickOutside)
    document.removeEventListener('keydown', onKey)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <span
    ref="rootRef"
    class="cat-filter"
  >
    <button
      ref="triggerRef"
      type="button"
      class="input input--sm cat-filter__trigger"
      :aria-expanded="open"
      :aria-label="`Filtrer par poste : ${summary}`"
      @click="toggle"
    >
      <span class="cat-filter__summary">{{ summary }}</span>
      <span aria-hidden="true">▾</span>
    </button>

    <div
      v-if="open"
      class="cat-filter__menu overlay"
      role="group"
      aria-label="Choisir les postes à afficher"
    >
      <div class="cat-filter__head">
        <input
          ref="searchRef"
          v-model="query"
          type="search"
          class="input input--sm"
          placeholder="Chercher un poste…"
          aria-label="Chercher un poste"
        >
        <button
          type="button"
          class="btn btn--quiet btn--sm"
          :aria-disabled="modelValue.length === 0"
          :aria-label="modelValue.length === 0
            ? 'Tout afficher — indisponible, aucun poste n\'est filtré'
            : 'Tout afficher'"
          @click="clear"
        >
          Tout afficher
        </button>
      </div>

      <p
        v-if="visibleGroups.length === 0"
        class="cat-filter__empty"
      >
        Aucun poste ne correspond.
      </p>

      <ul
        v-else
        class="cat-filter__list"
      >
        <li
          v-for="group in visibleGroups"
          :key="group.code"
        >
          <label class="cat-filter__row cat-filter__row--group">
            <input
              type="checkbox"
              :checked="groupState(group.items).all"
              :indeterminate="groupState(group.items).some"
              @change="toggleGroup(group.items)"
            >
            <span>{{ group.label }}</span>
          </label>
          <label
            v-for="item in group.items"
            :key="item.code"
            class="cat-filter__row cat-filter__row--item"
          >
            <input
              type="checkbox"
              :checked="isItemChecked(item.code)"
              @change="toggleItem(item.code)"
            >
            <span>{{ item.label }}</span>
          </label>
        </li>
      </ul>
    </div>
  </span>
</template>

<style scoped>
.cat-filter { position: relative; display: inline-block; }
.cat-filter__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 16rem;
  max-width: 100%;
  cursor: pointer;
  text-align: left;
}
.cat-filter__summary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cat-filter__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  width: 20rem;
  max-width: calc(100vw - 16px);
  max-height: 22rem;
  overflow-y: auto;
  padding-bottom: var(--space-1);
}
.cat-filter__head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-hairline);
}
.cat-filter__head .input { flex: 1; min-width: 0; }
.cat-filter__list { list-style: none; }
.cat-filter__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-sm);
}
.cat-filter__row:hover { background: var(--color-accent-subtle); }
.cat-filter__row--group { font-weight: 600; }
.cat-filter__row--item { padding-left: var(--space-6); }
.cat-filter__empty { padding: var(--space-3); color: var(--color-text-muted); font-size: var(--font-size-sm); }
</style>
