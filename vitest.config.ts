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
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
  },
})
