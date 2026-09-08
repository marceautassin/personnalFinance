<script setup lang="ts">
/**
 * Un menu de la barre d'application — un déclencheur, une liste de destinations.
 *
 * Sept liens de même poids ne disaient pas lesquels vont ensemble : « À ranger » est une vue
 * des transactions mais vivait à l'autre bout de la barre, et Import, Règles et Catégories
 * alimentent la base sans que rien ne les rapproche (demande du 2026-09-08).
 *
 * Le déclencheur est un BOUTON, jamais un lien : un élément qui navigue *et* ouvre un menu
 * oblige à deviner ce que fera le clic. La première entrée coûte donc un clic de plus qu'un
 * onglet direct — c'est le prix du regroupement.
 *
 * Le composant ne connaît ni les routes ni les libellés : il les reçoit. C'est ce qui permet
 * de l'employer deux fois sans le paramétrer par un drapeau.
 */
export interface MenuEntry {
  label: string
  href: string
}

const props = defineProps<{
  label: string
  entries: MenuEntry[]
  /** Le menu contient la page courante : son déclencheur reste allumé, menu fermé compris. */
  active: boolean
  /** Un seul menu ouvert à la fois — l'ouverture est arbitrée par la barre, pas par le menu. */
  open: boolean
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

/*
 * `aria-current="true"` et non `"page"` sur le déclencheur : ce n'est ni un lien ni une page,
 * et « page actuelle » annoncerait sur un bouton ce qu'il ne fait pas. `true` est le jeton
 * prévu pour « l'élément courant d'un ensemble » (revue du 2026-09-08). L'entrée qui EST la
 * page courante reçoit son `aria-current="page"` de `NuxtLink`, sans qu'on s'en mêle.
 */

/** Rattache le panneau à son déclencheur (`aria-controls`) — `useId` garantit l'unicité. */
const listId = `bar-menu-${useId()}`

const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)

/**
 * Les entrées, lues dans le DOM plutôt que tenues dans un tableau de `ref`.
 *
 * Un `ref` par callback s'accumule d'un rendu à l'autre et oblige à le purger à la main ;
 * la liste est ici de trois éléments et n'existe que menu ouvert.
 */
function menuItems(): HTMLAnchorElement[] {
  return [...(rootRef.value?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? [])]
}

function toggle() {
  // Un menu vide s'ouvrirait en rectangle vide, en annonçant `aria-expanded="true"` sur rien.
  if (!props.open && props.entries.length === 0) return
  const next = !props.open
  emit('update:open', next)
  // Après le rendu de la liste : les entrées n'existent pas encore au moment du clic.
  if (next) void nextTick(() => menuItems()[0]?.focus())
}

/**
 * Fermeture qui REND le focus au déclencheur (NFR19).
 *
 * Sans restitution, `Escape` renvoie le focus à la racine du document : reprendre la
 * navigation au clavier obligerait à re-tabuler depuis le début de la barre. Le clic à
 * l'extérieur, lui, ne restitue rien — l'utilisateur a désigné lui-même où il allait.
 */
function closeAndRestoreFocus() {
  emit('update:open', false)
  void nextTick(() => triggerRef.value?.focus())
}

/**
 * Naviguer ferme, et RESTITUE le focus au déclencheur (NFR19).
 *
 * La liste est démontée sous le focus de l'utilisateur : sans restitution il retombe sur
 * `body`, et la tabulation repart du haut du document — le menu venait pourtant d'être
 * traversé au clavier.
 */
function onNavigate() {
  closeAndRestoreFocus()
}

function onClickOutside(event: MouseEvent) {
  const target = event.target as Node | null
  if (rootRef.value && target && !rootRef.value.contains(target)) emit('update:open', false)
}

/**
 * Le focus quitte le menu — par `Tab`, dans un sens ou dans l'autre — donc le menu se ferme.
 *
 * Sans lui, tabuler au-delà de la dernière entrée laissait le panneau ouvert par-dessus la page,
 * avec `aria-expanded="true"` sur un déclencheur que plus rien ne reliait au focus courant
 * (revue du 2026-09-08). Traiter la touche `Tab` elle-même obligerait à deviner où le focus va
 * atterrir ; on regarde où il EST arrivé.
 */
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  // `relatedTarget` nul = le focus part vers le document (clic ailleurs, fenêtre qui perd la
  // main) : le clic extérieur s'en charge déjà, et fermer ici volerait le menu à un `Escape`.
  if (!next) return
  if (rootRef.value && !rootRef.value.contains(next)) emit('update:open', false)
}

