<template>
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
