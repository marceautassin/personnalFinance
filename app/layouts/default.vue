<template>
  <div class="layout">
    <AppHeader />
    <AppNav />
    <main class="layout__main">
      <slot />
    </main>
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
</style>
