import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Test d'architecture — AC 8 de la story 27.2.
 *
 * Énumère tous les fichiers de `server/api/` (hors `*.test.ts` et hors les quatre endpoints de
 * `profiles/` nommément listés dans `EXEMPT_FILES` ci-dessous — ils RÉSOLVENT le profil
 * eux-mêmes, création/liste/lecture/bascule, au lieu d'en recevoir un déjà établi par cookie,
 * story 27.3) et échoue si l'un d'eux n'appelle pas `requireProfile`. C'est le garde-fou
 * automatique du point d'entrée unique (D38, AR35) : sans lui, un futur endpoint pourrait lire
 * le cookie `pf_profile` lui-même, ou oublier de restreindre ses requêtes au profil courant,
 * sans qu'aucun test ne le signale avant la revue.
 *
 * **Exemption NOMMÉE, pas par dossier** (revue de la story 27.3, SUGGESTION 4) : exempter
 * `profiles/` tout entier aurait laissé passer SANS BRUIT un futur endpoint réellement
 * cloisonné dans ce même dossier — un `profiles/[id]/…` par exemple. Toute nouvelle addition à
 * `server/api/profiles/` est donc vérifiée par défaut, sauf à rejoindre explicitement cette
 * liste.
 *
 * ⚠️ **Ce que cette garde NE vérifie PAS** (revue de la story 27.2) : la présence textuelle de
 * `requireProfile(` dans le fichier, rien de plus. Un endpoint qui appellerait `requireProfile`
 * sans jamais utiliser le `profileId` obtenu — donc sans filtrer réellement ses requêtes par
 * profil — passerait ce test sans être cloisonné. Ce test attrape l'oubli total (endpoint qui
 * ne l'appelle pas du tout) ; il ne remplace pas la revue de code sur CHAQUE requête SQL de
 * l'endpoint, ni un test à deux profils qui exercerait le cloisonnement pour de vrai.
 */
const API_ROOT = join(process.cwd(), 'server/api')

/** Les quatre endpoints qui résolvent le profil eux-mêmes (story 27.3) — voir le commentaire ci-dessus. */
const EXEMPT_FILES = new Set([
  'profiles/index.get.ts',
  'profiles/index.post.ts',
  'profiles/current.get.ts',
  'profiles/current.put.ts',
])

function collectApiFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = full.slice(API_ROOT.length + 1).replaceAll('\\', '/')
    if (statSync(full).isDirectory()) {
      out.push(...collectApiFiles(full))
      continue
    }
    if (!full.endsWith('.ts') || full.endsWith('.test.ts')) continue
    if (EXEMPT_FILES.has(rel)) continue
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
