<script setup lang="ts">
import type { MovementNature } from '~~/shared/types/movement-nature'

const props = defineProps<{
  currentCode: string
  transactionId: number
  /**
   * Libellé compact du déclencheur — « Modifier » dans la descente d'analyse.
   *
   * Là-bas, chaque ligne est DÉJÀ sous son poste : réafficher « Alimentation · Courses » sur
   * chacune des quarante lignes du poste répète quarante fois ce que le titre au-dessus dit une
   * fois. Le nom accessible, lui, garde le poste courant : hors contexte visuel, « Modifier »
   * seul ne dit pas ce qu'on modifie.
   */
  triggerLabel?: string
}>()

const emit = defineEmits<{ change: [transactionId: number, code: string] }>()

const { data: groups, pending } = useCategories()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const flatItems = computed(() => flattenReferential(groups.value))

/**
 * Le libellé seul ne désigne pas un poste : « Restaurant » existe sous Alimentation ET sous
 * Voyages (FR19). Le déclencheur porte donc la rubrique, sinon deux transactions rangées
 * dans des postes différents s'affichent à l'identique.
 */
const current = computed(() => flatItems.value.find(i => i.code === props.currentCode))
const currentLabel = computed(() =>
  current.value ? `${current.value.groupLabel} · ${current.value.label}` : props.currentCode,
)

const NATURE_LABELS: Record<MovementNature, string> = {
  income: 'Recette',
  expense: 'Dépense',
  internal_transfer: 'Mouvement interne',
}

/** Rubriques non vides seulement : une rubrique sans poste n'offre rien à choisir. */
const groupsWithItems = computed(() => groups.value.filter(g => g.items.length > 0))

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
      :class="{ 'cat-editor__trigger--compact': triggerLabel }"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="triggerLabel ? `${triggerLabel} le poste : ${currentLabel}` : `Poste : ${currentLabel}`"
      :title="currentLabel"
      @click="toggle"
    >
      <span class="cat-editor__current">{{ triggerLabel ?? currentLabel }}</span>
      <span aria-hidden="true">▾</span>
    </button>

    <div
      v-if="open"
      class="cat-editor__menu"
      role="listbox"
      :aria-label="`Choisir un poste pour la transaction ${transactionId}`"
    >
      <p
        v-if="pending && groups.length === 0"
        class="cat-editor__empty"
      >
        Chargement…
      </p>
      <p
        v-else-if="groupsWithItems.length === 0"
        class="cat-editor__empty"
      >
        Aucun poste disponible.
      </p>
      <ul
        v-else
        class="cat-editor__list"
      >
        <li
          v-for="group in groupsWithItems"
          :key="group.code"
        >
          <p
            :id="`cat-group-${group.code}`"
            class="cat-editor__group"
          >
            {{ group.label }}
          </p>
          <ul
            class="cat-editor__list"
            :aria-labelledby="`cat-group-${group.code}`"
          >
            <li
              v-for="item in group.items"
              :key="item.code"
            >
              <button
                type="button"
                role="option"
                class="cat-editor__option"
                :class="{ 'cat-editor__option--selected': item.code === currentCode }"
                :aria-selected="item.code === currentCode"
                @click="onSelect(item.code)"
              >
                <span>{{ item.label }}</span>
                <small
                  v-if="item.nature !== 'expense'"
                  class="cat-editor__badge"
                >{{ NATURE_LABELS[item.nature] }}</small>
              </button>
            </li>
          </ul>
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
/* Variante compacte : un bouton d'action au bout d'une ligne, pas un champ. */
.cat-editor__trigger--compact {
  padding: 0 var(--space-1);
  border-color: transparent;
  background: none;
  color: var(--color-accent);
  font-size: var(--font-size-xs);
}
.cat-editor__trigger--compact:hover { border-color: var(--color-accent); }
/* Une seule ligne, tronquée : un libellé qui passe à la ligne fait grandir toute la rangée du
   tableau. La valeur complète reste dans le nom accessible et l'infobulle (NFR20). */
.cat-editor__trigger { max-width: 100%; }
.cat-editor__current { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-editor__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  min-width: 240px;
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
.cat-editor__group {
  margin: var(--space-2) 0 var(--space-1);
  padding: 0 var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
