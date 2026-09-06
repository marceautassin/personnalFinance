<script setup lang="ts">
const props = defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}>()

const emit = defineEmits<{ confirm: [], cancel: [] }>()

const dialogRef = ref<HTMLDialogElement | null>(null)
// Supprime le `cancel` parasite émis par le `@close` natif quand la fermeture
// suit un confirm (chain : confirm → parent set open=false → watcher el.close()
// → @close natif → emit('cancel')). On suppress le prochain `cancel` après confirm.
let suppressNextClose = false

watch(() => props.open, (open) => {
  const el = dialogRef.value
  if (!el) return
  if (open && !el.open) el.showModal()
  else if (!open && el.open) el.close()
})

function onCloseEvent() {
  if (suppressNextClose) {
    suppressNextClose = false
    return
  }
  emit('cancel')
}

function onCancel() {
  emit('cancel')
}

function onConfirm() {
  suppressNextClose = true
  emit('confirm')
}
</script>

<template>
  <dialog
    ref="dialogRef"
    class="confirm"
    @close="onCloseEvent"
  >
    <h3 class="confirm__title">
      {{ title }}
    </h3>
    <p class="confirm__message">
      {{ message }}
    </p>
    <div class="confirm__actions">
      <button
        type="button"
        class="btn"
        @click="onCancel"
      >
        {{ cancelLabel ?? 'Annuler' }}
      </button>
      <button
        type="button"
        class="btn btn--destructive"
        @click="onConfirm"
      >
        {{ confirmLabel ?? 'Confirmer' }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.confirm {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  max-width: 32rem;
  /* Un dialogue RECOUVRE le contenu : c'est le cas où l'ombre dit la vérité. */
  box-shadow: var(--shadow-overlay);
}
.confirm::backdrop {
  background: rgba(0, 0, 0, 0.4);
}
.confirm__title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
}
.confirm__message {
  margin: 0 0 var(--space-4);
  color: var(--color-text);
  line-height: var(--line-height-normal);
}
.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
