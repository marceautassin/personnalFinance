<script setup lang="ts">
import { formatEuros, type Cents } from '~~/shared/types/money'
import { formatDate } from '~/utils/dates'
import type { RangeTransaction } from '~/composables/useItemTransactions'
import { formatRatio, ratio, type Ratio } from '~~/shared/types/ratio'
import type { AnalysisResponse } from '~/composables/useAnalysis'
import { describeDistributionNode } from '~/utils/distribution-label'

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

const emit = defineEmits<{
  expandItem: [itemCode: string]
  collapseItem: [itemCode: string]
  recategorize: [transaction: RangeTransaction, categoryItemCode: string]
}>()

/** Nom accessible d'une rubrique — la construction vit dans `distribution-label.ts`. */
function groupLabel(group: GroupNode): string {
  const d = delta(group)
  return describeDistributionNode({
    label: group.label,
    totalCents: group.totalCents as Cents,
    transactionCount: group.items.reduce((sum, i) => sum + i.transactionCount, 0),
    deltaCents: d as Cents | null,
    share: showsShare.value && !isInverted(group) ? share(group.totalCents) : null,
    expanded: expanded.value.has(group.groupCode),
    previousLabel: props.previousLabel ?? null,
    deltaIsAlarming: d !== null && isDeltaAlarming(d),
  })
}

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
/** Nom accessible d'un poste — même construction que la rubrique, un seul endroit. */
function itemLabel(item: GroupNode['items'][number]): string {
  const d = delta(item)
  return describeDistributionNode({
    label: item.label,
    totalCents: item.totalCents as Cents,
    transactionCount: item.transactionCount,
    deltaCents: d as Cents | null,
    // Un poste n'affiche pas de barre de part : ne pas l'annoncer non plus.
    share: null,
    expanded: expandedItems.value.has(item.itemCode),
    previousLabel: props.previousLabel ?? null,
    deltaIsAlarming: d !== null && isDeltaAlarming(d),
  })
}

