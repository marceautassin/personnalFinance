<script setup lang="ts">
import { useUncategorized, type UncategorizedGroup } from '~/composables/useUncategorized'
import { useCategories } from '~/composables/useCategories'
import { useRules } from '~/composables/useRules'
import { formatEuros } from '~~/shared/types/money'
import { formatDate } from '~/utils/dates'

/**
 * Écran de requalification du poste de repli (story 18.10).
 *
 * Il existe parce que 307 des 1 855 lignes de la base tombent au repli, réparties sur vingt
 * relevés : les reprendre mois par mois demandait vingt allers-retours et autant de filtres à
 * reposer. Ici tout l'historique est là, groupé par libellé, et ranger un groupe vaut pour
 * toutes ses lignes.
 */
const { groups, total, pending, error, errorMessage, assignGroup, reload } = useUncategorized()
const { data: categoryGroups } = useCategories()
const { addRule, applyRuleToHistory } = useRules()

const groupsWithItems = computed(() => categoryGroups.value.filter(g => g.items.length > 0))

/** Groupe déplié — un seul à la fois : la liste sert à décider, pas à tout ouvrir. */
const expanded = ref<string | null>(null)
/**
 * Poste choisi par groupe, avant confirmation.
 *
 * `pick()` et non un accès direct : une clé absente vaut `undefined`, qui ne correspond à
 * aucune `<option>` — le sélecteur s'affichait alors VIDE, sans même son intitulé
 * « Ranger dans… » (revue du 2026-09-06).
 */
const choice = ref<Record<string, string>>({})
const pick = (key: string) => choice.value[key] ?? ''
const busyKey = ref<string | null>(null)
const actionError = ref<string | null>(null)
const report = ref<string | null>(null)

function toggle(key: string) {
  expanded.value = expanded.value === key ? null : key
}

/**
 * Range un groupe, et crée la règle correspondante SI on le demande.
 *
 * La règle n'est jamais créée d'office : la clé d'un groupe est parfois trop étroite pour
 * faire une bonne règle (`cdiscount 1 a 4`), et en fabriquer une à chaque classement
 * encombrerait la liste de motifs que l'utilisateur n'a pas choisis. Deux gestes, deux
 * boutons — comme sur la vue mensuelle.
 */
async function onAssign(group: UncategorizedGroup, withRule: boolean) {
  const code = choice.value[group.key]
  if (!code || busyKey.value !== null) return
  actionError.value = null
  report.value = null
  busyKey.value = group.key

  const outcome = await assignGroup(group, code)
  if ('error' in outcome) {
    busyKey.value = null
    actionError.value = outcome.doneCount > 0
      ? `${outcome.error} ${outcome.doneCount} ligne(s) du groupe étaient déjà rangées.`
      : outcome.error
    return
  }

  const ranged = `${group.transactions.length} ligne(s) rangée(s).`
  if (!withRule) {
    report.value = ranged
    busyKey.value = null
    expanded.value = null
    return
  }

  const pattern = group.rulePattern
  if (pattern === null) {
    report.value = `${ranged} Aucune règle créée : ce libellé n'identifie aucun commerçant.`
    busyKey.value = null
    expanded.value = null
    return
  }

  const created = await addRule({ pattern, categoryItemCode: code })
  if (!created.rule) {
    // Une règle refusée — motif trop court, ou motif déjà pris — n'annule pas le classement,
    // qui, lui, a réussi. Le dire, sinon l'utilisateur croit avoir tout perdu.
    report.value = `${ranged} Aucune règle créée : ${created.error ?? 'motif inexploitable'}.`
    busyKey.value = null
    expanded.value = null
    return
  }

  const applied = await applyRuleToHistory(created.rule.id)
  if ('result' in applied) {
    const moved = applied.result.updatedCount
    report.value = `${ranged} Règle « ${pattern} » créée`
      + (moved > 0 ? `, et ${moved} autre(s) ligne(s) reclassée(s) avec.` : '.')
    // La règle a pu sortir du repli des lignes d'AUTRES groupes : sans ce rechargement, elles
    // resteraient affichées et le compteur mentirait.
    if (moved > 0) await reload()
  }
  else {
    // L'application a échoué alors que la règle existe : le taire ferait croire l'historique
    // rejoué (règle d'or de CLAUDE.md — pas d'erreur avalée).
    actionError.value = `Règle « ${pattern} » créée, mais son application a échoué : ${applied.error ?? 'raison inconnue'}`
    report.value = ranged
  }

  busyKey.value = null
  expanded.value = null
}
</script>

