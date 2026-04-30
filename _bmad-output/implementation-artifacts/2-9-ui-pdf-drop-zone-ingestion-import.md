# Story 2.9: UI — `PdfDropZone`, `IngestionProgress`, `PeriodOverlapDialog`, page `/import`, persistance disclaimer

Status: ready-for-dev

## Story

As a user,
I want a clear UI for dropping a PDF, seeing the ingestion progress, and confirming period overlaps,
so that the ingestion feels responsive and trustworthy.

This story résout aussi le **Gap G1** (persistance du flag "disclaimer vu" via `localStorage`).

## Acceptance Criteria

1. **Given** la page `app/pages/import.vue`,
   **When** je glisse-dépose un PDF sur le `PdfDropZone`,
   **Then** le composant accepte le fichier (validation côté client : type `application/pdf`, taille ≤ 10 MB), et un POST `multipart/form-data` est émis vers `/api/statements`.

2. **Given** une réponse `200 OK` de l'API d'ingestion,
   **When** elle est reçue,
   **Then** un message de succès s'affiche avec : période, nombre de transactions, statut de réconciliation (avec un appel à `Résoudre l'écart` si `isBalanced === false` — la résolution sera faite en Story 3.x), et un lien `Voir les transactions de {periode}` vers `/transactions/{periode}`.

3. **Given** une réponse `409 period_overlap`,
   **When** elle est reçue,
   **Then** le `PeriodOverlapDialog` s'ouvre, affiche les périodes en conflit, et propose deux actions : *Remplacer l'ancien* (relance le POST avec `X-Confirm-Replace: true`) ou *Annuler*.

4. **Given** une réponse `400 pdf_already_ingested`,
   **When** elle est reçue,
   **Then** un message FR explicite s'affiche via `useApiError.mapError`, sans dialog modal.

5. **Given** une réponse `503 llm_unavailable` ou `400 pdf_parse_failed`,
   **When** elle est reçue,
   **Then** un message FR explicite s'affiche, avec un bouton *Réessayer* qui relance l'upload.

6. **Given** l'`IngestionProgress`,
   **When** une ingestion est en cours,
   **Then** un indicateur visuel non-interrompable (mais annulable via *Annuler*) montre l'étape courante (texte type "Analyse du PDF...", "Catégorisation...", "Sauvegarde..."). Note : on ne peut pas vraiment connaître l'étape côté client puisque le backend est synchrone — afficher un message générique "Traitement en cours (peut prendre jusqu'à 30 secondes)" suffit.

7. **Given** le `AppDisclaimer` (Story 1.7) est inclus dans le layout,
   **When** la première utilisation de l'app est détectée (flag `localStorage` absent),
   **Then** un modal/bandeau plus visible s'affiche avec un bouton *J'ai compris* qui pose le flag (`localStorage.setItem('pf_disclaimer_seen_v1', '1')`),
   **And** au prochain démarrage le bandeau est dans son état "discret" (toujours visible en pied de page mais sans modal).

8. **Given** le test E2E stub de Story 2.6,
   **When** Story 2.9 est implémentée,
   **Then** activer le test : drop d'un PDF de fixture, vérifier qu'on arrive sur le message de succès puis qu'on peut cliquer sur le lien vers `/transactions/{periode}`.

## Tasks / Subtasks

- [ ] **Task 1 — Composable `useStatements`** (AC: #1-5)
  - [ ] Créer `app/composables/useStatements.ts` avec `uploadStatement(file: File, opts?: { confirmReplace?: boolean })` qui POST en multipart vers `/api/statements`
  - [ ] Gérer les retours `period_overlap` en exposant les métadonnées au composant (pour ouvrir le dialog)
  - [ ] Sur succès, appeler `useInvalidate()` pour les vues dérivées

- [ ] **Task 2 — `PdfDropZone.vue`** (AC: #1)
  - [ ] Créer `app/components/ingestion/PdfDropZone.vue` selon le snippet Dev Notes
  - [ ] Validation client : type MIME, taille
  - [ ] Drop ET clic → input file
  - [ ] Émet un event `@upload` avec le `File`

- [ ] **Task 3 — `IngestionProgress.vue`** (AC: #6)
  - [ ] Créer `app/components/ingestion/IngestionProgress.vue` avec un état `pending` reactif
  - [ ] Pas de progression réelle (backend sync) → message générique avec indeterminate spinner

- [ ] **Task 4 — `PeriodOverlapDialog.vue`** (AC: #3)
  - [ ] Créer `app/components/ingestion/PeriodOverlapDialog.vue`
  - [ ] Utiliser `<dialog>` natif (Chrome + Firefox supportent) ou `Reka UI Dialog` si tu as installé reka-ui
  - [ ] Émet `@confirm` (replace) ou `@cancel`

- [ ] **Task 5 — Page `/import`** (AC: #1-6)
  - [ ] Créer `app/pages/import.vue` qui orchestre les 3 composants ci-dessus + use `useStatements` + `useApiError`
  - [ ] States : idle, uploading, success, error, overlap-pending

- [ ] **Task 6 — Persistance disclaimer** (AC: #7)
  - [ ] Créer/Modifier `app/stores/disclaimer.ts` (Pinia) qui lit/écrit `localStorage` au montage avec une key `pf_disclaimer_seen_v1`
  - [ ] Modifier `AppDisclaimer.vue` (Story 1.7) pour afficher un mode modal (overlay + bouton *J'ai compris*) à la première visite, et un mode discret ensuite (le bandeau actuel)
  - [ ] Le bouton *J'ai compris* appelle le store qui écrit le flag

- [ ] **Task 7 — Activer le test E2E** (AC: #8)
  - [ ] Décommenter / activer `tests/e2e/ingestion.spec.ts` (stub créé en Story 2.6)
  - [ ] Le test : drop fixture → wait for success message → click `Voir les transactions` → vérifier qu'on est sur la bonne URL et qu'on voit au moins 1 transaction

- [ ] **Task 8 — Sanity check final**
  - [ ] `yarn dev` → upload manuel d'un PDF de fixture
  - [ ] `yarn test:e2e` → spec ingestion passe
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [ ] Commit unique

## Dev Notes

### Snippet `app/composables/useStatements.ts` (Task 1)

```ts
import type { IngestionResult } from '~/shared/schemas/ingestion-result.schema'

