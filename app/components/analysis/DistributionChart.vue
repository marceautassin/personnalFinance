<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import { formatRatio, ratio, type Ratio } from '~~/shared/types/ratio'
import type { AnalysisResponse } from '~/composables/useAnalysis'

type NatureNode = AnalysisResponse['natures'][number]
type GroupNode = NatureNode['groups'][number]

const props = defineProps<{
  nature: NatureNode
  title: string
}>()

const emit = defineEmits<{ drill: [itemCode: string, label: string] }>()

const expanded = ref<Set<string>>(new Set())
function toggle(code: string) {
  const next = new Set(expanded.value)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  expanded.value = next
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
          >
            <button
              type="button"
              class="dist__item"
              :aria-label="`Voir les ${item.transactionCount} transaction(s) de ${item.label}`"
              @click="emit('drill', item.itemCode, `${group.label} · ${item.label}`)"
            >
              <span class="dist__name">{{ item.label }}</span>
              <span class="dist__count">{{ item.transactionCount }} tx</span>
              <span class="dist__amount">{{ formatEuros(item.totalCents as Cents) }}</span>
            </button>
          </li>
        </ul>
      </li>
    </ul>

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
.dist__row { grid-template-columns: 1rem minmax(7rem, 12rem) 1fr 3.5rem 6rem 6rem; }
.dist__item { grid-template-columns: minmax(7rem, 1fr) 4rem 6rem; padding-left: var(--space-6, 3rem); }
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
.dist__delta--up { color: var(--color-danger); }
.dist__delta--neutral { color: var(--color-text-muted); }
.dist__caret { color: var(--color-text-muted); }
</style>