<template>
  <section class="rank">
    <header class="page-head">
      <h2 class="page-head__title">
        À ranger
      </h2>
      <p class="rank__lead">
        Les lignes que la catégorisation n'a pas su placer, sur tout l'historique, groupées par
        libellé. Ranger un groupe vaut pour toutes ses lignes, et crée la règle qui l'évitera
        la prochaine fois.
      </p>
    </header>

    <p
      v-if="actionError"
      class="notice"
      role="alert"
    >
      {{ actionError }}
    </p>

    <p
      v-if="report"
      class="rank__report"
      role="status"
    >
      {{ report }}
    </p>

    <div
      v-if="error"
      class="panel state state--error"
    >
      <p class="state__title">
        Impossible de charger les lignes à ranger.
      </p>
      <p class="state__hint">
        {{ errorMessage }}
      </p>
    </div>

    <p
      v-else-if="pending && total === 0"
      class="rank__muted"
    >
      Chargement…
    </p>

    <div
      v-else-if="total === 0"
      class="panel state"
    >
      <p class="state__title">
        Rien à ranger.
      </p>
      <p class="state__hint">
        Aucune ligne de l'historique n'est au poste de repli.
      </p>
    </div>

    <template v-else>
      <p
        class="rank__count"
        role="status"
      >
        <strong>{{ total }}</strong> ligne(s) non catégorisée(s) ·
        <strong>{{ groups.length }}</strong> groupe(s)
      </p>

      <ul class="rank__list">
        <li
          v-for="group in groups"
          :key="group.key"
          class="rank__group"
        >
          <button
            type="button"
            class="rank__head"
            :aria-expanded="expanded === group.key"
            :aria-label="`${expanded === group.key ? 'Replier' : 'Déplier'} ${group.sampleLabel}, ${group.transactions.length} ligne(s), ${formatEuros(group.totalCents)}`"
            @click="toggle(group.key)"
          >
            <span aria-hidden="true">{{ expanded === group.key ? '▾' : '▸' }}</span>
            <span class="rank__label">{{ group.sampleLabel }}</span>
            <span class="rank__num">{{ group.transactions.length }} ligne(s)</span>
            <span class="rank__amount">{{ formatEuros(group.totalCents) }}</span>
          </button>

          <div class="rank__assign">
            <label class="rank__field">
              <span class="sr-only">Ranger « {{ group.sampleLabel }} » dans</span>
              <select
                :value="pick(group.key)"
                class="input input--sm"
                @change="choice[group.key] = ($event.target as HTMLSelectElement).value"
              >
                <option value="">
                  Ranger dans…
                </option>
                <optgroup
                  v-for="cg in groupsWithItems"
                  :key="cg.code"
                  :label="cg.label"
                >
                  <option
                    v-for="item in cg.items"
                    :key="item.code"
                    :value="item.code"
                  >
                    {{ item.label }}
                  </option>
                </optgroup>
              </select>
            </label>
            <button
              type="button"
              class="btn btn--primary btn--sm"
              :aria-disabled="!pick(group.key) || busyKey !== null"
              :aria-label="pick(group.key)
                ? `Ranger les ${group.transactions.length} ligne(s) de ${group.sampleLabel}`
                : 'Ranger — indisponible, choisir un poste d\'abord'"
              @click="onAssign(group, false)"
            >
              {{ busyKey === group.key ? 'Classement…' : 'Ranger' }}
            </button>
            <!-- La règle est un second geste : la clé d'un groupe ne fait pas toujours un bon
                 motif, et en créer une à chaque classement encombrerait la liste. -->
            <button
              type="button"
              class="btn btn--sm"
              :aria-disabled="!pick(group.key) || group.rulePattern === null || busyKey !== null"
              :aria-label="group.rulePattern === null
                ? 'Créer la règle — indisponible, ce libellé n\'identifie aucun commerçant'
                : `Ranger ces lignes et créer la règle « ${group.rulePattern} »`"
              @click="onAssign(group, true)"
            >
              Ranger et créer la règle
            </button>
            <span class="rank__pattern">
              <template v-if="group.rulePattern">motif : {{ group.rulePattern }}</template>
              <template v-else>pas de motif exploitable</template>
            </span>
          </div>

          <ul
            v-if="expanded === group.key"
            class="rank__lines"
          >
            <li
              v-for="tx in group.transactions"
              :key="tx.id"
              class="rank__line"
            >
              <span class="rank__date">{{ formatDate(tx.transactionDate) }}</span>
              <span class="rank__line-label">{{ tx.label }}</span>
              <span class="rank__amount">{{ formatEuros(tx.amountCents) }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.rank { display: flex; flex-direction: column; gap: var(--space-3); }
.rank__lead { font-size: var(--font-size-sm); color: var(--color-text-muted); max-width: 68ch; line-height: var(--line-height-normal); }
.rank__muted { color: var(--color-text-muted); }
.rank__report { font-size: var(--font-size-sm); color: var(--color-success); }
.rank__count { font-size: var(--font-size-sm); color: var(--color-text-muted); }

.rank__list { list-style: none; display: flex; flex-direction: column; gap: var(--space-2); }
.rank__group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.rank__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.rank__label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.rank__num { font-size: var(--font-size-sm); color: var(--color-text-muted); white-space: nowrap; }
.rank__amount { font-family: var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }

.rank__assign { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.rank__field { display: flex; }
.rank__pattern { font-size: var(--font-size-sm); color: var(--color-text-muted); font-family: var(--font-mono); overflow-wrap: anywhere; }

.rank__lines { list-style: none; display: flex; flex-direction: column; gap: var(--space-1); border-top: 1px solid var(--color-border); padding-top: var(--space-2); }
.rank__line { display: flex; align-items: baseline; gap: var(--space-2); font-size: var(--font-size-sm); }
.rank__date { font-family: var(--font-mono); color: var(--color-text-muted); white-space: nowrap; }
.rank__line-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
</style>
