<script setup lang="ts">
import { useRules, type ClassificationRuleWithLabels } from '~/composables/useRules'
import { useCategories, flattenReferential } from '~/composables/useCategories'
import { useApiError } from '~/composables/useApiError'

const { data: rules, pending, error, addRule, deleteRule } = useRules()
const { data: groups } = useCategories()
const { mapError } = useApiError()

const groupsWithItems = computed(() => groups.value.filter(g => g.items.length > 0))
const itemCount = computed(() => flattenReferential(groups.value).length)

const pattern = ref('')
const categoryItemCode = ref('')
const saving = ref(false)
const actionError = ref<string | null>(null)
const pendingDelete = ref<ClassificationRuleWithLabels | null>(null)

const fetchErrorMessage = computed(() => (error.value ? mapError(error.value) : null))

async function onSubmit() {
  // `aria-disabled` signale l'indisponibilité sans bloquer le clic (NFR18) : la garde de
  // ré-entrance doit donc être ici, sinon un double-clic part deux fois et le second remonte
  // un 409 affiché comme une erreur.
  if (saving.value) return
  actionError.value = null
  const trimmed = pattern.value.trim()
  if (trimmed.length < 2) {
    actionError.value = 'Le motif doit faire au moins 2 caractères.'
    return
  }
  if (!categoryItemCode.value) {
    actionError.value = 'Choisis un poste de destination.'
    return
  }
  saving.value = true
  const outcome = await addRule({ pattern: trimmed, categoryItemCode: categoryItemCode.value })
  saving.value = false
  if (outcome.error) actionError.value = outcome.error
  else {
    pattern.value = ''
    categoryItemCode.value = ''
  }
}

async function onConfirmDelete() {
  const rule = pendingDelete.value
  pendingDelete.value = null
  if (!rule) return
  actionError.value = null
  const outcome = await deleteRule(rule.id)
  if (outcome.error) actionError.value = outcome.error
}
</script>

<template>
  <section class="rules">
    <header>
      <h2 class="rules__title">
        Règles de classement
      </h2>
      <p class="rules__lead">
        Une règle range dans un poste tout libellé qui contient son motif. Elle s'applique à
        l'ingestion, <strong>par-dessus la catégorisation automatique</strong>, et ne modifie
        pas les relevés déjà importés.
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
      v-if="fetchErrorMessage"
      class="notice"
      role="alert"
    >
      {{ fetchErrorMessage }}
    </p>

    <form
      class="rules__form"
      @submit.prevent="onSubmit"
    >
      <label class="rules__field rules__field--grow">
        <span>Si le libellé contient</span>
        <input
          v-model="pattern"
          type="text"
          class="input rules__pattern"
          placeholder="Ex : SOCIETEX"
          maxlength="120"
        >
      </label>
      <label class="rules__field rules__field--grow">
        <span>Ranger dans</span>
        <select
          v-model="categoryItemCode"
          class="select"
        >
          <option
            value=""
            disabled
          >
            {{ itemCount === 0 ? 'Aucun poste' : 'Choisir…' }}
          </option>
          <!-- Groupé par rubrique : « Restaurant » existe sous plusieurs d'entre elles (FR19). -->
          <optgroup
            v-for="group in groupsWithItems"
            :key="group.code"
            :label="group.label"
          >
            <option
              v-for="item in group.items"
              :key="item.code"
              :value="item.code"
            >
              {{ item.label }}
            </option>
          </optgroup>
        </select>
      </label>
      <button
        type="submit"
        class="btn btn--primary rules__btn"
        :aria-disabled="saving"
      >
        {{ saving ? 'Ajout…' : 'Ajouter la règle' }}
      </button>
    </form>

    <p
      v-if="pending && rules.length === 0"
      class="rules__empty"
    >
      Chargement…
    </p>
    <p
      v-else-if="rules.length === 0"
      class="rules__empty"
    >
      Aucune règle. Les libellés qui reviennent — ta SASU, ton opérateur, ta salle de sport —
      sont les meilleurs candidats.
    </p>
    <table
      v-else
      class="table table--framed rules__table"
    >
      <thead>
        <tr>
          <th>Si le libellé contient</th>
          <th>Ranger dans</th>
          <th class="rules__num">
            Lignes couvertes
          </th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="rule in rules"
          :key="rule.id"
          :data-testid="`rule-row-${rule.id}`"
        >
          <td class="rules__pattern">
            {{ rule.pattern }}
          </td>
          <td>{{ rule.groupLabel }} · {{ rule.itemLabel }}</td>
          <td class="rules__num">
            {{ rule.matchCount }}
          </td>
          <td class="rules__actions">
            <button
              type="button"
              class="btn btn--danger btn--sm"
              :aria-label="`Supprimer la règle ${rule.pattern}`"
              @click="pendingDelete = rule"
            >
              Supprimer
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <ConfirmDialog
      :open="pendingDelete !== null"
      title="Supprimer la règle"
      :message="`Supprimer la règle « ${pendingDelete?.pattern} » ? Les transactions déjà classées ne changent pas.`"
      confirm-label="Supprimer"
      @confirm="onConfirmDelete"
      @cancel="pendingDelete = null"
    />
  </section>
</template>

<style scoped>
.rules { display: flex; flex-direction: column; gap: var(--space-3); }
.rules__lead { margin: 0; color: var(--color-text-muted); max-width: 88ch; font-size: var(--font-size-sm); }
.rules__form {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.rules__field { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--font-size-sm); }
.rules__field--grow { flex: 1 1 20rem; }
.rules__field span { color: var(--color-text-muted); }
.rules__empty { color: var(--color-text-muted); max-width: 60ch; }
/* Le motif est de la donnée saisie, pas de la prose : à chasse fixe, on voit les espaces. */
.rules__pattern { font-family: var(--font-mono); font-size: var(--font-size-sm); }
.rules__num { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.rules__actions { text-align: right; }
</style>
