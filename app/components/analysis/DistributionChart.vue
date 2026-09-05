<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import { formatDate } from '~/utils/dates'
import type { RangeTransaction } from '~/composables/useItemTransactions'
import { formatRatio, ratio, type Ratio } from '~~/shared/types/ratio'
import type { AnalysisResponse } from '~/composables/useAnalysis'

type NatureNode = AnalysisResponse['natures'][number]
type GroupNode = NatureNode['groups'][number]

const props = defineProps<{
  nature: NatureNode
  title: string
  /** Libellé de la période de comparaison — « février 2026 », jamais « précédente ». */
  previousLabel?: string | null
  /** Lignes déjà chargées, par code de poste. Le composant ne va jamais les chercher lui-même. */
  transactionsByItem: Record<string, RangeTransaction[]>
  loadingItems: string[]
  failedItems: string[]
}>()

const emit = defineEmits<{ expandItem: [itemCode: string] }>()

const expanded = ref<Set<string>>(new Set())
function toggle(code: string) {
  const next = new Set(expanded.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  expanded.value = next
}

/**
 * Postes dépliés — indépendants des rubriques : on peut en ouvrir plusieurs à la fois pour
 * comparer, et replier une rubrique ne doit pas faire oublier ce qu'on avait ouvert dedans.
 */
const expandedItems = ref<Set<string>>(new Set())
function toggleItem(code: string) {
  const next = new Set(expandedItems.value)
  if (next.has(code)) {
    next.delete(code)
  }
  else {
    next.add(code)
    // Le chargement est demandé au parent : un composant ne fait pas d'appel réseau.
    emit('expandItem', code)
  }
  expandedItems.value = next
}

/** Somme des lignes affichées — elle doit retomber sur le total du poste (NFR2). */
function loadedTotal(itemCode: string): number {
  return (props.transactionsByItem[itemCode] ?? []).reduce((sum, t) => sum + t.amountCents, 0)
}

/**
 * Base de la répartition : la somme des seuls nœuds ORIENTÉS DANS LE SENS DE LEUR NATURE.
 *
 * Un nœud de dépense peut avoir un net positif quand les remboursements dépassent les achats
 * (D28). Ce n'est pas une anomalie, mais une part d'un tout ne peut pas être négative : les
 * nœuds à net inversé sont donc exclus de la base et de la barre, tout en restant visibles
 * dans le tableau avec leur valeur.
 */
/**
 * Sens attendu des montants pour cette nature, en convention bancaire signée.
 *
 * Les mouvements internes n'en ont pas : un virement peut aller dans les deux sens et aucun
 * des deux n'est anormal. On les compare donc en magnitude, sans jamais parler de « net
 * inversé » — ce qui, sur eux, ne voudrait rien dire.
 */
const sign = computed(() => {
  if (props.nature.nature === 'income') return 1
  if (props.nature.nature === 'expense') return -1
  return 0
})

function orientedCents(totalCents: number): number {
  return sign.value === 0 ? Math.abs(totalCents) : totalCents * sign.value
}

const isInverted = (g: GroupNode) => sign.value !== 0 && orientedCents(g.totalCents) < 0

const base = computed(() =>
  props.nature.groups.reduce((sum, g) => sum + Math.max(0, orientedCents(g.totalCents)), 0),
)

const sortedGroups = computed(() =>
  [...props.nature.groups].sort((a, b) => orientedCents(b.totalCents) - orientedCents(a.totalCents)),
)

function share(totalCents: number): Ratio | null {
  return ratio(Math.max(0, orientedCents(totalCents)), base.value)
}

/** Largeur de barre en pourcentage de la plus grosse rubrique — pas de la base. */
const widest = computed(() =>
  Math.max(1, ...props.nature.groups.map(g => Math.max(0, orientedCents(g.totalCents)))),
)
function barWidth(totalCents: number): number {
  return (Math.max(0, orientedCents(totalCents)) / widest.value) * 100
}

/** Écart avec la période précédente, exprimé dans le sens de la nature (FR34). */
function delta(node: { totalCents: number, previousTotalCents: number | null }): number | null {
  if (node.previousTotalCents === null) return null
  return orientedCents(node.totalCents) - orientedCents(node.previousTotalCents)
}

/** Sur les mouvements internes, la part d'un total qui peut changer de sens n'a pas de sens. */
const showsShare = computed(() => sign.value !== 0)

/**
 * Un écart n'est alarmant que sur les DÉPENSES.
 *
 * La couleur était calculée sur la valeur orientée sans regarder la nature : un salaire en
 * hausse de 200 € s'affichait en rouge, comme une alerte (revue du 2026-09-05). Sur les
 * recettes, c'est la BAISSE qui mérite d'être signalée ; sur les mouvements internes, ni l'un
 * ni l'autre ne veut dire quoi que ce soit.
 */
function isDeltaAlarming(value: number): boolean {
  if (props.nature.nature === 'expense') return value > 0
  if (props.nature.nature === 'income') return value < 0
  return false
}
</script>

<template>
  <section class="dist">
    <header class="dist__header">
      <h3 class="dist__title">
        {{ title }}
      </h3>
      <strong class="dist__total">{{ formatEuros(nature.totalCents as Cents) }}</strong>
    </header>

    <!--
      En-têtes de colonnes. Sans eux, la dernière colonne affichait un montant coloré dont
      rien ne disait à quoi il se comparait (recette du 2026-09-05) — et le nom de la période
      de comparaison lève l'ambiguïté mieux que « période précédente ».
    -->
    <div
      v-if="nature.groups.length > 0"
      class="dist__row dist__row--head"
      aria-hidden="true"
    >
      <span />
      <span>Rubrique</span>
      <span />
      <span class="dist__share">Part</span>
      <span class="dist__amount">Montant</span>
      <span class="dist__delta">{{ previousLabel ? `vs ${previousLabel}` : 'vs précédent' }}</span>
    </div>

    <p
      v-if="nature.groups.length === 0"
      class="dist__empty"
    >
      Aucun mouvement sur la période.
    </p>

    <ul
      v-else
      class="dist__list"
    >
      <li
        v-for="group in sortedGroups"
        :key="group.groupCode"
        :data-testid="`dist-group-${group.groupCode}`"
      >
        <button
          type="button"
          class="dist__row"
          :aria-expanded="expanded.has(group.groupCode)"
          :aria-label="`${group.label} — ${formatEuros(group.totalCents as Cents)}`"
          @click="toggle(group.groupCode)"
        >
          <span
            class="dist__caret"
            aria-hidden="true"
          >{{ expanded.has(group.groupCode) ? '▾' : '▸' }}</span>
          <span class="dist__name">{{ group.label }}</span>
          <!--
            SVG inline, sans bibliothèque tierce (AR21). Une barre suffit à comparer des
            rubriques ; un camembert rendrait illisibles les petites parts, qui sont
            justement celles qu'on cherche.
          -->
          <svg
            class="dist__bar"
            :viewBox="`0 0 100 8`"
            preserveAspectRatio="none"
            role="presentation"
          >
            <rect
              x="0"
              y="0"
              :width="barWidth(group.totalCents)"
              height="8"
              rx="2"
              :class="isInverted(group) ? 'dist__fill dist__fill--inverted' : 'dist__fill'"
            />
          </svg>
          <span class="dist__share">{{ !showsShare || isInverted(group) ? '—' : formatRatio(share(group.totalCents)) }}</span>
          <span class="dist__amount">{{ formatEuros(group.totalCents as Cents) }}</span>
          <span
            v-if="delta(group) !== null"
            class="dist__delta"
            :class="{
              'dist__delta--up': isDeltaAlarming(delta(group) ?? 0),
              'dist__delta--neutral': nature.nature === 'internal_transfer',
            }"
          >{{ (delta(group) ?? 0) > 0 ? '+' : '' }}{{ formatEuros(delta(group) as Cents) }}</span>
        </button>

        <ul
          v-if="expanded.has(group.groupCode)"
          class="dist__items"
        >
          <li
            v-for="item in [...group.items].sort((a, b) => orientedCents(b.totalCents) - orientedCents(a.totalCents))"
            :key="item.itemCode"
            :data-testid="`dist-item-${item.itemCode}`"
          >
            <button
              type="button"
              class="dist__item"
              :aria-expanded="expandedItems.has(item.itemCode)"
              :aria-label="`${expandedItems.has(item.itemCode) ? 'Replier' : 'Déplier'} les ${item.transactionCount} transaction(s) de ${item.label}`"
              :disabled="item.transactionCount === 0"
              @click="toggleItem(item.itemCode)"
            >
              <span
                class="dist__caret"
                aria-hidden="true"
              >{{ item.transactionCount === 0 ? '' : expandedItems.has(item.itemCode) ? '▾' : '▸' }}</span>
              <span class="dist__name">{{ item.label }}</span>
              <span class="dist__count">{{ item.transactionCount }} tx</span>
              <span class="dist__amount">{{ formatEuros(item.totalCents as Cents) }}</span>
            </button>

            <!--
              Les lignes sources, dépliées EN PLACE sous leur poste. La hiérarchie reste
              continue — rubrique, poste, transaction — au lieu de renvoyer vers un panneau
              en bas de page qui faisait perdre l'endroit d'où l'on venait.
            -->
            <div
              v-if="expandedItems.has(item.itemCode)"
              class="dist__tx"
            >
              <p
                v-if="failedItems.includes(item.itemCode)"
                class="dist__tx-state dist__tx-state--error"
                role="alert"
              >
                Impossible de charger les lignes de ce poste.
              </p>
              <p
                v-else-if="loadingItems.includes(item.itemCode)"
                class="dist__tx-state"
              >
                Chargement…
              </p>
              <template v-else>
                <ol class="dist__tx-list">
                  <li
                    v-for="tx in transactionsByItem[item.itemCode] ?? []"
                    :key="tx.id"
                    class="dist__tx-row"
                  >
                    <span class="dist__tx-date">{{ formatDate(tx.transactionDate) }}</span>
                    <span class="dist__tx-label">{{ tx.label }}</span>
                    <span class="dist__tx-amount">{{ formatEuros(tx.amountCents as Cents) }}</span>
                    <NuxtLink
                      :to="`/reconciliation/${tx.statementHash}`"
                      class="dist__tx-source"
                      :aria-label="`Relevé d'origine de ${tx.label}`"
                    >
                      relevé
                    </NuxtLink>
                  </li>
                </ol>
                <p class="dist__tx-state">
                  {{ (transactionsByItem[item.itemCode] ?? []).length }} ligne(s),
                  total {{ formatEuros(loadedTotal(item.itemCode) as Cents) }}
                </p>
              </template>
            </div>
          </li>
        </ul>
      </li>
    </ul>

    <p
      v-if="nature.groups.length > 0"
      class="dist__note"
    >
      <template v-if="nature.nature === 'expense'">
        Une dépense en hausse est en rouge, en baisse en vert.
      </template>
      <template v-else-if="nature.nature === 'income'">
        Une recette en baisse est en rouge, en hausse en vert.
      </template>
      <template v-else>
        Sur les mouvements internes, un écart n'a pas de sens favorable ou défavorable.
      </template>
    </p>

    <p
      v-if="nature.groups.some(isInverted)"
      class="dist__note"
    >
      Une rubrique au net inversé — davantage de remboursements que de mouvements — n'entre pas
      dans la répartition, mais son montant reste affiché.
    </p>
  </section>
