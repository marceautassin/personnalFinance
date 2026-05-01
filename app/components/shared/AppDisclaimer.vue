<script setup lang="ts">
import { useDisclaimerStore } from '~/stores/disclaimer'

const store = useDisclaimerStore()
const dialogRef = ref<HTMLDialogElement | null>(null)

onMounted(() => store.initFromStorage())

// Native <dialog>.showModal() fournit focus trap + Escape gratuitement.
// On bloque la fermeture via Escape (cancel event) tant que l'utilisateur n'a pas acquitté.
watch(
  () => store.initialized && !store.seen,
  async (shouldShow) => {
    await nextTick()
    const dlg = dialogRef.value
    if (!dlg) return
    if (shouldShow && !dlg.open) dlg.showModal()
    else if (!shouldShow && dlg.open) dlg.close()
  },
  { immediate: true },
)

function onCancel(e: Event) {
  // Empêche la fermeture par Escape — l'acquittement est obligatoire.
  e.preventDefault()
}
</script>

<template>
  <Teleport
    v-if="store.initialized && !store.seen"
    to="body"
  >
    <dialog
      ref="dialogRef"
      class="modal"
      aria-labelledby="disclaimer-title"
      @cancel="onCancel"
    >
      <h2 id="disclaimer-title">
        Avant de commencer
      </h2>
      <p>
        Cet outil est une aide à la simulation pour usage personnel.
        Les calculs fiscaux sont indicatifs et ne remplacent pas un conseil professionnel
        (expert-comptable, conseiller fiscal). En cas de doute sur une décision impliquant
        un montant significatif, consulter un professionnel.
      </p>
      <button
        type="button"
        class="btn-primary"
        autofocus
        @click="store.acknowledge()"
      >
        J'ai compris
      </button>
    </dialog>
  </Teleport>

  <aside
    class="disclaimer"
    role="note"
  >
    <strong>⚠️ Avertissement :</strong>
    Cet outil est une aide à la simulation pour usage personnel.
    Les calculs fiscaux sont indicatifs et ne remplacent pas un conseil professionnel
    (expert-comptable, conseiller fiscal). En cas de doute sur une décision impliquant
    un montant significatif, consulter un professionnel.
  </aside>
</template>

<style scoped>
.modal {
  background: var(--color-bg-elevated);
  color: var(--color-text);
  padding: var(--space-8);
  border: none;
  border-radius: var(--radius-lg);
  max-width: 540px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  box-shadow: var(--shadow-md);
}
.modal::backdrop { background: rgb(0 0 0 / 0.5); }
.btn-primary {
  background: var(--color-accent);
  color: white;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  align-self: flex-end;
  border: none;
  font: inherit;
  cursor: pointer;
}

.disclaimer {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  background: var(--color-neutral-100);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-warning);
  line-height: var(--line-height-relaxed);
}
.disclaimer strong { color: var(--color-text); }
</style>
