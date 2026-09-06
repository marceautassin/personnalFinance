<script setup lang="ts">
import { NATURE_LABELS } from '~~/shared/types/movement-nature'

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
const searchRef = ref<HTMLInputElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)

/**
 * Recherche dans le sélecteur — 51 postes sous 14 rubriques.
 *
 * Sans elle, ranger une ligne obligeait à parcourir la liste entière ; c'est pourtant le geste
 * le plus fréquent du produit. Le champ prend le focus à l'ouverture : trois lettres, `↵`,
 * et la ligne est rangée sans quitter le clavier.
 */
const query = ref('')

/** Sans accent ni casse : « restau » doit trouver « Restauration rapide ». */
const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

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

/** Rubriques non vides seulement : une rubrique sans poste n'offre rien à choisir. */
const groupsWithItems = computed(() => groups.value.filter(g => g.items.length > 0))

/**
 * Résultats filtrés, groupés par rubrique.
 *
 * Le motif est cherché dans « rubrique · poste » et non dans le seul libellé du poste :
 * « Restaurant » existe sous Alimentation ET sous Voyages (FR19), et taper « voyages » doit
 * mener au bon des deux.
 */
const matchingGroups = computed(() => {
  const needle = normalize(query.value.trim())
  if (needle === '') return groupsWithItems.value
  return groupsWithItems.value
    .map(g => ({
      ...g,
      items: g.items.filter(i => normalize(`${g.label} ${i.label}`).includes(needle)),
    }))
    .filter(g => g.items.length > 0)
})

const matchCount = computed(() =>
  matchingGroups.value.reduce((sum, g) => sum + g.items.length, 0),
)

const totalCount = computed(() =>
  groupsWithItems.value.reduce((sum, g) => sum + g.items.length, 0),
)

/**
 * Placement du menu — au-dessus ou en dessous, aligné à gauche ou à droite (recette du
 * 2026-09-06).
 *
 * Le menu était posé en absolu sous le déclencheur, toujours du même côté : sur les dernières
 * lignes d'un relevé, ou sur la colonne de droite, il sortait de l'écran par le bas et par la
 * droite — donc inutilisable là où on en a le plus besoin, puisqu'on range du haut vers le bas.
 *
 * Mesuré à l'ouverture seulement : le menu se ferme au clic extérieur et à `Escape`, il ne
 * survit donc pas à un défilement assez long pour périmer la mesure.
 */
const dropUp = ref(false)
const alignRight = ref(false)
const maxHeight = ref<string | null>(null)

/** Hauteur maximale souhaitée du menu, et sa largeur : elles doivent suivre la feuille de style. */
const MENU_HEIGHT = 320
const MENU_WIDTH = 292
const GAP = 8

function updatePlacement() {
  const rect = triggerRef.value?.getBoundingClientRect()
  if (!rect) return

  const below = window.innerHeight - rect.bottom - GAP
  const above = rect.top - GAP
  // On ne bascule vers le haut que si le bas manque de place ET que le haut en offre plus :
  // remonter un menu dans un espace encore plus étroit n'arrangerait rien.
  dropUp.value = below < MENU_HEIGHT && above > below
  maxHeight.value = `${Math.max(160, Math.min(MENU_HEIGHT, dropUp.value ? above : below))}px`
  alignRight.value = rect.left + MENU_WIDTH > window.innerWidth - GAP
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    query.value = ''
    updatePlacement()
    // Après le rendu du menu : l'input n'existe pas encore au moment du clic.
    void nextTick(() => searchRef.value?.focus())
  }
}

/**
 * Fermeture qui REND le focus au déclencheur — NFR19.
 *
 * L'ouverture déplace le focus dans le champ de recherche ; sans restitution, la fermeture le
 * renvoyait à la racine du document, et ranger la ligne suivante au clavier obligeait à
 * re-tabuler à travers la barre, la navigation et toutes les lignes déjà parcourues. Sur un
 * relevé de 92 lignes, c'est le geste le plus fréquent du produit qui devenait impraticable
 * (revue du 2026-09-05). Le clic à l'extérieur, lui, ne restitue rien : l'utilisateur a
 * lui-même désigné où il voulait aller.
 */
function closeAndRestoreFocus() {
  open.value = false
  void nextTick(() => triggerRef.value?.focus())
}

/** `↵` range dans l'unique résultat : avec un seul candidat, choisir est superflu. */
function onSearchEnter() {
  const only = matchCount.value === 1 ? matchingGroups.value[0]?.items[0] : null
  if (only) onSelect(only.code)
}

function onSelect(code: string) {
  closeAndRestoreFocus()
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
  if (e.key === 'Escape' && open.value) closeAndRestoreFocus()
}

/**
 * Les écouteurs de document ne vivent QUE pendant l'ouverture.
 *
 * Ils étaient posés au montage : deux par ligne, en permanence. Sur un mois de cent lignes on
 * ne le sentait pas ; sur une année, c'est deux mille écouteurs traversés à chaque clic et à
 * chaque frappe. Or un seul menu est ouvert à la fois — deux écouteurs suffisent (recette du
 * 2026-09-06, avant l'ouverture de la vue annuelle).
 */
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