export interface OverlapInfo {
  existingHashes: string[]
  existingPeriods: Array<{ start: string; end: string }>
  newPeriod: { start: string; end: string }
}

export function useStatements() {
  const { mapError } = useApiError()
  const invalidate = useInvalidate()

  async function uploadStatement(
    file: File,
    opts: { confirmReplace?: boolean } = {},
  ): Promise<{ result?: IngestionResult; overlap?: OverlapInfo; error?: string }> {
    const form = new FormData()
    form.append('file', file)

    try {
      const result = await $fetch<IngestionResult>('/api/statements', {
        method: 'POST',
        body: form,
        headers: opts.confirmReplace ? { 'X-Confirm-Replace': 'true' } : undefined,
      })
      invalidate.invalidateForecast()
      invalidate.invalidateDashboard()
      return { result }
    } catch (err) {
      // Cas particulier : period_overlap → on extrait les infos pour ouvrir le dialog
      const e = err as { statusCode?: number; statusMessage?: string; data?: OverlapInfo }
      if (e.statusCode === 409 && e.statusMessage === 'period_overlap' && e.data) {
        return { overlap: e.data }
      }
      return { error: mapError(err) }
    }
  }

  return { uploadStatement }
}
```

### Snippet `app/components/ingestion/PdfDropZone.vue` (Task 2)

```vue
<script setup lang="ts">
const emit = defineEmits<{ upload: [file: File] }>()
const isDragging = ref(false)
const errorMessage = ref<string | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const MAX_BYTES = 10 * 1024 * 1024

function handleFiles(files: FileList | null | undefined) {
  errorMessage.value = null
  const file = files?.[0]
  if (!file) return
  if (file.type !== 'application/pdf') {
    errorMessage.value = 'Seuls les fichiers PDF sont acceptés.'
    return
  }
  if (file.size > MAX_BYTES) {
    errorMessage.value = `Le fichier dépasse 10 Mo (${Math.round(file.size / 1024 / 1024)} Mo).`
    return
  }
  emit('upload', file)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  handleFiles(e.dataTransfer?.files)
}

