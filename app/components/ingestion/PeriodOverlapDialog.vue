<script setup lang="ts">
import type { OverlapInfo } from '~/composables/useStatements'

const props = defineProps<{ overlap: OverlapInfo | null }>()
const emit = defineEmits<{ confirm: [], cancel: [] }>()

const dialogRef = ref<HTMLDialogElement | null>(null)
// Quand le parent reset `overlap` (suite à confirm/cancel déjà émis), on ferme le dialog
// programmatiquement. L'event `close` natif déclenche alors `onCloseEvent` qui ne doit PAS
// re-émettre `cancel` — sinon double-emit après un confirm-replace.
let suppressCloseEmit = false

watch(() => props.overlap, (val) => {
  const dlg = dialogRef.value
  if (!dlg) return
  if (val && !dlg.open) dlg.showModal()
  else if (!val && dlg.open) {
    suppressCloseEmit = true
    dlg.close()
  }
})

function onCloseEvent() {
  if (suppressCloseEmit) {
    suppressCloseEmit = false
    return
  }
  emit('cancel')
}
function onCancel() {
  emit('cancel')
}
function onConfirm() {
  emit('confirm')
}

function fmtPeriods(periods: Array<{ start: string, end: string }>): string {
  return periods.map(p => `${p.start} → ${p.end}`).join(', ')
}
</script>

<template>
  <dialog
    ref="dialogRef"
    class="dialog"
    @close="onCloseEvent"
  >
    <h3 class="dialog__title">
      Période déjà couverte
    </h3>
    <p v-if="overlap">
      La période <strong>{{ overlap.newPeriod.start }} → {{ overlap.newPeriod.end }}</strong>
      chevauche un relevé déjà ingéré ({{ fmtPeriods(overlap.existingPeriods) }}).
    </p>
    <p>Souhaites-tu remplacer le relevé existant par celui-ci ?</p>
    <div class="dialog__actions">
      <button
        type="button"
        class="btn"
        @click="onCancel"
      >
        Annuler
      </button>
      <button
        type="button"
        class="btn btn--primary"
        @click="onConfirm"
      >
        Remplacer
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  max-width: 500px;
  /* Un dialogue RECOUVRE le contenu : c'est le cas où l'ombre dit la vérité. */
  box-shadow: var(--shadow-overlay);
  background: var(--color-bg-elevated);
  color: var(--color-text);
}
.dialog::backdrop { background: rgb(0 0 0 / 0.5); }
.dialog__title { margin-bottom: var(--space-3); }
.dialog__actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
  justify-content: flex-end;
}
</style>
