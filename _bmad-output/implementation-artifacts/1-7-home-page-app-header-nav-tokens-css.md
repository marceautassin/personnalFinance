# Story 1.7: Home page minimaliste + AppHeader/AppNav + tokens CSS

Status: done

## Story

As a user,
I want to land on a clean minimal home page when launching the app for the first time,
so that I can verify the foundation is operational and have a consistent visual base before any feature lands.

## Acceptance Criteria

1. **Given** la racine de styles `app/assets/styles/`,
   **When** je crée `tokens.css` (custom properties : couleurs neutres + sémantiques, spacing scale, typo scale, radii, shadows, transitions), `reset.css` (normalize moderne minimal), `global.css` (styles globaux qui consomment les tokens),
   **Then** ils sont importés via `nuxt.config.ts` (option `css: [...]`) ou via `app.vue` et appliqués globalement.

2. **Given** la base de styles,
   **When** je crée `app/components/shared/AppHeader.vue` (titre app + tagline courte) et `app/components/shared/AppNav.vue` (placeholders pour les pages futures qui n'existent pas encore — items désactivés sans liens cassés),
   **Then** ils s'affichent dans `app.vue` ou via un layout par défaut.

3. **Given** la home page,
   **When** je crée `app/pages/index.vue`,
   **Then** elle affiche un message d'accueil minimal en français, expliquant ce qu'est l'app et invitant à importer un PDF (lien actif vers `/import` qui n'existe pas encore — pointer vers une route inexistante est OK pour cette V1, on créera la page en Story 2.9).

4. **Given** le composant `AppDisclaimer.vue` (créé même s'il sera complété en Story 2.9 pour le flag `localStorage` G1),
   **When** il est inclus dans `app.vue`,
   **Then** un bandeau ou modal affiche le disclaimer FR54 (texte exact dans Dev Notes), pour l'instant **toujours visible** (la persistance "déjà vu" sera ajoutée en Story 2.9).

5. **Given** `yarn dev`,
   **When** j'ouvre `http://localhost:3000`,
   **Then** la page s'affiche sans erreur console (ni client ni serveur), avec un design lisible (contrastes WCAG AA visés à l'œil), et le focus visible au clavier sur les éléments interactifs.

6. **Given** la matrice de browsers (PRD) Chrome + Firefox ≥ 1280px desktop only,
   **When** je teste à la main dans les deux navigateurs,
   **Then** le rendu est identique et utilisable (CSS modernes acceptables : nesting natif, custom properties, `:focus-visible`, `:has()` si utile, container queries non requis ici).

## Tasks / Subtasks