function onDragOver(e: DragEvent) { e.preventDefault(); isDragging.value = true }
function onDragLeave() { isDragging.value = false }
function onClick() { inputRef.value?.click() }
function onInput(e: Event) { handleFiles((e.target as HTMLInputElement).files) }
</script>

<template>
  <div>
    <button
      type="button"
      class="dropzone"
      :class="{ 'dropzone--dragging': isDragging }"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @click="onClick"
    >
      <p class="dropzone__title">Dépose un relevé PDF Boursorama ici</p>
      <p class="dropzone__hint"><small>ou clique pour sélectionner un fichier</small></p>
    </button>
    <input
      ref="inputRef"
      type="file"
      accept="application/pdf"
      style="display: none"
      @change="onInput"
    />
    <p v-if="errorMessage" class="dropzone__error">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 200px;
  padding: var(--space-8);
  border: 2px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  transition: all var(--transition-base);
  cursor: pointer;
}
.dropzone:hover, .dropzone--dragging {
  border-color: var(--color-accent);
  background: var(--color-neutral-100);
}
.dropzone__title { font-size: var(--font-size-lg); font-weight: 500; }
.dropzone__hint { color: var(--color-text-muted); }
.dropzone__error { color: var(--color-danger); margin-top: var(--space-3); }
</style>
```

### Snippet `app/components/ingestion/IngestionProgress.vue` (Task 3)

```vue
<script setup lang="ts">
defineProps<{ active: boolean }>()
</script>

<template>
  <div v-if="active" class="progress" role="status" aria-live="polite">
    <div class="progress__spinner" aria-hidden="true" />
    <p class="progress__text">
      Traitement en cours… cela peut prendre jusqu'à <strong>30 secondes</strong>
      (extraction du PDF, catégorisation, réconciliation).
    </p>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-neutral-100);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-accent);
}
.progress__spinner {
  width: 24px; height: 24px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: var(--radius-full);
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.progress__text { font-size: var(--font-size-sm); }
</style>
```

### Snippet `app/components/ingestion/PeriodOverlapDialog.vue` (Task 4)

```vue
<script setup lang="ts">
import type { OverlapInfo } from '~/composables/useStatements'

const props = defineProps<{ overlap: OverlapInfo | null }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const dialogRef = ref<HTMLDialogElement | null>(null)

watch(() => props.overlap, (val) => {
  if (val) dialogRef.value?.showModal()
  else dialogRef.value?.close()
})
</script>

<template>
  <dialog ref="dialogRef" class="dialog" @close="emit('cancel')">
    <h3>Période déjà couverte</h3>
    <p v-if="overlap">
      La période <strong>{{ overlap.newPeriod.start }} → {{ overlap.newPeriod.end }}</strong>
      chevauche un relevé déjà ingéré
      ({{ overlap.existingPeriods.map(p => `${p.start} → ${p.end}`).join(', ') }}).
    </p>
    <p>Souhaites-tu remplacer le relevé existant par celui-ci ?</p>
    <div class="dialog__actions">
      <button type="button" class="btn btn--secondary" @click="emit('cancel')">Annuler</button>
      <button type="button" class="btn btn--primary" @click="emit('confirm')">Remplacer</button>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  border: none;
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  max-width: 500px;
  box-shadow: var(--shadow-md);
}
.dialog::backdrop { background: rgb(0 0 0 / 0.5); }
.dialog__actions { display: flex; gap: var(--space-3); margin-top: var(--space-4); justify-content: flex-end; }
.btn { padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); }
.btn--primary { background: var(--color-accent); color: white; }
.btn--secondary { background: var(--color-neutral-200); }
</style>
```

### Snippet `app/pages/import.vue` (Task 5)

```vue
<script setup lang="ts">
import type { IngestionResult } from '~/shared/schemas/ingestion-result.schema'
import type { OverlapInfo } from '~/composables/useStatements'

const { uploadStatement } = useStatements()
const status = ref<'idle' | 'uploading' | 'success' | 'error' | 'overlap'>('idle')
const result = ref<IngestionResult | null>(null)
const errorMsg = ref<string | null>(null)
const overlap = ref<OverlapInfo | null>(null)
const lastFile = ref<File | null>(null)

