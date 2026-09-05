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
function monthLabel(periodStart: string): string {
  const [y, m] = periodStart.split('-').map(Number)
  const label = monthFormatter.format(new Date(y!, m! - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}
function periodSlug(periodStart: string): string {
  return periodStart.slice(0, 7)
}
</script>

<template>
  <section class="import">
    <h2>Importer des relevés</h2>

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
      class="statements"
      aria-labelledby="statements-heading"
    >
      <h3 id="statements-heading">
        Relevés ingérés
      </h3>
      <p
        v-if="listData.statements.length === 0"
        class="statements__empty"
      >
        Aucun relevé ingéré pour le moment.
      </p>
      <ul
        v-else
        class="statements__list"
      >
        <li
          v-for="stmt in listData.statements"
          :key="stmt.hash"
          class="statements__row"
        >
          <span class="statements__period">{{ monthLabel(stmt.periodStart) }}</span>
          <span class="statements__count">{{ stmt.transactionCount }} tx</span>
          <!--
            Taux de correction manuelle (FR24) — le chiffre du jalon de décision du MVP.
            Au-delà de 10 %, la corvée que le produit devait supprimer est de retour.
          -->
          <span
            class="statements__rate"
            :class="{ 'statements__rate--high': isRateHigh(stmt) }"
            :title="correctionTitle(stmt)"
          >{{ formatRatio(stmt.correctionRate) }} corrigé</span>
          <ReliabilityBadge
            :reliability="stmt.reliability"
            :gap-cents="stmt.gapCents as Cents"
          />
          <span class="statements__links">
            <NuxtLink :to="`/transactions/${periodSlug(stmt.periodStart)}`">
              Transactions
            </NuxtLink>
            <NuxtLink :to="`/reconciliation/${stmt.hash}`">
              Réconciliation
            </NuxtLink>
          </span>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.import {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.success {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-success);
}
.success__warning { color: var(--color-warning); }
.success__link {
  margin-top: var(--space-2);
  font-weight: 500;
}
.error {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-4);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
}
.btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font: inherit;
  cursor: pointer;
}
.btn--primary { background: var(--color-accent); color: white; }
.statements {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.statements h3 { margin: 0; font-size: var(--font-size-lg); }
.statements__empty { color: var(--color-text-muted); margin: 0; }
.statements__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.statements__row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
.statements__period { font-weight: 500; }
.statements__count { color: var(--color-text-muted); font-size: var(--font-size-sm); font-variant-numeric: tabular-nums; }
.statements__rate { color: var(--color-text-muted); font-size: var(--font-size-sm); font-variant-numeric: tabular-nums; }
.statements__rate--high { color: var(--color-danger); font-weight: 600; }
.statements__links { display: flex; gap: var(--space-3); font-size: var(--font-size-sm); }
</style>