function toggleItem(code: string) {
  // `aria-disabled` laisse le clic partir : la garde vit donc ici, pas dans l'attribut.
  const item = props.nature.groups.flatMap(g => g.items).find(i => i.itemCode === code)
  if (item?.transactionCount === 0) return
  const next = new Set(expandedItems.value)
  if (next.has(code)) {
    next.delete(code)
    // Le parent vide le cache du poste : le rouvrir redemandera des lignes fraîches, plutôt
    // que d'en réafficher d'anciennes (story 17.6).
    emit('collapseItem', code)
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
 * Les mouvements internes montrent leurs FLUX BRUTS — sorties et entrées — plutôt qu'une part
 * (story 18.11).
 *
 * Sur eux, le net ment par omission : « Virement entre comptes » vaut −651,40 € sur 2026 alors
 * que 4 512 € sont sortis et 3 861 € rentrés. Et la part n'a de toute façon pas de sens ici,
 * la nature n'ayant pas de sens attendu : les deux colonnes qu'elle occupait sont libres.
 */
const showsFlows = computed(() => props.nature.nature === 'internal_transfer')

/** Un sens jamais emprunté s'affiche « — » : un « 0,00 € » se lirait comme un flux nul mesuré. */
const flow = (value: number) => (value === 0 ? '—' : formatEuros(value as Cents))

/**
 * Ce que le bloc raconte, en une phrase, selon le sens de son net.
 *
 * Sans elle, l'utilisateur voit un total positif sans savoir s'il a puisé dans son épargne ou
 * l'a alimentée — la question qui a ouvert cette story.
 */
const flowsReading = computed(() => {
  const net = props.nature.totalCents
  if (net > 0) {
    return 'Net revenu sur le compte courant depuis vos autres comptes : de l\'argent que vous y avez repris.'
  }
  if (net < 0) {
    return 'Net parti du compte courant vers vos autres comptes : de l\'argent que vous y avez placé.'
  }
  return 'Autant d\'argent est parti du compte courant qu\'il en est revenu.'
})

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
  <section
    class="dist panel"
    :class="{ 'dist--flows': showsFlows }"
  >
    <header class="panel__head">
      <h3 class="panel__title">
        {{ title }}
      </h3>
      <strong class="dist__total num">{{ formatEuros(nature.totalCents as Cents) }}</strong>
    </header>

    <p
      v-if="showsFlows && nature.groups.length > 0"
      class="dist__reading"
    >
      {{ flowsReading }}
    </p>

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
      <template v-if="showsFlows">
        <span class="dist__amount">Sorties</span>
        <span class="dist__amount">Entrées</span>
      </template>
      <template v-else>
        <span />
        <span class="dist__share">Part</span>
      </template>
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
          :aria-label="groupLabel(group)"
          @click="toggle(group.groupCode)"
        >
          <span
            class="dist__caret"
            aria-hidden="true"
          >{{ expanded.has(group.groupCode) ? '▾' : '▸' }}</span>
          <span class="dist__name">{{ group.label }}</span>
          <template v-if="showsFlows">
            <span class="dist__amount dist__flow">{{ flow(group.outflowCents) }}</span>
            <span class="dist__amount dist__flow">{{ flow(group.inflowCents) }}</span>
          </template>
          <!--
            SVG inline, sans bibliothèque tierce (AR21). Une barre suffit à comparer des
            rubriques ; un camembert rendrait illisibles les petites parts, qui sont
            justement celles qu'on cherche.
          -->
          <svg
            v-else-if="showsShare"
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
          <span v-else />
          <span
            v-if="!showsFlows"
            class="dist__share"
          >{{ !showsShare || isInverted(group) ? '—' : formatRatio(share(group.totalCents)) }}</span>
          <span class="dist__amount">{{ formatEuros(group.totalCents as Cents) }}</span>
          <span
            v-if="delta(group) !== null"
            class="dist__delta"
            :class="{
              'dist__delta--flat': delta(group) === 0,
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
              :aria-expanded="item.transactionCount === 0 ? undefined : expandedItems.has(item.itemCode)"
              :aria-disabled="item.transactionCount === 0"
              :aria-label="itemLabel(item)"
              @click="toggleItem(item.itemCode)"
            >
              <span
                class="dist__caret"
                aria-hidden="true"
              >{{ item.transactionCount === 0 ? '' : expandedItems.has(item.itemCode) ? '▾' : '▸' }}</span>
              <span class="dist__name">{{ item.label }}</span>
              <template v-if="showsFlows">
                <span class="dist__amount dist__flow">{{ flow(item.outflowCents) }}</span>
                <span class="dist__amount dist__flow">{{ flow(item.inflowCents) }}</span>
                <span class="dist__amount">{{ formatEuros(item.totalCents as Cents) }}</span>
                <span class="dist__count">{{ item.transactionCount }} tx</span>
              </template>
              <template v-else>
                <span />
                <span class="dist__count">{{ item.transactionCount }} tx</span>
                <span class="dist__amount">{{ formatEuros(item.totalCents as Cents) }}</span>
                <span />
              </template>
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
                    <!--
                      Reclassement EN PLACE. Le lien « relevé » qui occupait cette colonne
                      renvoyait vers le PDF d'origine — une information qu'on ne vient jamais
                      chercher ici. Quand on lit ses dépenses poste par poste, ce qu'on veut
                      faire d'une ligne mal rangée, c'est la ranger (recette du 2026-09-05).
                    -->
                    <CategoryEditor
                      :transaction-id="tx.id"
                      :current-code="tx.categoryItemCode"
                      trigger-label="Modifier"
                      @change="(_id, code) => emit('recategorize', tx, code)"
                    />
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
      class="panel__foot dist__note"
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
      class="panel__foot dist__note"
    >
      Une rubrique au net inversé — davantage de remboursements que de mouvements — n'entre pas
      dans la répartition, mais son montant reste affiché.
    </p>
  </section>
</template>

<style scoped>
/*
 * Trois niveaux dans un tableau continu : rubrique 32 px, poste 30 px en retrait, ligne 28 px
 * plus en retrait encore. La hiérarchie tient par la HAUTEUR et le RETRAIT, jamais par un
 * cadre : chaque encadré supplémentaire coupe le chemin qui prouve le total (NFR2).
 */
.dist { display: flex; flex-direction: column; }
.dist__total { font-size: var(--font-size-md); font-weight: 600; margin-left: auto; }
.dist__empty { color: var(--color-text-muted); font-size: var(--font-size-sm); margin: 0; padding: var(--space-3); }
.dist__note { margin: 0; }
.dist__list, .dist__items, .dist__tx-list { list-style: none; margin: 0; padding: 0; }

.dist__row, .dist__item {
  display: grid;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: 0 var(--space-3);
  border: none;
  border-bottom: 1px solid var(--color-hairline);
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.dist__row,
.dist__item { grid-template-columns: 1rem minmax(7rem, 14rem) 1fr 4rem 6.5rem 8rem; }
/* Mouvements internes : la barre et la part n'ont pas de sens ici, leurs deux colonnes
   accueillent les flux bruts (story 18.11). */
.dist--flows .dist__row,
.dist--flows .dist__item { grid-template-columns: 1rem minmax(7rem, 14rem) 7rem 7rem 6.5rem 6rem; }
.dist__flow { color: var(--color-text-muted); }
.dist__reading {
  padding: 0 var(--space-3) var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  line-height: var(--line-height-normal);
}
.dist__row { height: var(--row-height); }
.dist__row--head {
  height: var(--row-height-sm);
  white-space: nowrap;
  cursor: default;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-border-strong);
}
.dist__row--head:hover { background: var(--color-neutral-50); }
/* Le retrait porte sur le LIBELLÉ et non sur la ligne : décaler la ligne entière décalerait
   aussi ses montants, et « Montant » ne tomberait plus sous « Montant ». */
.dist__item {
  height: 30px;
  font-size: var(--font-size-sm);
  background: var(--color-neutral-50);
}
.dist__item .dist__name { padding-left: var(--space-4); }
.dist__item[aria-disabled='true'] { cursor: default; color: var(--color-neutral-500); }
.dist__row:hover, .dist__item:hover { background: var(--color-neutral-100); }

/* Les lignes vivent sous leur poste, décalées. Pas de hauteur bornée : le menu de reclassement
   s'ouvre en position absolue et un conteneur qui défile le rognerait sur les dernières lignes.
   Le poste se replie, ce qui suffit à ne pas noyer la page. */
.dist__tx { padding: 0 var(--space-3) var(--space-2) var(--space-8); }
.dist__tx-row {
  display: grid;
  grid-template-columns: 4.5rem 1fr 5.5rem auto;
  align-items: center;
  gap: var(--space-2);
  height: var(--row-height-sm);
  font-size: var(--font-size-sm);
  border-bottom: 1px solid var(--color-hairline);
}
.dist__tx-date { color: var(--color-text-muted); font-family: var(--font-mono); font-size: var(--font-size-xs); }
.dist__tx-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dist__tx-amount { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.dist__tx-state { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: var(--font-size-xs); }
.dist__tx-state--error { color: var(--color-danger); }

.dist__bar { width: 100%; height: 5px; }
.dist__fill { fill: var(--color-accent); }
.dist__fill--inverted { fill: var(--color-text-subtle); }
.dist__share, .dist__amount, .dist__count, .dist__delta {
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--font-size-sm);
}
.dist__share, .dist__count { color: var(--color-text-muted); font-size: var(--font-size-xs); }
/*
 * La couleur SIGNALE, elle ne décore pas : la colonne « Montant » reste neutre, seul l'ÉCART
 * est coloré. Peindre chaque montant en rouge rendait le rouge muet (epic 16).
 */
.dist__delta { color: var(--color-success); }
.dist__row--head .dist__delta,
.dist__row--head .dist__share,
.dist__row--head .dist__amount,
.dist__row--head .dist__count { color: var(--color-text-muted); font-family: var(--font-sans); }
.dist__delta--up { color: var(--color-danger); }
/* Un écart NUL n'est pas une amélioration : sans cette règle il tombait dans le vert par
   défaut, et « 0,00 € » se lisait comme un progrès (revue du 2026-09-05). */
.dist__delta--flat { color: var(--color-neutral-500); }
/* `neutral-500` et non `text-subtle` : c'est un MONTANT, il doit rester lisible (4,63:1). */
.dist__delta--neutral { color: var(--color-neutral-500); }
.dist__caret { color: var(--color-text-subtle); font-size: 9px; }
.dist__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