async function handleUpload(file: File, confirmReplace = false) {
  lastFile.value = file
  status.value = 'uploading'
  const out = await uploadStatement(file, { confirmReplace })
  if (out.result) {
    result.value = out.result
    status.value = 'success'
  } else if (out.overlap) {
    overlap.value = out.overlap
    status.value = 'overlap'
  } else {
    errorMsg.value = out.error ?? 'Erreur inconnue'
    status.value = 'error'
  }
}

function onConfirmReplace() {
  if (lastFile.value) {
    overlap.value = null
    handleUpload(lastFile.value, true)
  }
}
function onCancelOverlap() { overlap.value = null; status.value = 'idle' }
function onRetry() { if (lastFile.value) handleUpload(lastFile.value) }
</script>

<template>
  <section class="import">
    <h2>Importer un relevé</h2>

    <PdfDropZone v-if="status === 'idle' || status === 'error'" @upload="handleUpload($event)" />

    <IngestionProgress :active="status === 'uploading'" />

    <div v-if="status === 'success' && result" class="success">
      <h3>✅ Relevé ingéré</h3>
      <p>Période : {{ result.periodStart }} → {{ result.periodEnd }}</p>
      <p>{{ result.transactionCount }} transactions catégorisées.</p>
      <p v-if="!result.isBalanced" class="success__warning">
        ⚠️ Réconciliation : écart de {{ result.gapCents }} centimes.
        <NuxtLink :to="`/reconciliation/${result.hash}`">Résoudre l'écart</NuxtLink>
        (sera disponible en Epic 3)
      </p>
      <NuxtLink :to="`/transactions/${result.periodStart.slice(0, 7)}`">
        Voir les transactions
      </NuxtLink>
    </div>

    <div v-if="status === 'error'" class="error" role="alert">
      <p>{{ errorMsg }}</p>
      <button type="button" @click="onRetry">Réessayer</button>
    </div>

    <PeriodOverlapDialog
      :overlap="status === 'overlap' ? overlap : null"
      @confirm="onConfirmReplace"
      @cancel="onCancelOverlap"
    />
  </section>
</template>

<style scoped>
.import { display: flex; flex-direction: column; gap: var(--space-4); }
.success {
  padding: var(--space-4);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-success);
}
.success__warning { color: var(--color-warning); }
.error {
  padding: var(--space-4);
  border-left: 3px solid var(--color-danger);
  background: var(--color-bg-elevated);
}
</style>
```

### Snippet `app/stores/disclaimer.ts` (Task 6)

```ts
import { defineStore } from 'pinia'

const STORAGE_KEY = 'pf_disclaimer_seen_v1'

export const useDisclaimerStore = defineStore('disclaimer', {
  state: () => ({
    /** true si l'utilisateur a vu et acquitté le disclaimer initial */
    seen: false,
  }),
  actions: {
    initFromStorage() {
      // Appeler au montage côté client uniquement (pas SSR — l'app est SPA mais sécurité)
      if (import.meta.client) {
        this.seen = window.localStorage.getItem(STORAGE_KEY) === '1'
      }
    },
    acknowledge() {
      this.seen = true
      if (import.meta.client) window.localStorage.setItem(STORAGE_KEY, '1')
    },
  },
})
```

### Modification de `AppDisclaimer.vue` (Task 6)

```vue
<script setup lang="ts">
const store = useDisclaimerStore()
onMounted(() => store.initFromStorage())
</script>

<template>
  <!-- Mode modal en première visite -->
  <Teleport v-if="!store.seen" to="body">
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div class="modal">
        <h2 id="disclaimer-title">Avant de commencer</h2>
        <p>
          Cet outil est une aide à la simulation pour usage personnel. Les calculs fiscaux
          sont indicatifs et ne remplacent pas un conseil professionnel (expert-comptable,
          conseiller fiscal). En cas de doute sur une décision impliquant un montant
          significatif, consulter un professionnel.
        </p>
        <button type="button" class="btn-primary" @click="store.acknowledge()">
          J'ai compris
        </button>
      </div>
    </div>
  </Teleport>

  <!-- Bandeau discret en pied de page (toujours présent) -->
  <aside class="disclaimer" role="note">
    <small>
      ⚠️ Outil d'aide à la simulation. Les calculs sont indicatifs ; consulter un
      professionnel pour toute décision significative.
    </small>
  </aside>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgb(0 0 0 / 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--color-bg-elevated);
  padding: var(--space-8);
  border-radius: var(--radius-lg);
  max-width: 540px;
  display: flex; flex-direction: column; gap: var(--space-4);
  box-shadow: var(--shadow-md);
}
.btn-primary {
  background: var(--color-accent);
  color: white;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  align-self: flex-end;
}
.disclaimer {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  background: var(--color-neutral-100);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-warning);
}
</style>
```

### Test E2E `tests/e2e/ingestion.spec.ts` (Task 7)

```ts
import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const FIXTURE = resolve('tests/fixtures/pdfs/statement-jan-2026.pdf')