// Un démontage alors que le menu est ouvert — un reclassement qui retire la ligne de la liste
// filtrée, par exemple — laisserait les écouteurs derrière lui.
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
      ref="triggerRef"
      type="button"
      class="cat-editor__trigger"
      :class="{ 'cat-editor__trigger--compact': triggerLabel }"
      :aria-expanded="open"
      :aria-label="triggerLabel ? `${triggerLabel} le poste : ${currentLabel}` : `Poste : ${currentLabel}`"
      :title="currentLabel"
      @click="toggle"
    >
      <span class="cat-editor__current">{{ triggerLabel ?? currentLabel }}</span>
      <span aria-hidden="true">▾</span>
    </button>

    <div
      v-if="open"
      class="cat-editor__menu overlay"
      :class="{ 'cat-editor__menu--up': dropUp, 'cat-editor__menu--right': alignRight }"
      :style="maxHeight ? { maxHeight } : undefined"
      role="group"
      :aria-label="`Choisir un poste pour la transaction ${transactionId}`"
    >
      <div class="cat-editor__search">
        <span aria-hidden="true">⌕</span>
        <input
          ref="searchRef"
          v-model="query"
          type="search"
          class="cat-editor__search-input"
          placeholder="Chercher un poste…"
          aria-label="Chercher un poste"
          @keyup.enter="onSearchEnter"
        >
        <span
          v-if="query.trim() !== ''"
          class="cat-editor__count"
        >{{ matchCount }} / {{ totalCount }}</span>
      </div>

      <p
        v-if="pending && groups.length === 0"
        class="cat-editor__empty"
      >
        Chargement…
      </p>
      <p
        v-else-if="matchingGroups.length === 0"
        class="cat-editor__empty"
      >
        {{ groupsWithItems.length === 0 ? 'Aucun poste disponible.' : `Aucun poste ne contient « ${query.trim()} ».` }}
      </p>
      <ul
        v-else
        class="cat-editor__list"
      >
        <li
          v-for="group in matchingGroups"
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
                class="cat-editor__option"
                :class="{ 'cat-editor__option--selected': item.code === currentCode }"
                :aria-current="item.code === currentCode ? 'true' : undefined"
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
.cat-editor { position: relative; display: inline-block; max-width: 100%; }

/*
 * Le déclencheur n'est PAS un bouton du système : dans un tableau de cent lignes, une bordure
 * par ligne dessine une grille de contrôles là où on veut lire des données. Il se lit comme du
 * texte et ne se révèle qu'au survol.
 */
.cat-editor__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 100%;
  height: var(--row-height-sm);
  padding: 0 var(--space-1);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.cat-editor__trigger:hover { border-color: var(--color-border-strong); background: var(--color-bg-elevated); }
.cat-editor__trigger[aria-expanded='true'] { border-color: var(--color-accent); background: var(--color-bg-elevated); }
/* Variante compacte : une action au bout d'une ligne de descente, pas un champ. */
.cat-editor__trigger--compact { color: var(--color-accent); font-size: var(--font-size-xs); height: auto; }
.cat-editor__trigger--compact:hover { border-color: transparent; background: var(--color-accent-subtle); }
/* Une seule ligne, tronquée : un libellé qui passe à la ligne fait grandir toute la rangée du
   tableau. La valeur complète reste dans le nom accessible et l'infobulle (NFR20). */
.cat-editor__current { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cat-editor__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  width: 292px;
  /* Sur un écran étroit, une largeur fixe déborde à elle seule. */
  max-width: calc(100vw - 16px);
  max-height: 320px;
  overflow-y: auto;
  padding-bottom: var(--space-1);
}
/* Le menu se retourne quand la place manque en dessous, et s'aligne à droite quand elle
   manque à droite (recette du 2026-09-06). */
.cat-editor__menu--up { top: auto; bottom: calc(100% + 4px); }
.cat-editor__menu--right { left: auto; right: 0; }
.cat-editor__search {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--control-height);
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-neutral-50);
  color: var(--color-text-subtle);
}
.cat-editor__search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: var(--font-size-base);
  color: var(--color-text);
}
/* On n'annule PAS l'outline : c'est le contrôle le plus utilisé du produit, et le champ
   perdait son indicateur de focus clavier. C'est le CONTENEUR qui montre le focus, pour que
   le liseré épouse la barre de recherche entière. */
.cat-editor__search:focus-within { box-shadow: inset 0 0 0 2px var(--color-accent); }
.cat-editor__count { font-size: var(--font-size-xs); color: var(--color-text-muted); font-family: var(--font-mono); }

.cat-editor__list { list-style: none; margin: 0; padding: 0; }
.cat-editor__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  height: var(--row-height-sm);
  padding: 0 var(--space-3);
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  font-size: var(--font-size-base);
  cursor: pointer;
  color: inherit;
}
.cat-editor__option:hover { background: var(--color-neutral-50); }
.cat-editor__option--selected { font-weight: 500; background: var(--color-accent-subtle); color: var(--color-accent); }
.cat-editor__badge { color: var(--color-text-muted); font-size: var(--font-size-xs); }
.cat-editor__empty { padding: var(--space-3); color: var(--color-text-muted); font-size: var(--font-size-sm); }
.cat-editor__group {
  margin: var(--space-2) 0 var(--space-1);
  padding: 0 var(--space-3);
  color: var(--color-text-subtle);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
