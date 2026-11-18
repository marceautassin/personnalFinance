<script setup lang="ts">
import { useStatementsList, type StatementListItem } from '~/composables/useStatements'
import { useIngestionQueue } from '~/composables/useIngestionQueue'
import { useCurrentProfile } from '~/composables/useCurrentProfile'
import { useApiError } from '~/composables/useApiError'
import { formatRatio } from '~~/shared/types/ratio'
import type { Cents } from '~~/shared/types/money'
import { MANUAL_CORRECTION_THRESHOLD } from '~~/shared/constants/quality-thresholds'
import { BANKS, BANK_LABELS, type Bank } from '~~/shared/types/bank'

const { mapError } = useApiError()
const { data: listData, error: listError } = useStatementsList()
const { currentProfile } = useCurrentProfile()

/**
 * Banque du prochain dépôt (FR77, AC 1) — préremplie avec la banque par défaut du profil
 * courant, modifiable. `watch` (et non une seule initialisation) : le profil arrive par un
 * `useFetch` asynchrone, souvent résolu APRÈS le montage de cette page — sans lui, le
 * sélecteur resterait bloqué sur `boursorama` (première valeur de `BANKS`) tant que
 * l'utilisateur ne le touche pas lui-même.
 *
 * Surveille l'ID du profil, PAS l'objet `currentProfile` entier (bug trouvé en revue) :
 * `useIngestionQueue.drain()` appelle `invalidateAnalysis()` en fin de file, qui fait un
 * `refreshNuxtData()` SANS clé — donc recharge aussi `current-profile`. Un `watch` sur l'objet
 * se redéclenchait à CHAQUE fin de file, même sans changement de profil, et écrasait le choix
 * que l'utilisateur venait de faire pour son PROCHAIN dépôt. Le profil ne change que si son id
 * change (bascule de profil, story 27.3) — c'est la seule condition qui doit réappliquer le
 * défaut.
 */
const selectedBank = ref<Bank>(currentProfile.value?.defaultBank ?? BANKS[0])
watch(() => currentProfile.value?.id, (id, previousId) => {
  if (id !== undefined && id !== previousId) {
    selectedBank.value = currentProfile.value!.defaultBank
  }
})
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

    <label
      v-if="!running && awaiting === null"
      class="import__bank-field"
    >
      <span>Banque</span>
      <select
        v-model="selectedBank"
        class="select"
      >
        <option
          v-for="bank in BANKS"
          :key="bank"
          :value="bank"
        >
          {{ BANK_LABELS[bank] }}
        </option>
      </select>
    </label>

    <PdfDropZone
      v-if="!running && awaiting === null"
      @upload="enqueue($event, selectedBank)"
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

      <!-- Story 17.7 : distinguer la panne de l'absence de relevé. -->
      <div
        v-if="listError"
        class="state state--error"
      >
        <p class="state__title">
          Impossible de charger la liste des relevés.
        </p>
        <p class="state__hint">
          {{ mapError(listError) }}
        </p>
      </div>

      <p
        v-else-if="listData.statements.length === 0"
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
            <th scope="col">
              Banque
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
            <td class="statements__bank">
              {{ BANK_LABELS[stmt.bank] }}
            </td>
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
.statements__table th:nth-child(2), .statements__table td:nth-child(2) { width: 9rem; }
.statements__table th:nth-child(3), .statements__table td:nth-child(3) { width: 6rem; }
.statements__table th:nth-child(4), .statements__table td:nth-child(4) { width: 6rem; }
.statements__table th:nth-child(5), .statements__table td:nth-child(5) { width: 15rem; }
.statements__table th:nth-child(6), .statements__table td:nth-child(6) { width: 17rem; }
.statements__period { font-weight: 500 !important; }
.statements__bank { color: var(--color-text-muted); }
.statements__count { color: var(--color-text-muted); }
.import__bank-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-width: 16rem;
  font-size: var(--font-size-sm);
}
.import__bank-field span { color: var(--color-text-muted); }
.statements__rate { color: var(--color-text-muted); }
.statements__rate--high { color: var(--color-danger); font-weight: 600; }
.statements__links { display: flex; gap: var(--space-1); justify-content: flex-end; }
</style>
