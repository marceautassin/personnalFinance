<script setup lang="ts">
import type { TransactionListItem } from '~/composables/useTransactions'
import { formatEuros, type Cents } from '~~/shared/types/money'

const props = defineProps<{
  transaction: TransactionListItem
  selected?: boolean
}>()

defineEmits<{
  categoryChange: [transactionId: number, code: string]
  toggleSelect: [transactionId: number]
}>()

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })

const dayLabel = computed(() => {
  const [y, m, d] = props.transaction.transactionDate.split('-').map(Number)
  return dayFormatter.format(new Date(y!, m! - 1, d!))
})

const amountLabel = computed(() => formatEuros(props.transaction.amountCents as Cents))

/** Badge de réconciliation — texte, ton et explication complète en infobulle (NFR20). */
const settlementBadge = computed(() => {
  switch (props.transaction.settlementStatus) {
    case 'neutralized':
      return {
        text: 'remboursé',
        class: 'tag--muted',
        title: 'Avance remboursée : cette ligne ne compte ni dans les dépenses ni dans les recettes.',
      }
    case 'partial':
      return {
        text: 'remboursé en partie',
        class: 'tag--muted',
        title: 'Partiellement remboursée : seul le reste non couvert compte dans l\'analyse.',
      }
    case 'outstanding':
      return {
        text: 'à rembourser',
        class: '',
        title: 'Liée à une réconciliation, mais pas encore remboursée : elle compte entièrement.',
      }
    default:
      return null
  }
})
</script>

<template>
  <tr
    class="tx-row"
    :class="{ 'tx-row--picked': selected }"
  >
    <td class="tx-row__pick">
      <input
        type="checkbox"
        :checked="selected"
        :aria-label="`Sélectionner ${transaction.label}`"
        @change="$emit('toggleSelect', transaction.id)"
      >
    </td>
    <td class="tx-row__date">
      {{ dayLabel }}
    </td>
    <td
      class="tx-row__label"
      :title="transaction.label"
    >
      <!--
        Le flex vit sur un conteneur INTERNE, jamais sur le `<td>` : `display: flex` sort la
        cellule du layout de tableau, et le `vertical-align: middle` de la ligne cesse alors
        de s'y appliquer — le libellé se calait en haut pendant que la date et le montant
        restaient centrés (recette du 2026-09-05).
      -->
      <span class="tx-row__label-inner">
        <span class="tx-row__label-text">{{ transaction.label }}</span>
        <small
          v-if="transaction.isManual"
          class="tag"
          :title="'Catégorie modifiée manuellement'"
        >modifié</small>
        <!--
          Badge de réconciliation (epic 19, demandé le 2026-09-07). Il dit ce que la ligne est
          DEVENUE, pas seulement qu'elle appartient à un groupe : « lié » sans état laisserait
          croire qu'une avance non encore remboursée ne compte plus.
        -->
        <small
          v-if="settlementBadge"
          class="tag"
          :class="settlementBadge.class"
          :title="settlementBadge.title"
        >{{ settlementBadge.text }}</small>
      </span>
    </td>
    <!--
      Montant NEUTRE (epic 16). Peindre chaque ligne en rouge ou en vert faisait un mur de
      couleur où plus rien ne ressortait : le signe moins dit déjà le sens, et la couleur est
      désormais réservée aux totaux, aux écarts et aux alertes.
    -->
    <td class="tx-row__amount num">
      {{ amountLabel }}
    </td>
    <td class="tx-row__cat">
      <CategoryEditor
        :current-code="transaction.categoryItemCode"
        :transaction-id="transaction.id"
        @change="(id, code) => $emit('categoryChange', id, code)"
      />
    </td>
  </tr>
</template>

<style scoped>
.tx-row--picked { background: var(--color-accent-subtle); }
.tx-row__pick { text-align: center; }

.tx-row td { vertical-align: middle; }
.tx-row__date { color: var(--color-text-muted); white-space: nowrap; font-family: var(--font-mono); font-size: var(--font-size-sm); }
.tx-row__label { overflow: hidden; }
/* Le libellé se TRONQUE au lieu de passer à la ligne : un libellé bancaire fait parfois
   quatre-vingts caractères, et le laisser se replier ferait grandir la ligne — donc perdre
   la densité que toute la refonte cherche. Le texte entier reste dans l'infobulle. */
.tx-row__label-inner { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.tx-row__label-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tx-row__amount { white-space: nowrap; }
</style>