test.describe('Ingestion d\'un relevé PDF', () => {
  test.skip(!existsSync(FIXTURE), 'Fixture PDF Boursorama absente')

  test('drop PDF → succès → navigation transactions', async ({ page }) => {
    await page.goto('/import')

    // Acquitter le disclaimer si présent
    const disclaimerButton = page.getByRole('button', { name: /J'ai compris/i })
    if (await disclaimerButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await disclaimerButton.click()
    }

    // Upload via input file (cacher le drop pour simplifier)
    const input = page.locator('input[type=file]')
    await input.setInputFiles(FIXTURE)

    // Attendre le succès (jusqu'à 35s pour absorber NFR1 + marge)
    await expect(page.getByText(/Relevé ingéré/i)).toBeVisible({ timeout: 35_000 })

    // Cliquer le lien vers les transactions
    await page.getByRole('link', { name: /Voir les transactions/i }).click()
    await expect(page).toHaveURL(/\/transactions\/\d{4}-\d{2}/)
  })
})
```

### Anti-patterns à éviter

- ❌ Faire l'upload directement avec `<form action="/api/statements">` — utiliser `useStatements` qui gère le state et les codes d'erreur.
- ❌ Polluer le composant avec la logique métier d'upload — le composable encapsule tout, le composant orchestre les états.
- ❌ Stocker le résultat de l'upload en Pinia — c'est de l'état local de page.
- ❌ Implémenter de vraies barres de progression — backend sync, on n'a pas l'info.
- ❌ Persister le flag disclaimer en base — c'est purement client/UI (G1 acté localStorage).

### Project Structure Notes

Cette story crée :
- `app/composables/useStatements.ts`
- `app/components/ingestion/PdfDropZone.vue`
- `app/components/ingestion/IngestionProgress.vue`
- `app/components/ingestion/PeriodOverlapDialog.vue`
- `app/pages/import.vue`
- `app/stores/disclaimer.ts`
- Modification `app/components/shared/AppDisclaimer.vue` (Story 1.7)
- Activation `tests/e2e/ingestion.spec.ts`

### Definition of Done

- [ ] Drop d'un PDF, ingestion, succès affichage
- [ ] Période overlap → dialog → confirm → re-upload réussi
- [ ] Erreurs (already_ingested, llm_unavailable, pdf_parse_failed) affichées en FR
- [ ] Disclaimer modal en première visite, persistance localStorage, mode discret ensuite
- [ ] E2E Playwright : ingestion fixture + navigation transactions
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run`, `yarn test:e2e` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Anti-patterns interdits] — composants ne font pas de fetch direct
- [Source: `CLAUDE.md`#Gaps à résoudre §G1] — disclaimer state via localStorage
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Web Application Specific Requirements] — Chrome+Firefox desktop ≥ 1280px
- [Source: `_bmad-output/planning-artifacts/prd.md`#FR1, §FR3, §FR54] — drop, overlap, disclaimer
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 2.9] — story originale
- [Previous stories: `1-7` AppDisclaimer base, `2-6` ingestion endpoint, `2-8` useInvalidate stub]

## Dev Agent Record

### Agent Model Used

_(à remplir)_

### Debug Log References

_(à remplir — comportement de `<dialog>` natif vs Reka UI, gestion drag&drop sur Firefox)_

### Completion Notes List

_(à remplir — durée moyenne d'ingestion observée sur PDF réel, vs cible 30s)_

### File List

_(à remplir)_
