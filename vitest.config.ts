import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
      '@@': fileURLToPath(new URL('.', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    // Default = node : adapté aux tests `server/**` et `shared/**` (better-sqlite3, node:fs, etc.).
    // Les tests qui ont besoin du DOM (composants Vue, composables côté client) doivent opt-in
    // via le doc-comment en tête de fichier : `// @vitest-environment happy-dom`
    environment: 'node',
    // Story 17.5 : la relance sur défaillance passagère attend une seconde en production.
    // La suite n'a aucune raison de la subir — c'est le comportement qu'on teste, pas l'attente.
    env: { LLM_RETRY_DELAY_MS: '0' },
    globals: true,
    passWithNoTests: true,
    include: [
      'app/**/*.test.ts',
      'server/**/*.test.ts',
      'shared/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      '.nuxt/**',
      '.output/**',
      'tests/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'server/services/**/*.ts',
        'shared/types/**/*.ts',
      ],
      // ⚠️ SEUILS À ZÉRO, ET CE N'EST PAS UN CHOIX — story 17.11, 2026-09-06.
      //
      // La mesure est CASSÉE dans ce dépôt : avec `v8` comme avec `istanbul`, les onze
      // fichiers du périmètre sont instrumentés puis rapportés à 0/N statements, alors que
      // les 493 tests les traversent et passent. Aucune ligne n'est comptée, pour aucun
      // fichier. Poser un seuil non nul sur cette mesure ferait échouer la CI sur un artefact
      // d'outillage, pas sur un défaut de couverture — c'est-à-dire un signal qui ment.
      //
      // Le gap G4 reste donc OUVERT. La discipline NFR3 est tenue à la lecture (cf. audit du
      // 2026-09-06 : les trois cas limites sont couverts sur le moteur, la réconciliation, les
      // ratios et les montants). À rouvrir quand l'instrumentation fonctionnera.
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
  },
})
