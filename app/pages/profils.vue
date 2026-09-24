<script setup lang="ts">
import { BANKS, BANK_LABELS } from '~~/shared/types/bank'
import type { Profile } from '~~/shared/schemas/profile.schema'

/**
 * Écran des profils (story 27.3, FR73, FR74).
 *
 * Vocabulaire neutre à dessein (NFR35) : « profil », « utiliser ce profil ». Rien ici ne doit
 * se lire comme une connexion — pas de mot « connecté », pas de cadenas, pas d'avatar.
 */
const { profiles, profilesPending, profilesError, currentProfile, createProfile, selectProfile } = useProfiles()
const { mapError } = useApiError()

const name = ref('')
const defaultBank = ref(BANKS[0])
const saving = ref(false)
const actionError = ref<string | null>(null)
const switchingId = ref<number | null>(null)

const fetchErrorMessage = computed(() => (profilesError.value ? mapError(profilesError.value) : null))

async function onSubmit() {
  // Garde de ré-entrance + `aria-disabled` (modèle : regles.vue) : un double-clic ne doit pas
  // partir deux fois et remonter un 409 lu comme une erreur inattendue.
  if (saving.value) return
  actionError.value = null
  const trimmed = name.value.trim()
  if (!trimmed) {
    actionError.value = 'Le nom du profil est obligatoire.'
    return
  }
  saving.value = true
  const outcome = await createProfile({ name: trimmed, defaultBank: defaultBank.value })
  saving.value = false
  if (outcome.error) {
    actionError.value = outcome.error
    return
  }
  name.value = ''
  defaultBank.value = BANKS[0]
}

/**
 * Garde de ré-entrance ET de profil courant réunies ICI, seule source de vérité (revue de la
 * story 27.3, MINEUR 8) : le template se contente d'appeler `onSelect`, sans dupliquer la
 * condition dans son `@click`.
 */
async function onSelect(profile: Profile) {
  if (switchingId.value !== null || currentProfile.value?.id === profile.id) return
  actionError.value = null
  switchingId.value = profile.id
  const outcome = await selectProfile(profile.id)
  // En succès, `selectProfile` déclenche `reloadNuxtApp` : la page est remplacée, il n'y a
  // rien de plus à faire ici. On ne relâche la garde qu'en cas d'échec.
  if (outcome.error) {
    switchingId.value = null
    actionError.value = outcome.error
  }
}
</script>

<template>
  <section class="profiles">
    <header class="page-head">
      <h2 class="page-head__title">
        Profils
      </h2>
      <p class="page-head__sub">
        Chaque profil a ses relevés, son référentiel et son analyse.
      </p>
    </header>

    <p
      v-if="!profilesPending && currentProfile === null"
      class="notice"
      role="status"
    >
      Choisis ou crée un profil pour commencer.
    </p>

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
      class="profiles__form"
      @submit.prevent="onSubmit"
    >
      <label class="field profiles__field">
        <span class="field__label">Nom</span>
        <input
          v-model="name"
          type="text"
          class="input"
          placeholder="Ex : Camille"
          maxlength="40"
        >
      </label>
      <label class="field profiles__field">
        <span class="field__label">Banque par défaut</span>
        <select
          v-model="defaultBank"
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
      <button
        type="submit"
        class="btn btn--primary"
        :aria-disabled="saving"
      >
        {{ saving ? 'Création…' : 'Créer le profil' }}
      </button>
    </form>

    <p
      v-if="profilesPending && profiles.length === 0"
      class="profiles__empty"
    >
      Chargement…
    </p>
    <table
      v-else
      class="table table--framed"
    >
      <thead>
        <tr>
          <th>Nom</th>
          <th>Banque par défaut</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="profile in profiles"
          :key="profile.id"
          :data-testid="`profile-row-${profile.id}`"
        >
          <td>
            {{ profile.name }}
            <span
              v-if="currentProfile?.id === profile.id"
              class="badge badge--ok"
            >
              en cours
            </span>
          </td>
          <td>{{ BANK_LABELS[profile.defaultBank] }}</td>
          <td class="profiles__actions">
            <!-- `aria-disabled`, jamais `disabled` (NFR18-20) : le bouton du profil en cours
                 reste focalisable et son nom accessible dit pourquoi il est indisponible. -->
            <button
              type="button"
              class="btn btn--sm"
              :aria-disabled="currentProfile?.id === profile.id || switchingId !== null"
              :aria-label="currentProfile?.id === profile.id
                ? `Utiliser le profil ${profile.name} — indisponible, c'est le profil en cours`
                : `Utiliser le profil ${profile.name}`"
              @click="onSelect(profile)"
            >
              {{ switchingId === profile.id ? 'Bascule…' : 'Utiliser ce profil' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.profiles { display: flex; flex-direction: column; gap: var(--space-3); }
.profiles__form {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}
.profiles__field { flex: 1 1 16rem; }
.profiles__actions { text-align: right; }
.profiles__empty { color: var(--color-text-muted); }
</style>
