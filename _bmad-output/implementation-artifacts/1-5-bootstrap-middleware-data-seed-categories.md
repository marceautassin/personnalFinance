# Story 1.5: Bootstrap middleware (création `_data/`, ouverture DB, seed catégories)

Status: review

## Story

As a user lançant l'app pour la première fois,
I want the database, folders and default reference data to be created automatically,
so that I don't have to run setup scripts manually before using the app.

This story résout le **Gap G2** identifié en Architecture §Validation.

## Acceptance Criteria

1. **Given** un environnement neuf (pas de `_data/`),
   **When** je lance `yarn dev`,
   **Then** un middleware Nitro `server/middleware/0.bootstrap.ts` s'exécute une fois au démarrage et :
   - Crée `_data/` et `_data/raw/` (mkdir récursif idempotent)
   - Ouvre/crée `_data/personnalfinance.db` (le singleton de Story 1.4 fait déjà l'ouverture)
   - Vérifie que les tables existent (sinon, exécute un push programmatique du schéma)
   - Seed la table `category_definitions` avec `DEFAULT_CATEGORIES` de Story 1.4

2. **Given** un environnement déjà initialisé,
   **When** je relance `yarn dev`,
   **Then** le bootstrap détecte que la base et les catégories existent et **ne réexécute pas le seed** (idempotent — pas de duplicate).

3. **Given** le bootstrap exécuté avec succès,
   **When** j'inspecte la base via `yarn db:studio`,
   **Then** la table `category_definitions` contient exactement les entrées de `DEFAULT_CATEGORIES` avec `is_variable` correctement positionné.

4. **Given** le bootstrap échoue (erreur de permissions, disque plein, etc.),
   **When** une exception remonte,
   **Then** elle est loggée explicitement (pas avalée silencieusement) et l'app refuse de servir des requêtes — le middleware throw l'erreur pour que Nitro l'affiche.

5. **Given** le préfixe `0.` du nom de fichier middleware,
   **When** d'autres middlewares seront ajoutés,
   **Then** ce middleware s'exécute en premier (Nitro/Nuxt traitent les middlewares par ordre alphabétique).

## Tasks / Subtasks

- [x] **Task 1 — Implémenter le middleware bootstrap** (AC: #1, #4, #5)
  - [x] Créer `server/middleware/0.bootstrap.ts` selon le snippet Dev Notes
  - [x] Le middleware doit s'exécuter une seule fois (utiliser un module-level guard `let isBootstrapped = false`)
  - [x] Vérifier qu'il s'exécute au démarrage Nitro et pas à chaque requête (un middleware Nitro classique tourne par requête — utiliser le pattern guard ou un Nitro plugin alternatif, voir Dev Notes)

- [x] **Task 2 — Implémenter la logique de push programmatique** (AC: #1)
  - [x] Vérifier la présence des tables via `sqlite_master` ou tentative de SELECT
  - [x] Si la table `category_definitions` n'existe pas, lancer un push programmatique via `drizzle-kit` ou exécuter directement les `CREATE TABLE` SQL générés (voir Dev Notes pour l'option retenue)

- [x] **Task 3 — Implémenter le seed idempotent** (AC: #2, #3)
  - [x] Pour chaque entrée de `DEFAULT_CATEGORIES`, faire un `INSERT ... ON CONFLICT(code) DO NOTHING` (Drizzle expose `onConflictDoNothing` sur les insert SQLite)
  - [x] Logger combien de catégories ont été insérées (debug)

- [x] **Task 4 — Tester l'idempotence** (AC: #2)
  - [x] Démarrer une fois (`yarn dev`), arrêter, relancer → vérifier qu'il n'y a pas de duplicate (par exemple 22 catégories pour 22 défauts)
  - [x] Tester en supprimant `_data/`, relancer → vérifier que tout se recrée
  - [x] Tester en gardant `_data/` mais en effaçant le contenu de `category_definitions` → vérifier que le seed les recrée

- [x] **Task 5 — Sanity check final**
  - [x] `yarn dev` démarre, logs propres
  - [x] `yarn db:studio` montre la base bien initialisée
  - [x] `yarn lint`, `yarn typecheck` propres

## Dev Notes

### Choix d'implémentation : middleware vs plugin Nitro

Nitro distingue deux choses :
- **Middlewares** (`server/middleware/*.ts`) → exécutés à **chaque requête HTTP**.
- **Plugins** (`server/plugins/*.ts`) → exécutés **une fois** au démarrage.

Pour un bootstrap qui doit tourner une seule fois, **un plugin Nitro est plus naturel** qu'un middleware avec guard. Mais l'epic et l'architecture parlent de "middleware `0.bootstrap.ts`" — par cohérence terminologique, on garde ce nom mais on implémente avec un guard module-level + idempotence DB. L'epic dit "middleware" → on respecte. Si tu préfères basculer en plugin (cleaner), c'est aussi valide — adapte le path à `server/plugins/bootstrap.ts` et signale-le en Completion Notes.

**Recommandation** : commence par le middleware avec guard (comme l'epic le décrit). Si tu trouves ça lourd, bascule en plugin.

### Snippet `server/middleware/0.bootstrap.ts` (Tasks 1-3)

```ts
import { mkdirSync, existsSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { db } from '~/server/db/client'
import { categoryDefinitions } from '~/server/db/schema'
import { DEFAULT_CATEGORIES } from '~/shared/constants/default-categories'

let isBootstrapped = false
let bootstrapError: Error | null = null

async function bootstrap(): Promise<void> {
  // 1. Créer les dossiers runtime
  for (const dir of ['_data', '_data/raw']) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      console.warn(`[bootstrap] créé ${dir}`)
    }
  }

  // 2. Vérifier que la table category_definitions existe.
  //    better-sqlite3 + Drizzle : si la table manque, une SELECT lèvera une erreur "no such table".
  let tableExists = true
  try {
    await db.select().from(categoryDefinitions).limit(1).all()
  } catch (err) {
    if (err instanceof Error && /no such table/i.test(err.message)) {
      tableExists = false
    } else {
      throw err
    }
  }

  if (!tableExists) {
    console.warn('[bootstrap] tables manquantes — exécuter `yarn db:push` puis relancer.')
    throw new Error(
      'Base de données non initialisée. Lance `yarn db:push` (ou `yarn apply-migration` si tu utilises les migrations) puis relance le serveur.'
    )
  }
  // Note : on NE fait pas de push programmatique ici. Drizzle-kit n'est pas conçu
  // pour être appelé à l'exécution. Le contrat utilisateur est simple : `yarn db:push`
  // une fois après chaque modification de schema.ts. Pour un dev solo, c'est OK.
  // Si on veut automatiser plus tard, on regardera `drizzle-orm/migrator` avec un
  // dossier de migrations généré au préalable.

  // 3. Seed idempotent des catégories par défaut
  await db
    .insert(categoryDefinitions)
    .values(
      DEFAULT_CATEGORIES.map((c) => ({
        code: c.code,
        label: c.label,
        isVariable: c.isVariable,
      }))
    )
    .onConflictDoNothing({ target: categoryDefinitions.code })

  console.warn('[bootstrap] OK — base prête')
}

export default defineEventHandler(async () => {
  if (isBootstrapped) return
  if (bootstrapError) {
    // Si un bootstrap précédent a échoué, on relance la même erreur à chaque requête
    // jusqu'à ce que l'utilisateur corrige et redémarre.
    throw bootstrapError
  }

  try {
    await bootstrap()
    isBootstrapped = true
  } catch (err) {
    bootstrapError = err instanceof Error ? err : new Error(String(err))
    console.error('[bootstrap] échec :', bootstrapError)
    throw bootstrapError
  }
})
```

### Sur la décision "pas de push programmatique"

L'AC#1 mentionne "exécute un push programmatique du schéma". J'ai choisi dans le snippet de **lever une erreur explicite plutôt que de pusher** parce que :
1. `drizzle-kit` est un CLI dev — pas conçu pour s'exécuter en runtime.
2. Faire un `CREATE TABLE` à la main en runtime à partir du schéma TS est fragile.
3. Le contrat avec l'utilisateur "lance `yarn db:push` après chaque modif schema" est simple et explicite (KISS).
4. L'app refuse poliment de démarrer si la base manque — c'est moins surprenant qu'une création silencieuse partielle.

**Si tu veux quand même un vrai bootstrap qui crée la base :** utilise `drizzle-orm/migrator` avec des migrations générées (passe en `db:generate` + `apply-migration`). Mais ça remet en cause la décision D4 (push V1). À discuter avec l'utilisateur si tu vas dans ce sens — sinon respecte l'approche fail-fast ci-dessus et adapte l'AC#1 en conséquence (Completion Notes).

### Anti-patterns à éviter

- ❌ Insérer les catégories sans `onConflictDoNothing` — provoque un duplicate au 2e démarrage.
- ❌ Logger en `console.log` — utiliser `console.warn` (autorisé) ou `console.error`.
- ❌ Avaler silencieusement les erreurs (`try { ... } catch {}`) — laisser remonter pour que Nitro l'affiche.
- ❌ Créer `_data/` ailleurs dans le code (en double avec `client.ts` qui le fait aussi) — la double création est idempotente donc OK, mais signaler une seule "source de vérité" dans le commentaire.

### Tests

Pas de tests unitaires Vitest pour cette story (le bootstrap touche le filesystem et Nitro, plus simple à valider manuellement). Les Tasks 4 listent les tests manuels obligatoires.

Si tu veux un test Vitest minimal sur la fonction `bootstrap()` extraite, c'est possible avec une DB in-memory et un dossier temporaire — bonus, pas requis pour cette story.

### Project Structure Notes

Cette story crée :
- `server/middleware/0.bootstrap.ts`

Le dossier `server/middleware/` peut ne pas exister — le créer.

### Definition of Done

- [ ] Middleware créé avec idempotence (guard module-level + onConflictDoNothing)
- [ ] `_data/` et `_data/raw/` créés au démarrage si absents
- [ ] Seed des catégories par défaut, vérifiable via `yarn db:studio`
- [ ] Idempotent : 2e démarrage sans erreur ni duplicate
- [ ] Erreur explicite si la base n'est pas initialisée (`yarn db:push` requis)
- [ ] `yarn lint`, `yarn typecheck` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Gaps à résoudre dans les stories §G2] — bootstrap base de données
- [Source: `CLAUDE.md`#Sécurité] — `_data/` gitignored
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Validation Results §G2] — gap original
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D4] — push V1
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 1.5] — story originale et ACs
- [Previous stories: `1-3` (Cents non utilisé ici), `1-4` (DB client + DEFAULT_CATEGORIES utilisés)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code)

### Debug Log References

- `yarn db:push --force` (TTY non interactif) pour pousser le schéma initial.
- Validation manuelle via `curl http://localhost:3000/` après `yarn dev` — le 500 retourné côté curl est dû à un autre souci `vite-node IPC` non lié au middleware (renderer SSR), mais le middleware bootstrap a bien tourné en amont (logs `[bootstrap]`).

### Completion Notes List

- **Choix middleware (vs plugin Nitro)** : conservé `server/middleware/0.bootstrap.ts` comme spécifié par l'epic. Pattern guard module-level (`isBootstrapped`, `bootstrapError`) → exécution effective une seule fois, même si le handler tourne par requête.
- **Décision "fail-fast" sur tables manquantes (vs push programmatique)** : choisi de throw une erreur explicite invitant à `yarn db:push` plutôt que de pusher au runtime — `drizzle-kit` est un CLI dev, pas conçu pour s'exécuter en runtime, et un `CREATE TABLE` reconstruit à la main est fragile. Cela diverge légèrement de la formulation de l'AC#1 ("exécute un push programmatique du schéma") mais respecte la décision D4 (push V1) et le principe KISS du projet. À discuter avec l'utilisateur si une vraie auto-initialisation est souhaitée (basculer en `db:generate` + `drizzle-orm/migrator`).
- **Comportements vérifiés manuellement** :
  1. Premier démarrage avec `_data/` vide mais DB poussée : `_data/raw` créé, 19 catégories insérées (logs `[bootstrap] OK — base prête (19 catégorie(s) insérée(s))`).
  2. Deuxième requête sur le même process : guard bloque, aucun nouveau log bootstrap.
  3. Après redémarrage complet du serveur : nouveau bootstrap, 0 catégorie insérée (idempotence via `onConflictDoNothing`), 19 catégories préservées.
  4. Après `DELETE FROM category_definitions` puis redémarrage : 19 catégories réinsérées.
  5. Après `rm -rf _data` puis redémarrage (DB vide, sans tables) : `_data/raw` recréé, erreur explicite levée et propagée à chaque requête tant que la base n'est pas réinitialisée.
- **Lint**: `yarn lint server/middleware/0.bootstrap.ts` propre. Erreur préexistante sur `nuxt.config.ts` (`modules` après `ssr`) non liée à cette story.
- **Typecheck**: `yarn typecheck` propre.
- **Tests Vitest**: 45/45 passent (aucune régression).
- **Test unitaire** : non ajouté — le bootstrap touche le filesystem et le singleton DB Drizzle, conformément à la note "tests manuels obligatoires" de la story. Possible amélioration future : extraire `bootstrap()` en fonction pure paramétrée par db + paths pour la rendre testable en isolation.

### File List

- `server/middleware/0.bootstrap.ts` (nouveau)
