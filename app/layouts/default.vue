<template>
  <div class="layout">
    <AppHeader />
    <AppNav />
    <main class="layout__main">
      <slot />
    </main>
    <footer class="layout__footer">
      <AppDisclaimer />
    </footer>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  flex: 1;
  max-width: var(--container-max);
  width: 100%;
  margin: 0 auto;
  padding: var(--space-4) var(--space-6);
  gap: var(--space-6);
}

.layout__main { flex: 1; }
.layout__footer {
  margin-top: var(--space-12);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}
</style>
