<script setup lang="ts">
import type { TransactionListItem } from '~/composables/useTransactions'

defineProps<{
  transactions: TransactionListItem[]
}>()

defineEmits<{
  categoryChange: [transactionId: number, code: string]
}>()
</script>

<template>
  <table class="table tx-list">
    <thead>
      <tr>
        <th
          scope="col"
          class="tx-list__col-date"
        >
          Date
        </th>
        <th scope="col">
          Libellé
        </th>
        <th
          scope="col"
          class="tx-list__col-amount num"
        >
          Montant
        </th>
        <th
          scope="col"
          class="tx-list__col-cat"
        >
          Catégorie
        </th>
      </tr>
    </thead>
    <tbody>
      <TransactionRow
        v-for="tx in transactions"
        :key="tx.id"
        :transaction="tx"
        @category-change="(id, code) => $emit('categoryChange', id, code)"
      />
    </tbody>
  </table>
</template>

<style scoped>
/* Le tableau lui-même vient de `components.css` : hauteur de ligne, filets, en-tête collant et
   survol y sont définis une fois pour les quatre tableaux de l'application. Ne restent ici que
   les LARGEURS de colonne, qui dépendent de ce que cette table-ci contient. */
.tx-list { table-layout: fixed; }
.tx-list__col-date { width: 5.5rem; }
.tx-list__col-amount { width: 7.5rem; }
/* Assez large pour « Abonnements et prélèvements · Streaming » sur une seule ligne : à 32 px
   de hauteur, un retour à la ligne déforme la ligne et casse le rythme du tableau. */
.tx-list__col-cat { width: 19rem; }
</style>
