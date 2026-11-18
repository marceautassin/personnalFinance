<script setup lang="ts">
import type { TransactionListItem } from '~/composables/useTransactions'
import { useCategories, flattenReferential } from '~/composables/useCategories'
import { sortTransactions, type SortKey, type SortDirection } from '~/utils/transaction-sort'

const props = defineProps<{
  transactions: TransactionListItem[]
  /** Lignes cochées, portées par la page — c'est elle qui sait quoi en faire (epic 19). */
  selected?: number[]
}>()

const emit = defineEmits<{
  categoryChange: [transactionId: number, code: string]
  /**
   * L'INTENTION, pas le résultat : c'est la page qui tient la sélection et la recalcule.
   *
   * Renvoyer ici un tableau déjà calculé perdait un clic sur deux — deux cases cochées coup
   * sur coup lisaient la même prop, pas encore rafraîchie, et la seconde écrasait la première
   * (recette du 2026-09-07).
   */
  toggleSelect: [transactionId: number]
  toggleAllVisible: [ids: number[]]
}>()

const selectedSet = computed(() => new Set(props.selected ?? []))

/** Coche ou décoche tout ce qui est VISIBLE — jamais ce qu'un filtre a écarté. */
const allVisibleSelected = computed(() =>
  props.transactions.length > 0 && props.transactions.every(t => selectedSet.value.has(t.id)),
)

/**
 * Tri par colonne, CLIENT (demande du 2026-09-07).
 *
 * Les lignes de la période sont déjà toutes chargées : un aller-retour serveur par clic
 * n'apporterait rien et ferait clignoter la liste. Le tri par défaut — date croissante — est
 * exactement l'ordre rendu par l'API, si bien que l'écran ne bouge pas tant qu'on ne clique
 * pas.
 */
const sortKey = ref<SortKey>('date')
const sortDirection = ref<SortDirection>('asc')

const COLUMNS: Array<{ key: SortKey, label: string, class?: string }> = [
  { key: 'date', label: 'Date', class: 'tx-list__col-date' },
  { key: 'label', label: 'Libellé' },
  { key: 'amount', label: 'Montant', class: 'tx-list__col-amount num' },
  { key: 'category', label: 'Catégorie', class: 'tx-list__col-cat' },
]

const { data: groups } = useCategories()
/** Le tri par catégorie porte sur le LIBELLÉ affiché, pas sur le code qui le porte. */
const labelByCode = computed(() =>
  new Map(flattenReferential(groups.value).map(i => [i.code, `${i.groupLabel} · ${i.label}`])),
)

const sorted = computed(() =>
  sortTransactions(
    props.transactions,
    sortKey.value,
    sortDirection.value,
    code => labelByCode.value.get(code) ?? code,
  ),
)

/**
 * Un premier clic trie dans le sens NATUREL de la colonne, un second l'inverse.
 *
 * Naturel veut dire : une date du plus ancien au plus récent, un texte de A à Z, un montant
 * de la plus grosse dépense à la plus grosse recette. Repartir systématiquement en croissant
 * obligerait à cliquer deux fois sur la colonne dont on veut le classement évident.
 */
function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDirection.value = 'asc'
}

/** `aria-sort` porte l'état au lecteur d'écran ; la flèche ne le dit qu'à l'œil. */
const ariaSort = (key: SortKey) =>
  sortKey.value === key ? (sortDirection.value === 'asc' ? 'ascending' : 'descending') : 'none'
</script>

<template>
  <table class="table tx-list">
    <thead>
      <tr>
        <th
          scope="col"
          class="tx-list__col-pick"
        >
          <input
            type="checkbox"
            :checked="allVisibleSelected"
            :aria-label="allVisibleSelected ? 'Tout décocher' : 'Cocher toutes les lignes affichées'"
            @change="emit('toggleAllVisible', allVisibleSelected ? [] : props.transactions.map(t => t.id))"
          >
        </th>
        <th
          v-for="col in COLUMNS"
          :key="col.key"
          scope="col"
          :class="col.class"
          :aria-sort="ariaSort(col.key)"
        >
          <button
            type="button"
            class="tx-list__sort"
            :aria-label="`Trier par ${col.label}${sortKey === col.key && sortDirection === 'asc' ? ', actuellement croissant' : sortKey === col.key ? ', actuellement décroissant' : ''}`"
            @click="toggleSort(col.key)"
          >
            {{ col.label }}
            <span
              class="tx-list__arrow"
              aria-hidden="true"
            >{{ sortKey === col.key ? (sortDirection === 'asc' ? '▴' : '▾') : '' }}</span>
          </button>
        </th>
      </tr>
    </thead>
    <tbody>
      <TransactionRow
        v-for="tx in sorted"
        :key="tx.id"
        :transaction="tx"
        :selected="selectedSet.has(tx.id)"
        @toggle-select="(id) => emit('toggleSelect', id)"
        @category-change="(id, code) => emit('categoryChange', id, code)"
      />
    </tbody>
  </table>
</template>

<style scoped>
/* Le tableau lui-même vient de `components.css` : hauteur de ligne, filets, en-tête collant et
   survol y sont définis une fois pour les quatre tableaux de l'application. Ne restent ici que
   les LARGEURS de colonne, qui dépendent de ce que cette table-ci contient. */
.tx-list { table-layout: fixed; }
.tx-list__col-pick { width: 2.5rem; }
.tx-list__col-date { width: 5.5rem; }
.tx-list__col-amount { width: 7.5rem; }
/* Assez large pour « Abonnements et prélèvements · Streaming » sur une seule ligne : à 32 px
   de hauteur, un retour à la ligne déforme la ligne et casse le rythme du tableau. */
.tx-list__col-cat { width: 19rem; }

/* Le bouton hérite de l'en-tête : même graisse, même couleur, même alignement. Seul le
   curseur et la flèche signalent qu'il est actionnable. */
.tx-list__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: inherit;
}
.tx-list__sort:hover { color: var(--color-accent); }
/* La flèche occupe sa place même absente : sans cela, la largeur de l'en-tête change au clic
   et les colonnes sautent. */
.tx-list__arrow { display: inline-block; min-width: 0.75em; font-size: var(--font-size-xs); }
.tx-list__col-amount .tx-list__sort { justify-content: flex-end; width: 100%; }
</style>
