<script setup lang="ts">
const props = defineProps<{
  currentCode: string
  transactionId: number
}>()

const emit = defineEmits<{ change: [transactionId: number, code: string] }>()

const { data: categories, pending } = useCategories()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const currentLabel = computed(() => {
  return categories.value.find(c => c.code === props.currentCode)?.label ?? props.currentCode
})

function toggle() {
  open.value = !open.value
}

function onSelect(code: string) {
  open.value = false
  if (code === props.currentCode) return
  emit('change', props.transactionId, code)
}

function onClickOutside(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node | null
  if (rootRef.value && target && !rootRef.value.contains(target)) {
    open.value = false
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <span
    ref="rootRef"
    class="cat-editor"
  >
    <button
      type="button"
      class="cat-editor__trigger"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      {{ currentLabel }}
      <span aria-hidden="true">▾</span>
    </button>

    <div
      v-if="open"
      class="cat-editor__menu"
      role="listbox"
      :aria-label="`Choisir une catégorie pour la transaction ${transactionId}`"
    >
      <p
        v-if="pending && categories.length === 0"
        class="cat-editor__empty"
      >
        Chargement…
      </p>
      <p
        v-else-if="categories.length === 0"
        class="cat-editor__empty"
      >
        Aucune catégorie disponible.
      </p>
      <ul
        v-else
        class="cat-editor__list"
      >
        <li
          v-for="cat in categories"
          :key="cat.code"
        >
          <button
            type="button"
            role="option"
            class="cat-editor__option"
            :class="{ 'cat-editor__option--selected': cat.code === currentCode }"
            :aria-selected="cat.code === currentCode"
            @click="onSelect(cat.code)"
          >
            <span>{{ cat.label }}</span>
            <small
              v-if="!cat.isVariable"
              class="cat-editor__badge"
            >fixe</small>
          </button>
        </li>
      </ul>
    </div>
  </span>
</template>

<style scoped>
.cat-editor { position: relative; display: inline-block; }
.cat-editor__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
  color: inherit;
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.cat-editor__trigger:hover { border-color: var(--color-accent); }
.cat-editor__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  min-width: 180px;
  max-height: 280px;
  overflow-y: auto;
  padding: var(--space-1) 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.12));
}
.cat-editor__list { list-style: none; margin: 0; padding: 0; }
.cat-editor__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
  color: inherit;
}
.cat-editor__option:hover { background: var(--color-neutral-100); }
.cat-editor__option--selected { font-weight: 600; background: var(--color-neutral-100); }
.cat-editor__badge { color: var(--color-text-muted); font-size: var(--font-size-xs); }
.cat-editor__empty { padding: var(--space-2) var(--space-3); color: var(--color-text-muted); }
</style>