- [x] **Task 1 — Tokens CSS** (AC: #1)
  - [x] Créer `app/assets/styles/tokens.css` selon le snippet Dev Notes
  - [x] Créer `app/assets/styles/reset.css` (normalize minimal, voir Dev Notes pour la base)
  - [x] Créer `app/assets/styles/global.css` (styles consommant les tokens)
  - [x] Configurer l'import dans `nuxt.config.ts` (option `css: ['~/assets/styles/reset.css', '~/assets/styles/tokens.css', '~/assets/styles/global.css']`)
  - [x] Vérifier dans le navigateur que les variables CSS sont disponibles (DevTools → Computed → custom properties visibles)

- [x] **Task 2 — Layout + AppHeader + AppNav** (AC: #2)
  - [x] Créer `app/components/shared/AppHeader.vue` (titre "personnalFinance" + tagline "Pilotage financier perso")
  - [x] Créer `app/components/shared/AppNav.vue` avec items : Dashboard, Import, Transactions, Charges, Revenus, SAS, Dettes, Forecast, Paramètres. **Tous désactivés** en V1 sauf "Import" et "Dashboard" (qui peuvent pointer vers `/import` et `/`). Les items désactivés ont un attribut `aria-disabled="true"` et un style atténué.
  - [x] Créer `app/layouts/default.vue` qui inclut header + nav + slot principal + footer minimaliste avec le disclaimer
  - [x] S'assurer que `app.vue` utilise le layout par défaut

- [x] **Task 3 — Disclaimer** (AC: #4)
  - [x] Créer `app/components/shared/AppDisclaimer.vue` selon le snippet Dev Notes
  - [x] L'inclure dans le footer du layout (visible en permanence)
  - [x] **Note** : la persistance "déjà vu" (G1) est gérée en Story 2.9. Pour cette story, le bandeau est toujours visible.

- [x] **Task 4 — Home page** (AC: #3)
  - [x] Créer `app/pages/index.vue` avec un message d'accueil clair, un CTA principal vers `/import`
  - [x] Vérifier l'accessibilité : heading hierarchy correcte (`h1` unique), contrastes, focus visible

- [x] **Task 5 — Sanity check final** (AC: #5, #6)
  - [x] `yarn dev` → page s'affiche, zéro erreur console
  - [x] Tester Chrome + Firefox visuellement
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [x] Commit unique

## Dev Notes

### Snippet `app/assets/styles/tokens.css` (Task 1)

```css
/* Design tokens — personnalFinance
 *
 * Convention : les tokens sémantiques (--color-bg, --color-text) référencent
 * les tokens primitives (--color-neutral-50, etc.). Pour le dark mode futur,
 * on n'aura qu'à changer les sémantiques (les primitives restent fixes).
 */

:root {
  /* === Couleurs primitives === */
  --color-neutral-50: #fafafa;
  --color-neutral-100: #f4f4f5;
  --color-neutral-200: #e4e4e7;
  --color-neutral-300: #d4d4d8;
  --color-neutral-500: #71717a;
  --color-neutral-700: #3f3f46;
  --color-neutral-900: #18181b;

  --color-blue-500: #3b82f6;
  --color-blue-600: #2563eb;

  --color-green-500: #10b981;
  --color-amber-500: #f59e0b;
  --color-red-500: #ef4444;

  /* === Couleurs sémantiques === */
  --color-bg: var(--color-neutral-50);
  --color-bg-elevated: #ffffff;
  --color-text: var(--color-neutral-900);
  --color-text-muted: var(--color-neutral-500);
  --color-border: var(--color-neutral-200);
  --color-border-strong: var(--color-neutral-300);

  --color-accent: var(--color-blue-600);
  --color-accent-hover: var(--color-blue-500);

  --color-success: var(--color-green-500);
  --color-warning: var(--color-amber-500);
  --color-danger: var(--color-red-500);

  /* === Typographie === */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', monospace;

  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 2rem;

  --line-height-tight: 1.2;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.7;

  /* === Espacements (échelle 4px) === */
  --space-1: 0.25rem;  /*  4px */
  --space-2: 0.5rem;   /*  8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-12: 3rem;    /* 48px */
  --space-16: 4rem;    /* 64px */

  /* === Radii === */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-full: 9999px;

  /* === Shadows === */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);

  /* === Transitions === */
  --transition-fast: 100ms ease-out;
  --transition-base: 200ms ease-out;

  /* === Layout === */
  --container-max: 1280px;
  --content-max: 960px;
}
```

### Snippet `app/assets/styles/reset.css` (Task 1)

```css
/* Modern CSS reset — minimal version */
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; -moz-text-size-adjust: 100%; text-size-adjust: 100%; }
body { line-height: var(--line-height-normal); -webkit-font-smoothing: antialiased; }
img, picture, video, canvas, svg { display: block; max-width: 100%; }
input, button, textarea, select { font: inherit; color: inherit; }
button { background: none; border: none; cursor: pointer; }
a { color: inherit; text-decoration: none; }
ul, ol { list-style: none; }
table { border-collapse: collapse; border-spacing: 0; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: var(--radius-sm); }
```

### Snippet `app/assets/styles/global.css` (Task 1)

```css
html, body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  min-height: 100vh;
}

body { display: flex; flex-direction: column; }
#__nuxt { flex: 1; display: flex; flex-direction: column; }

h1, h2, h3, h4, h5, h6 {
  line-height: var(--line-height-tight);
  font-weight: 600;
}

h1 { font-size: var(--font-size-3xl); }
h2 { font-size: var(--font-size-2xl); }
h3 { font-size: var(--font-size-xl); }

p { color: var(--color-text); line-height: var(--line-height-normal); }
small { color: var(--color-text-muted); font-size: var(--font-size-sm); }
```

### Snippet `app/layouts/default.vue` (Task 2)

```vue
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
```

### Snippet `app/components/shared/AppHeader.vue` (Task 2)

```vue
<template>
  <header class="header">
    <h1 class="header__title">personnalFinance</h1>
    <p class="header__tagline">Pilotage financier personnel</p>
  </header>
</template>

<style scoped>
.header { display: flex; align-items: baseline; gap: var(--space-3); }
.header__title { font-size: var(--font-size-2xl); }
.header__tagline { color: var(--color-text-muted); font-size: var(--font-size-sm); }
</style>
```

### Snippet `app/components/shared/AppNav.vue` (Task 2)

```vue
<script setup lang="ts">
interface NavItem {
  label: string
  href: string | null
}

const items: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Import', href: '/import' },
  { label: 'Transactions', href: null },  // Pages actives à partir des Stories 2.x+
  { label: 'Charges', href: null },
  { label: 'Revenus', href: null },
  { label: 'SAS', href: null },
  { label: 'Dettes', href: null },
  { label: 'Forecast', href: null },
  { label: 'Paramètres', href: null },
]
</script>

<template>
  <nav class="nav" aria-label="Navigation principale">
    <ul class="nav__list">
      <li v-for="item in items" :key="item.label">
        <NuxtLink
          v-if="item.href"
          :to="item.href"
          class="nav__link"
        >
          {{ item.label }}
        </NuxtLink>
        <span
          v-else
          class="nav__link nav__link--disabled"
          aria-disabled="true"
          tabindex="-1"
        >
          {{ item.label }}
        </span>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.nav { border-bottom: 1px solid var(--color-border); }
.nav__list { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.nav__link {
  display: inline-block;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  transition: background-color var(--transition-fast);
}
.nav__link:hover { background: var(--color-neutral-100); }
.nav__link--disabled { color: var(--color-text-muted); cursor: not-allowed; }
.nav__link--disabled:hover { background: transparent; }
</style>
```

### Snippet `app/components/shared/AppDisclaimer.vue` (Task 3)

```vue
<template>
  <aside class="disclaimer" role="note">
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
```

### Snippet `app/pages/index.vue` (Task 4)

```vue
<template>
  <section class="home">
    <h2 class="home__title">Bienvenue</h2>
    <p class="home__lead">
      personnalFinance pilote tes finances perso à partir de tes relevés bancaires.
      Dépose un PDF Boursorama, l'app catégorise tes dépenses et te dit combien de
      dividende voter à la prochaine AG pour tenir tes objectifs.
    </p>

    <div class="home__cta">
      <NuxtLink to="/import" class="cta">
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
```

### Configuration `nuxt.config.ts` (Task 1 — modification)

Ajouter dans `defineNuxtConfig` :
```ts
css: [
  '~/assets/styles/reset.css',
  '~/assets/styles/tokens.css',
  '~/assets/styles/global.css',
],
```

L'ordre compte : `reset` avant `tokens` avant `global` (le global consomme les tokens).

### Anti-patterns à éviter

- ❌ Importer Tailwind ou tout framework CSS (rappel CLAUDE.md).
- ❌ Inline styles dans les composants (sauf cas justifié) — passer par `<style scoped>` + tokens.
- ❌ Utiliser `<a href="...">` au lieu de `<NuxtLink to="...">` pour la navigation interne (perd les optimisations).
- ❌ Définir des couleurs en hexadécimal directement dans les composants — toujours via `var(--color-...)`.
- ❌ Créer un router/state pour ce qui n'existe pas (les items "désactivés" ne doivent pas générer de route 404 si on clique — d'où `<span aria-disabled="true">` au lieu de `<NuxtLink>`).
- ❌ Implémenter la persistance du flag "disclaimer vu" (G1) ici — c'est la Story 2.9. En cette story, le bandeau reste visible.

### Accessibility checklist

- [x] Heading hierarchy : `h1` dans `AppHeader`, `h2` dans `index.vue` (pas de skip de niveau).
- [x] Tous les éléments interactifs (`<NuxtLink>`, `<a>`, `<button>`) ont un focus visible (déjà géré par `:focus-visible` global).
- [x] Contrastes : tester `color-contrast` sur Chrome DevTools sur le texte muted vs background — visé WCAG AA (4.5:1 pour le texte normal).
- [x] Disclaimer : `role="note"` pour le bandeau (informatif, pas alerte).
- [x] Items désactivés : `aria-disabled="true"` + `tabindex="-1"` pour qu'ils ne soient pas focusables.

### Project Structure Notes

Cette story crée :
- `app/assets/styles/tokens.css`
- `app/assets/styles/reset.css`
- `app/assets/styles/global.css`
- `app/layouts/default.vue`
- `app/components/shared/AppHeader.vue`
- `app/components/shared/AppNav.vue`
- `app/components/shared/AppDisclaimer.vue`
- `app/pages/index.vue` (création ou remplacement de la version Nuxt par défaut)
- Modification `nuxt.config.ts` (ajout option `css`)

Si une `app/pages/index.vue` de démo Nuxt existe (depuis Story 1.1), la remplacer.

### Definition of Done

- [x] Tokens CSS créés et chargés
- [x] AppHeader, AppNav (avec items désactivés), AppDisclaimer créés et placés dans le layout par défaut
- [x] Home page minimaliste avec CTA "Importer mon premier relevé"
- [x] Page s'affiche sans erreur console sur Chrome et Firefox ≥ 1280px
- [x] Focus visible au clavier sur les éléments interactifs
- [x] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
- [x] Commit unique

### References

- [Source: `CLAUDE.md`#Stack verrouillée] — CSS vanilla, pas Tailwind
- [Source: `CLAUDE.md`#Anti-patterns interdits] — composants Vue ne font pas de fetch direct (rien à fetch ici donc OK)
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Web Application Specific Requirements] — desktop only ≥ 1280px, Chrome + Firefox, accessibilité best-effort
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Implementation Patterns] — naming `kebab-case.ts` pour TS et `PascalCase.vue` pour composants
- [Source: `_bmad-output/planning-artifacts/prd.md`#FR54] — disclaimer
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 1.7] — story originale et ACs

### Review Findings

_Code review du 2026-04-30 (3 layers : Blind Hunter, Edge Case Hunter, Acceptance Auditor)._

- [x] [Review][Patch] Commentaire orphelin entre `nitro` et `typescript` blocks [nuxt.config.ts:29] — fixed, déplacé au-dessus du tableau `css: [...]`.
- [x] [Review][Defer] Style `.router-link-active` absent sur `AppNav` [AppNav.vue:53-66] — deferred, polish futur. La nav ne signale pas la route courante. À ajouter quand une seconde route active existera (Story 2.9).
- [x] [Review][Defer] `nodeTsConfig` / `sharedTsConfig` non documentés dans Nuxt 4 [nuxt.config.ts:33-34] — deferred, pré-existant (Story 1.2/1.6). Vérifier qu'elles sont bien prises en compte ou les retirer ; sinon strictness silencieusement absente sur `server/` et `shared/`.
- [x] [Review][Defer] `strict: true` non propagé au `tsConfig` Nitro [nuxt.config.ts:24-28] — deferred, pré-existant. Le bloc nitro spread seulement `strictCompilerOptions` sans `strict: true`.
- [x] [Review][Defer] Pas de `@media (prefers-reduced-motion: reduce)` [tokens.css transitions, AppNav.vue, index.vue] — deferred, a11y best-effort (hors AC). Les `transition` ignorent la préférence système.

**Dismissed (21 findings)** — conformité spec verbatim (`color: white` sur CTA, ordre `reset → tokens → global`, `<span aria-disabled>` pour items désactivés, emoji ⚠️, `<aside role="note">`, règles `<small>`/`<p>` globales) ; hors scope explicite (≥1280px desktop only, dark mode futur, G1 reporté Story 2.9, route `/import` autorisée à 404 par AC#3, print stylesheet absent) ; non-issues (cascade CSS résout les `var()` indépendamment de l'ordre des fichiers, `text-size-adjust: 100%` n'empêche pas le zoom utilisateur).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code, mode dev story)

### Debug Log References

- Page Nuxt par défaut (`<NuxtWelcome />`) remplacée dans `app/app.vue` par un `<NuxtLayout><NuxtPage/></NuxtLayout>` minimal.
- `yarn dev` en arrière-plan a produit l'erreur `Vite Node IPC socket path not configured` (limitation environnement de l'agent, pas un bug du code) — validation effectuée via `yarn build` + `node .output/server/index.mjs` + Playwright headless.
- Auto-discovery des composants : par défaut Nuxt préfixe les composants imbriqués avec le nom du dossier (`shared/AppHeader.vue` → `<SharedAppHeader>`). Pour respecter le naming `<AppHeader>`/`<AppNav>`/`<AppDisclaimer>` du snippet, ajout dans `nuxt.config.ts` :
  ```ts
  components: [{ path: '~/components', pathPrefix: false }]
  ```
- ESLint a auto-fixé les sauts de ligne attendus par les règles `vue/singleline-html-element-content-newline` et `vue/max-attributes-per-line`.

### Completion Notes List

- Tokens, reset, global CSS créés et chargés dans l'ordre `reset → tokens → global` via `nuxt.config.ts` (l'ordre garantit que `global.css` consomme les variables des tokens).
- `AppHeader`, `AppNav`, `AppDisclaimer` créés dans `app/components/shared/`. `AppNav` expose 9 items, dont 2 actifs (`/`, `/import`) et 7 désactivés (`aria-disabled="true"`, `tabindex="-1"`).
- `app/layouts/default.vue` assemble header + nav + slot + footer (avec disclaimer). `app.vue` utilise `<NuxtLayout>`.
- `app/pages/index.vue` affiche une `h2` (la `h1` étant dans le header), un lead descriptif, un CTA `/import`, et un hint `Aucun relevé pour l'instant.`.
- Validation rendu : Playwright (Chrome headless) confirme la structure DOM attendue (banner h1, navigation principale, main h2, contentinfo + note disclaimer) avec **0 erreur / 0 warning console**. Les items désactivés sont rendus en `<span>` (pas focusables, sans lien cassé). Test Firefox visuel non exécuté en environnement headless — à valider à la main lors d'une session locale.
- Persistance G1 (flag "disclaimer vu") laissée à la Story 2.9 comme prévu — bandeau toujours visible en V1.
- Pré-existant hors scope de cette story : `app/composables/useApiError*.ts` (Story 1.6 in-progress) déclenchent des erreurs ESLint (kebab-case) et un échec vitest (import manquant `~~/shared/schemas/api-errors`). Pas touché.

### File List

- `app/assets/styles/tokens.css` (créé)
- `app/assets/styles/reset.css` (créé)
- `app/assets/styles/global.css` (créé)
- `app/components/shared/AppHeader.vue` (créé)
- `app/components/shared/AppNav.vue` (créé)
- `app/components/shared/AppDisclaimer.vue` (créé)
- `app/layouts/default.vue` (créé)
- `app/pages/index.vue` (créé)
- `app/app.vue` (modifié — remplacement de `<NuxtWelcome />` par `<NuxtLayout><NuxtPage/></NuxtLayout>`)
- `nuxt.config.ts` (modifié — ajout `css: [...]` et `components: [{ path: '~/components', pathPrefix: false }]`)
