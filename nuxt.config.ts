// https://nuxt.com/docs/api/configuration/nuxt-config
const strictCompilerOptions = {
  noUncheckedIndexedAccess: true,
  noImplicitOverride: true,
  noFallthroughCasesInSwitch: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  forceConsistentCasingInFileNames: true,
}

export default defineNuxtConfig({
  modules: ['@pinia/nuxt', '@nuxt/eslint'],
  ssr: false,
  components: [
    { path: '~/components', pathPrefix: false },
  ],
  devtools: { enabled: true },
  // CSS vanilla via SFC <style scoped> + tokens (Story 1.7)
  css: [
    // Fontes SERVIES DEPUIS LE DÉPÔT : l'application est locale et doit tourner sans réseau.
    // Un `<link>` vers un CDN de fontes la casserait hors ligne et signalerait chaque ouverture
    // à un tiers, ce que le local-first exclut.
    '@fontsource/ibm-plex-sans/400.css',
    '@fontsource/ibm-plex-sans/500.css',
    '@fontsource/ibm-plex-sans/600.css',
    '@fontsource/ibm-plex-mono/400.css',
    '@fontsource/ibm-plex-mono/500.css',
    '~/assets/styles/reset.css',
    '~/assets/styles/tokens.css',
    '~/assets/styles/global.css',
    '~/assets/styles/components.css',
  ],
  // SPA mode — décision PRD (mono-user, local-first, pas de SEO)
  // Workaround Nuxt 4.4.4 bug : avec `ssr: false`, le SSR server vite n'est pas créé,
  // ce qui empêche `NUXT_VITE_NODE_OPTIONS.socketPath` d'être défini et fait planter
  // le renderer Nitro en dev. Le code-path `viteEnvironmentApi` initialise le socket
  // côté clientServer et débloque le rendu de la coquille SPA.
  experimental: {
    viteEnvironmentApi: true,
  },
  compatibilityDate: '2026-04-30',
  nitro: {
    typescript: {
      tsConfig: { compilerOptions: { ...strictCompilerOptions } },
    },
  },
  typescript: {
    strict: true,
    tsConfig: { compilerOptions: { ...strictCompilerOptions } },
    nodeTsConfig: { compilerOptions: { ...strictCompilerOptions } },
    sharedTsConfig: { compilerOptions: { ...strictCompilerOptions } },
  },
  eslint: {
    config: {
      stylistic: true,
    },
  },
})
