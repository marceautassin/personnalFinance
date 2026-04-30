<template>
  <section class="home">
    <h2 class="home__title">
      Bienvenue
    </h2>
    <p class="home__lead">
      personnalFinance pilote tes finances perso à partir de tes relevés bancaires.
      Dépose un PDF Boursorama, l'app catégorise tes dépenses et te dit combien de
      dividende voter à la prochaine AG pour tenir tes objectifs.
    </p>

    <div class="home__cta">
      <NuxtLink
        to="/import"
        class="cta"
      >
        Importer mon premier relevé
      </NuxtLink>
    </div>

    <p class="home__hint">
      <small>Aucun relevé pour l'instant.</small>
    </p>
  </section>
</template>

<style scoped>
.home { display: flex; flex-direction: column; gap: var(--space-6); max-width: var(--content-max); }
.home__title { font-size: var(--font-size-3xl); }
.home__lead { font-size: var(--font-size-lg); line-height: var(--line-height-relaxed); }
.home__cta { margin-top: var(--space-4); }
.cta {
  display: inline-block;
  background: var(--color-accent);
  color: white;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-weight: 500;
  transition: background-color var(--transition-fast);
}
.cta:hover { background: var(--color-accent-hover); }
.home__hint { color: var(--color-text-muted); }
</style>