</template>

<style scoped>
.dist { display: flex; flex-direction: column; gap: var(--space-2); }
.dist__header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.dist__title { margin: 0; font-size: var(--font-size-lg); }
.dist__total { font-variant-numeric: tabular-nums; }
.dist__empty, .dist__note { color: var(--color-text-muted); font-size: var(--font-size-sm); margin: 0; }
.dist__list, .dist__items { list-style: none; margin: 0; padding: 0; }
.dist__row, .dist__item {
  display: grid;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2);
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.dist__row { grid-template-columns: 1rem minmax(7rem, 12rem) 1fr 3.5rem 6rem 8rem; }
.dist__row--head {
  cursor: default;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--space-1);
}
.dist__row--head:hover { background: none; }
.dist__item { grid-template-columns: 1rem minmax(7rem, 1fr) 4rem 6rem; padding-left: var(--space-4); }
.dist__item[disabled] { cursor: default; opacity: 0.65; }
.dist__item[disabled]:hover { background: none; }

/* Les lignes vivent sous leur poste, décalées et bornées en hauteur : un poste à 300 lignes
   ne doit pas rendre le reste de la page inatteignable. */
.dist__tx {
  margin: 0 0 var(--space-2) var(--space-6, 3rem);
  padding-left: var(--space-3);
  border-left: 2px solid var(--color-border);
}
.dist__tx-list { list-style: none; margin: 0; padding: 0; max-height: 22rem; overflow-y: auto; }
.dist__tx-row {
  display: grid;
  grid-template-columns: 6rem 1fr 6rem 4rem;
  gap: var(--space-2);
  padding: 2px 0;
  font-size: var(--font-size-xs);
}
.dist__tx-date, .dist__tx-source { color: var(--color-text-muted); }
.dist__tx-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dist__tx-amount { text-align: right; font-variant-numeric: tabular-nums; }
.dist__tx-source { text-align: right; }
.dist__tx-state { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: var(--font-size-xs); }
.dist__tx-state--error { color: var(--color-danger); }
.dist__row:hover, .dist__item:hover { background: var(--color-neutral-100); }
.dist__bar { width: 100%; height: 8px; }
.dist__fill { fill: var(--color-accent); }
.dist__fill--inverted { fill: var(--color-text-muted); }
.dist__share, .dist__amount, .dist__count, .dist__delta {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: var(--font-size-sm);
}
.dist__share, .dist__count { color: var(--color-text-muted); }
.dist__delta { color: var(--color-success); }
.dist__row--head .dist__delta,
.dist__row--head .dist__share,
.dist__row--head .dist__amount { color: var(--color-text-muted); }
.dist__delta--up { color: var(--color-danger); }
.dist__delta--neutral { color: var(--color-text-muted); }
.dist__caret { color: var(--color-text-muted); }
</style>