/**
 * `↓`/`↑` circulent dans la liste, `Home`/`End` vont aux extrémités, `Escape` referme.
 *
 * Écouté sur la RACINE du composant et non sur le document : posé sur le document, il
 * interceptait les flèches de TOUTE la page tant qu'un menu était ouvert — `e.preventDefault()`
 * empêchait le défilement et ramenait le focus dans le menu depuis n'importe où (revue du
 * 2026-09-08). Le focus est forcément dans la racine quand ces touches nous concernent.
 */
function onKey(e: KeyboardEvent) {
  // Menu fermé, `↓` l'ouvre : c'est le raccourci attendu d'un bouton de menu, et le seul qui
  // manquait à un clavier par ailleurs complet.
  if (!props.open) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      toggle()
    }
    return
  }
  if (e.key === 'Escape') {
    closeAndRestoreFocus()
    return
  }
  const items = menuItems()
  if (items.length === 0) return
  const current = items.findIndex(el => el === document.activeElement)

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const step = e.key === 'ArrowDown' ? 1 : -1
    // Circulaire : buter en silence sur la dernière entrée laisse croire que la touche est morte.
    const next = current === -1 ? 0 : (current + step + items.length) % items.length
    items[next]?.focus()
  }
  else if (e.key === 'Home') {
    e.preventDefault()
    items[0]?.focus()
  }
  else if (e.key === 'End') {
    e.preventDefault()
    items.at(-1)?.focus()
  }
}

/**
 * L'écouteur de document ne vit QUE pendant l'ouverture — même raison que dans
 * `CategoryEditor` : un seul menu est ouvert à la fois, un écouteur suffit.
 */
/**
 * `Escape` est écouté sur le DOCUMENT, contrairement aux flèches.
 *
 * Un clic sur le rembourrage du panneau ne le ferme pas — il est dans la racine — mais fait
 * retomber le focus sur `body` : `Escape` sur la racine ne répondait alors plus, et le menu
 * ne se fermait qu'au clic extérieur (revue du 2026-09-08). Cet écouteur-ci ne préempte
 * aucune touche de navigation : c'est ce qui rendait le précédent nuisible.
 */
function onDocumentEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') closeAndRestoreFocus()
}

function stopListening() {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onDocumentEscape)
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('click', onClickOutside)
    document.addEventListener('keydown', onDocumentEscape)
  }
  else stopListening()
})

onBeforeUnmount(stopListening)
</script>

<template>
  <div
    ref="rootRef"
    class="bar-menu"
    @focusout="onFocusOut"
    @keydown="onKey"
  >
    <button
      ref="triggerRef"
      type="button"
      class="bar__link bar-menu__trigger"
      :class="{ 'bar__link--on': active }"
      :aria-expanded="open"
      :aria-controls="listId"
      aria-haspopup="menu"
      :aria-current="active ? 'true' : undefined"
      @click="toggle"
    >
      {{ label }}
      <span
        class="bar-menu__caret"
        aria-hidden="true"
      >▾</span>
    </button>

    <ul
      v-if="open && entries.length > 0"
      :id="listId"
      class="bar-menu__list overlay"
      role="menu"
      :aria-label="label"
    >
      <li
        v-for="entry in entries"
        :key="entry.href"
        role="none"
      >
        <NuxtLink
          :to="entry.href"
          class="bar-menu__item"
          role="menuitem"
          tabindex="-1"
          @click="onNavigate"
        >
          {{ entry.label }}
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.bar-menu { position: relative; display: flex; }
.bar-menu__trigger {
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
  gap: var(--space-1);
}
.bar-menu__caret { font-size: 9px; color: var(--color-text-subtle); }
.bar__link--on .bar-menu__caret { color: inherit; }

/* Le menu s'ouvre SOUS la barre, aligné à gauche du déclencheur. Pas de mesure de placement
   ici, contrairement à `CategoryEditor` : la barre est toujours en haut de la fenêtre, il y a
   donc toujours de la place en dessous. */
.bar-menu__list {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  min-width: 11rem;
  margin: 0;
  padding: var(--space-1);
  list-style: none;
}
.bar-menu__item {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-base);
  color: var(--color-text);
  white-space: nowrap;
}
.bar-menu__item:hover { background: var(--color-neutral-100); }
.bar-menu__item:focus-visible { background: var(--color-accent-subtle); color: var(--color-accent); }
</style>
