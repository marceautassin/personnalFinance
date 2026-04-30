// @ts-check
import unicorn from 'eslint-plugin-unicorn'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      // Convention CLAUDE.md : pas de console.log en code merged
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Imports relatifs profonds interdits ; préférer les alias Nuxt
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['../../*'], message: 'Préférer un chemin absolu via les alias Nuxt (~/, @/, etc.) ou auto-imports.' },
        ],
      }],
      'vue/multi-word-component-names': 'off',
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
    },
  },
  // Nommage : .ts en kebab-case (interdit PascalCase)
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { unicorn },
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
    },
  },
  // Nommage : composables Nuxt en useCamelCase.ts (cf. CLAUDE.md §Conventions)
  {
    files: ['**/composables/**/*.ts'],
    plugins: { unicorn },
    rules: {
      'unicorn/filename-case': ['error', { case: 'camelCase' }],
    },
  },
  // Nommage : composants Vue en PascalCase (warning)
  // Pages / layouts / app.vue / error.vue suivent les conventions Nuxt (kebab/lowercase)
  {
    files: ['**/components/**/*.vue'],
    plugins: { unicorn },
    rules: {
      'unicorn/filename-case': ['warn', { case: 'pascalCase' }],
    },
  },
)
