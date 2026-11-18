<template>
  <div class="layout">
    <AppBar />
    <main class="layout__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.layout { display: flex; flex-direction: column; flex: 1; }

/*
 * La barre est PLEINE LARGEUR, le contenu est borné.
 *
 * Une barre bornée comme le reste laisse deux bandes vides à ses extrémités et ne se lit plus
 * comme le cadre de l'application. Le centrage descend donc d'un cran, sur le contenu seul.
 */
.layout__main {
  flex: 1;
  width: 100%;
  max-width: var(--container-max);
  margin: 0 auto;
  padding: var(--space-4) var(--space-6) var(--space-6);
}
</style>
