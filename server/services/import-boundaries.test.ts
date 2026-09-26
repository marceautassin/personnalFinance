/**
 * Test d'architecture — frontières d'import (D44, story 28.4).
 *
 * D44 dit que ce test « ajouté au test qui garde déjà `unpdf` et le SDK du fournisseur »
 * n'existait pas encore. Il parcourt `server/`, `shared/`, `app/` (hors `node_modules`,
 * `.nuxt`) et échoue si un fichier importe l'un des trois modules ci-dessous en dehors de son
 * (ses) fichier(s) autorisé(s). Exemptions NOMMÉES, pas par motif (même leçon que la revue de la
 * story 27.3).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOTS = ['server', 'shared', 'app'].map(d => join(process.cwd(), d))
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output'])

interface Boundary {
  module: string
  allowedFiles: Set<string>
}

const BOUNDARIES: Boundary[] = [
  { module: 'unpdf', allowedFiles: new Set(['server/services/pdf-extractor.ts']) },
  {
    module: '@mistralai/mistralai',
    allowedFiles: new Set(['server/services/llm-categorizer.ts', 'server/services/llm-categorizer.test.ts']),
  },
  {
    module: 'exceljs',
    allowedFiles: new Set([
      'server/services/spreadsheet-extractor.ts',
      'server/services/generate-synthetic-export.test.ts',
    ]),
  },
]

function collectFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full))
      continue
    }
    if (full.endsWith('.ts') || full.endsWith('.vue')) out.push(full)
  }
  return out
}

/**
 * Détecte un import du module, sous ses TROIS formes valides en JS/TS (revue pr-reviewer de la
 * story 28.4, MINEUR 6) : `import … from 'x'` (statique), `import('x')` (dynamique — celle que
 * `vi.mock('x', …)` ne couvre pas mais qu'un contournement réel pourrait employer), et
 * `require('x')` (CommonJS, toujours valide dans ce projet Node). Le motif précédent ne
 * couvrait que la première : un import dynamique ou `require` aurait traversé cette garde sans
 * bruit.
 */
function importsModule(source: string, moduleName: string): boolean {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const suffix = `(?:/[^'"]*)?`
  const patterns = [
    new RegExp(`\\bfrom\\s+['"]${escaped}${suffix}['"]`, 'u'),
    new RegExp(`\\bimport\\s*\\(\\s*['"]${escaped}${suffix}['"]`, 'u'),
    new RegExp(`\\brequire\\s*\\(\\s*['"]${escaped}${suffix}['"]`, 'u'),
    // Import nu, sans liaison (`import 'x'`) — rare mais valide, et absent des deux premiers motifs.
    new RegExp(`\\bimport\\s+['"]${escaped}${suffix}['"]`, 'u'),
  ]
  return patterns.some(p => p.test(source))
}

describe('architecture — frontières d\'import (unpdf, SDK LLM, exceljs)', () => {
  const files = ROOTS.flatMap(collectFiles)

  it('a bien trouvé des fichiers à vérifier', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const boundary of BOUNDARIES) {
    describe(`\`${boundary.module}\``, () => {
      it.each(
        files
          .filter(f => importsModule(readFileSync(f, 'utf-8'), boundary.module))
          .map(f => [relative(process.cwd(), f)] as const),
      )('%s est un importateur autorisé', (relPath) => {
        expect(boundary.allowedFiles.has(relPath)).toBe(true)
      })

      it('au moins un importateur existe (garde contre un test qui passerait à vide)', () => {
        const importers = files.filter(f => importsModule(readFileSync(f, 'utf-8'), boundary.module))
        expect(importers.length).toBeGreaterThan(0)
      })
    })
  }
})
