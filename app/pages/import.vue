<script setup lang="ts">
import { useStatementsList, type StatementListItem } from '~/composables/useStatements'
import { useIngestionQueue } from '~/composables/useIngestionQueue'
import { formatRatio } from '~~/shared/types/ratio'
import type { Cents } from '~~/shared/types/money'
import { MANUAL_CORRECTION_THRESHOLD } from '~~/shared/constants/quality-thresholds'

const { data: listData } = useStatementsList()
const {
  items,
  running,
  awaiting,
  counts,
  finished,
  enqueue,
  confirmReplace,
  skipAwaiting,
  retry,
  cancelCurrent,
  clear,
} = useIngestionQueue()

/**
 * Un taux au-dessus du seuil est signalé visuellement. Le seuil vient d'une constante
 * partagée, pas d'un littéral dans le rendu : c'est le critère de succès du produit, et le
 * jalon de l'epic 14 s'appuie sur la même valeur.
 */
function isRateHigh(stmt: StatementListItem): boolean {
  return stmt.correctionRate !== null && stmt.correctionRate > MANUAL_CORRECTION_THRESHOLD
}

function correctionTitle(stmt: StatementListItem): string {
  if (stmt.correctionRate === null) return 'Aucune transaction : taux non défini'
  return `${stmt.manualCount} ligne(s) reprises à la main sur ${stmt.transactionCount}`
}

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const dayFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })

function toDate(dateIso: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/**
 * Libellé d'un relevé — la PÉRIODE réelle, pas le mois de sa première date.
 *
 * Les relevés Boursobank chevauchent deux mois (28/02 → 31/03). Nommer chacun par son mois de
 * début affichait « Mai 2026 » et « Janvier 2026 » DEUX FOIS dans la liste, sur des relevés
 * différents : deux lignes indiscernables, dont l'une renvoyait vers le mauvais mois
 * (recette du 2026-09-05).
 */
function periodLabel(periodStart: string, periodEnd: string): string {
  const start = toDate(periodStart)
  const end = toDate(periodEnd)
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const label = monthFormatter.format(start)
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  return `${dayFormatter.format(start)} → ${dayFormatter.format(end)}/${end.getFullYear()}`
}
function periodSlug(periodStart: string): string {
  return periodStart.slice(0, 7)
}
</script>

<template>
  <section class="import">
    <header class="page-head">
      <h2 class="page-head__title">
        Importer des relevés
      </h2>
      <span class="page-head__sub">
        Un fichier qui échoue n'interrompt pas la file — chaque relevé est traité seul.
      </span>
    </header>

    <PdfDropZone
      v-if="!running && awaiting === null"
      @upload="enqueue($event)"
    />

    <IngestionQueue
      :items="items"
      :running="running"
      :counts="counts"
      :finished="finished"
      @retry="retry"
      @cancel="cancelCurrent"
      @clear="clear"
    />

    <!--
      Le chevauchement met la file EN PAUSE : traiter les fichiers suivants pendant que
      l'utilisateur décide rendrait la progression incompréhensible, et un remplacement
      pourrait entrer en concurrence avec le relevé suivant (FR6).
    -->
    <PeriodOverlapDialog
      :overlap="awaiting?.overlap ?? null"
      @confirm="confirmReplace"
      @cancel="skipAwaiting"
    />

    <section
      class="statements panel"
      aria-labelledby="statements-heading"
    >
      <header class="panel__head">
        <h3
          id="statements-heading"
          class="panel__title"
        >
          Relevés ingérés
        </h3>
      </header>

      <p
        v-if="listData.statements.length === 0"
        class="statements__empty"
      >
        Aucun relevé ingéré pour le moment.
      </p>

      <table
        v-else
        class="table statements__table"
      >
        <thead>
          <tr>
            <th scope="col">
              Période
            </th>
            <th
              scope="col"
              class="num"
            >
              Lignes
            </th>
            <th
              scope="col"
              class="num"
            >
              Corrigé
            </th>
            <th scope="col">
              Fiabilité
            </th>
            <th scope="col">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="stmt in listData.statements"
            :key="stmt.hash"
          >
            <th
              scope="row"
              class="statements__period"
            >
              {{ periodLabel(stmt.periodStart, stmt.periodEnd) }}
            </th>
            <td class="num statements__count">
              {{ stmt.transactionCount }}
            </td>
            <!--
              Taux de correction manuelle (FR24) — le chiffre du jalon de décision du MVP.
              Au-delà de 10 %, la corvée que le produit devait supprimer est de retour.
            -->
            <td
              class="num statements__rate"
              :class="{ 'statements__rate--high': isRateHigh(stmt) }"
              :title="correctionTitle(stmt)"
            >
              {{ formatRatio(stmt.correctionRate) }}
            </td>
            <td>
              <ReliabilityBadge
                :reliability="stmt.reliability"
                :gap-cents="stmt.gapCents as Cents"
              />
            </td>
            <td class="statements__links">
              <NuxtLink
                class="btn btn--quiet btn--sm"
                :to="`/transactions/${periodSlug(stmt.periodStart)}`"
              >
                Transactions
              </NuxtLink>
              <NuxtLink
                class="btn btn--quiet btn--sm"
                :to="`/reconciliation/${stmt.hash}`"
              >
                Réconciliation
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<style scoped>
.import { display: flex; flex-direction: column; gap: var(--space-3); }
.statements__empty { color: var(--color-text-muted); margin: 0; padding: var(--space-3); }
.statements__table { table-layout: fixed; }
.statements__table th:nth-child(2), .statements__table td:nth-child(2) { width: 6rem; }
.statements__table th:nth-child(3), .statements__table td:nth-child(3) { width: 6rem; }
.statements__table th:nth-child(4), .statements__table td:nth-child(4) { width: 15rem; }
.statements__table th:nth-child(5), .statements__table td:nth-child(5) { width: 17rem; }
.statements__period { font-weight: 500 !important; }
.statements__count { color: var(--color-text-muted); }
.statements__rate { color: var(--color-text-muted); }
.statements__rate--high { color: var(--color-danger); font-weight: 600; }
.statements__links { display: flex; gap: var(--space-1); justify-content: flex-end; }
</style>
