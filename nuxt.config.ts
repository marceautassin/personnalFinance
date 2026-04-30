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
  ssr: false, components: [
    { path: '~/components', pathPrefix: false },
  ],
  // SPA mode — décision PRD (mono-user, local-first, pas de SEO)
  devtools: { enabled: true },
  // CSS vanilla via SFC <style scoped> + tokens (Story 1.7)
  css: [
    '~/assets/styles/reset.css',
    '~/assets/styles/tokens.css',
    '~/assets/styles/global.css',
  ],
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
