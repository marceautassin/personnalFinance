import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Test d'architecture — AC 8 de la story 27.2.
 *
 * Énumère tous les fichiers de `server/api/` (hors `*.test.ts` et hors `profiles/`, qui
 * n'existe pas encore — 27.3) et échoue si l'un d'eux n'appelle pas `requireProfile`. C'est le
 * garde-fou automatique du point d'entrée unique (D38, AR35) : sans lui, un futur endpoint
 * pourrait lire le cookie `pf_profile` lui-même, ou oublier de restreindre ses requêtes au
 * profil courant, sans qu'aucun test ne le signale avant la revue.
 *
 * ⚠️ **Ce que cette garde NE vérifie PAS** (revue de la story 27.2) : la présence textuelle de
 * `requireProfile(` dans le fichier, rien de plus. Un endpoint qui appellerait `requireProfile`
 * sans jamais utiliser le `profileId` obtenu — donc sans filtrer réellement ses requêtes par
 * profil — passerait ce test sans être cloisonné. Ce test attrape l'oubli total (endpoint qui
 * ne l'appelle pas du tout) ; il ne remplace pas la revue de code sur CHAQUE requête SQL de
 * l'endpoint, ni un test à deux profils qui exercerait le cloisonnement pour de vrai.
 */
const API_ROOT = join(process.cwd(), 'server/api')

function collectApiFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = full.slice(API_ROOT.length + 1).replaceAll('\\', '/')
    if (rel === 'profiles' || rel.startsWith('profiles/')) continue
    if (statSync(full).isDirectory()) {
      out.push(...collectApiFiles(full))
      continue
    }
    if (!full.endsWith('.ts') || full.endsWith('.test.ts')) continue
    out.push(full)
  }
  return out
}

describe('architecture — server/api/ appelle requireProfile', () => {
  const files = collectApiFiles(API_ROOT)

  it('a bien trouvé des fichiers à vérifier (garde contre un test qui passerait à vide)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map(f => [f.slice(process.cwd().length + 1), f] as const))(
    '%s appelle requireProfile',
    (_label, file) => {
      const source = readFileSync(file, 'utf-8')
      expect(source).toMatch(/\brequireProfile\s*\(/)
    },
  )
})
