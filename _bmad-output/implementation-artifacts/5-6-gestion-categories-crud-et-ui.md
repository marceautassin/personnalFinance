# Story 5.6: Gestion des catégories — endpoints CRUD + UI `/categories`

Status: ready-for-dev

## Story

As a user,
I want to create, rename, and delete categories of transactions,
so that the taxonomy fits my actual spending patterns and the LLM categorizer (story 2.4) reflects my current taxonomy on each new PDF import.

## Acceptance Criteria

1. **Given** la table `category_definitions` (déjà créée en story 2.1, schéma `id`/`code`/`label`/`is_variable`/`created_at`),
   **When** je `yarn db:push`,
   **Then** **aucune migration nécessaire** — la story réutilise le schéma existant.

2. **Given** un schéma Zod `shared/schemas/category.schema.ts`,
   **When** exposé,
   **Then** il définit :
   - `CategoryCodeSchema = z.string().regex(/^[a-z0-9-]+$/, 'kebab-case lowercase ASCII').min(1).max(32)`
   - `CategoryLabelSchema = z.string().trim().min(1).max(50)`
   - `CategorySchema` (lecture : `code`, `label`, `isVariable`)
   - `CategoryWithCountSchema` (lecture étendue avec `referenceCount: z.number().int().min(0)`)
   - `NewCategoryInputSchema` (création : `label` + `isVariable`, **pas** de `code` — généré côté serveur par slugification)
   - `CategoryPatchSchema = z.object({ label: CategoryLabelSchema }).strict()` (`label` uniquement modifiable ; `code` et `isVariable` immuables)

3. **Given** `GET /api/categories` (étendu — l'endpoint existe déjà story 2.10),
   **When** appelé,
   **Then** la réponse inclut **un compteur `referenceCount`** par catégorie, calculé via une **requête agrégée unique** (idéalement un `LEFT JOIN` ou `WITH` CTE qui somme depuis `transactions.category_code`, `fixed_charges.category_code` (story 5.1) et `monthly_overrides.category_code` (story 7.2 — si pas encore créée, `0`). Tri identique à l'existant (variables d'abord, alpha).

4. **Given** `POST /api/categories`,
   **When** je poste `{ label: 'Carburant', isVariable: true }` (Zod `NewCategoryInputSchema`),
   **Then** :
   - le service génère le `code` automatiquement par slugification (`label.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')` → `carburant`)
   - en cas de collision (`carburant` existe déjà), suffixage `-2`, `-3`, etc. (chercher le plus petit suffixe libre)
   - validation : `label` invalide → 422 `validation_failed` ; `code` final invalide ou vide après slugification → 422 (cas extrême : `label = '!!!'` → code vide → reject)
   - retour 201 avec la catégorie complète (`code`, `label`, `isVariable`, `referenceCount: 0`)

5. **Given** `PATCH /api/categories/[code]`,
   **When** je patch `{ label: 'Bouffe' }` sur `restos`,
   **Then** seul le `label` est mis à jour. Le `code` et `isVariable` restent intacts (FK transactions/charges/overrides préservés). Tentative de body avec `code` ou `isVariable` → Zod `.strict()` → 422 `validation_failed`. Catégorie introuvable → 404 `not_found`.

6. **Given** `DELETE /api/categories/[code]`,
   **When** je supprime `restos` et qu'**aucune référence n'existe**,
   **Then** la ligne est supprimée → 204. Catégorie introuvable → 404.

7. **Given** une catégorie `restos` référencée par ≥ 1 transaction, charge fixe ou override,
   **When** je tente `DELETE /api/categories/restos`,
   **Then** l'endpoint retourne **409 `category_in_use`** + `data: { transactionCount, fixedChargeCount, monthlyOverrideCount }`. Aucune mutation effectuée. Le pattern d'erreur réutilise `domainError(ApiErrorCode.CategoryInUse, ...)` (cf. nouveau code à ajouter, voir Task).

8. **Given** la catégorie spéciale `divers` (utilisée comme fallback par `accept_gap` story 3.1, et par le `llm-categorizer` quand le LLM renvoie une catégorie inconnue),
   **When** je tente `DELETE /api/categories/divers`,
   **Then** l'endpoint retourne **409 `category_protected`** + `data: { code: 'divers', reason: 'used_as_fallback' }`, indépendamment du `referenceCount`. Le rename via PATCH reste autorisé (l'identifiant `code` est ce qui compte, pas le label).

9. **Given** la page `app/pages/categories.vue`,
   **When** elle se charge,
   **Then** elle affiche :
   - `CategoryList` (tableau : libellé éditable inline, type variable/fixe en badge, `referenceCount` en compteur, bouton **Supprimer** désactivé+grisé si `referenceCount > 0` OU `code === 'divers'` ; tooltip explique la raison du blocage)
   - `CategoryForm` (ajout : `label` + select variable/fixe + bouton *Ajouter*)
   - **Confirm dialog** réutilisé (`ConfirmDialog` story 3.2) pour la suppression

10. **Given** la liste de catégories utilisée par `categorizeStatement()` dans `server/services/llm-categorizer.ts` (story 2.4),
    **When** un PDF est ingéré après création d'une nouvelle catégorie,
    **Then** la liste passée au LLM est **lue depuis `db.select().from(categoryDefinitions)`** (et non depuis `DEFAULT_CATEGORIES` en dur). `DEFAULT_CATEGORIES` (`shared/constants/default-categories.ts`) ne sert plus que pour le seed initial bootstrap.
    
    **⚠️ Refactor non-trivial** : `llm-categorizer.ts` charge actuellement `DEFAULT_CATEGORIES` à la construction du prompt. Cette story modifie la signature pour accepter `categories: ReadonlyArray<CategoryDefinition>` injecté par l'orchestrator (`statement-ingestion-orchestrator.ts`) qui le lit depuis la DB. Tests `llm-categorizer.test.ts` à mettre à jour.

11. **Given** un test unitaire,
    **When** il s'exécute,
    **Then** il couvre :
    - POST `{ label: 'Carburant', isVariable: true }` → code `carburant`, ref count 0
    - POST avec collision (`carburant` existe) → code `carburant-2`
    - POST `{ label: 'Café & Co', isVariable: true }` → code `cafe-co` (accents stripped, char spéciaux → `-`)
    - POST `{ label: '!!!' }` → 422 (code vide après slugification)
    - GET → liste avec `referenceCount` correct (seeder 2 transactions sur `courses`, vérifier `referenceCount: 2`)
    - PATCH label → ok
    - PATCH avec `code` ou `isVariable` → 422 `validation_failed` (`.strict()`)
    - DELETE catégorie sans réf → 204
    - DELETE catégorie avec réf → 409 `category_in_use` + counts
    - DELETE `divers` → 409 `category_protected`
    - DELETE catégorie inexistante → 404

12. **Given** un test E2E,
    **When** il s'exécute,
    **Then** il couvre (pas de dépendance LLM) : ouvrir `/categories` → ajouter `Carburant` (variable) → vérifier dans `CategoryList` → renommer en `Essence` via édition inline → vérifier persistance → supprimer (référenceCount 0) → vérifier disparition. Plus : tenter de supprimer `divers` → bouton désactivé, tooltip *« Catégorie système, ne peut pas être supprimée »*.

13. **Given** un test E2E supplémentaire avec ingestion (skip auto si `!FIXTURE` ou `!ANTHROPIC_API_KEY`),
    **When** il s'exécute,
    **Then** : créer catégorie `Carburant` via `/categories` → ingérer un PDF de fixture → ouvrir `/transactions/{period}` → vérifier que `Carburant` apparaît bien dans le `CategoryEditor` (story 2.10) — confirme AC#10 que le LLM lit la DB.

14. **Given** un nouveau code d'erreur,
    **When** introduit,
    **Then** `ApiErrorCode.CategoryInUse` et `ApiErrorCode.CategoryProtected` sont ajoutés à `shared/schemas/api-errors.ts` ET mappés en FR dans `app/composables/useApiError.ts` (FR : *« Catégorie utilisée par X transactions, Y charges fixes — supprimez les références d'abord. »* ; *« Catégorie système, ne peut pas être supprimée. »*).

## Tasks / Subtasks

- [ ] **Task 1 — Codes d'erreur** (AC: #14)
  - [ ] Ajouter `CategoryInUse = 'category_in_use'` et `CategoryProtected = 'category_protected'` à `shared/schemas/api-errors.ts`
  - [ ] Mapper en FR dans `app/composables/useApiError.ts`
  - [ ] Mettre à jour `useApiError.test.ts` si pertinent

- [ ] **Task 2 — Schéma Zod** (AC: #2)
  - [ ] `shared/schemas/category.schema.ts`
  - [ ] Helper `slugifyCategoryLabel(label: string): string` dans le même fichier (côté shared, réutilisable)

- [ ] **Task 3 — Endpoint GET étendu avec `referenceCount`** (AC: #3)
  - [ ] Modifier `server/api/categories.get.ts` (existant story 2.10) pour ajouter le compteur via une requête CTE/JOIN agrégée unique
  - [ ] **Précaution** : `monthly_overrides` n'existe pas encore (story 7.2). Inclure conditionnellement (try/catch propre OU compter à 0 tant que la table n'existe pas — via `EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='monthly_overrides')`). À ré-évaluer en story 7.2.
  - [ ] Mettre à jour le composable `useCategories` si la shape change (peut casser story 2.10's `CategoryEditor` — vérifier rétrocompatibilité)
  - [ ] Mettre à jour `categories.get.test.ts` existant

- [ ] **Task 4 — Endpoint POST** (AC: #4, #11)
  - [ ] `server/api/categories/index.post.ts` (créer ce dossier — l'endpoint existant `categories.get.ts` est en racine ; alternative : `server/api/categories.post.ts` pour rester cohérent ; **décision** : restructurer en `server/api/categories/index.{get,post}.ts` + `[code].{patch,delete}.ts` pour grouper)
  - [ ] Logique slugification + collision suffixage
  - [ ] Tests unitaires

- [ ] **Task 5 — Endpoints PATCH + DELETE** (AC: #5, #6, #7, #8, #11)
  - [ ] `server/api/categories/[code].patch.ts`
  - [ ] `server/api/categories/[code].delete.ts`
  - [ ] Constante `PROTECTED_CATEGORY_CODES = new Set(['divers'])` partagée (même fichier ou `fiscal-defaults`-style)
  - [ ] Pré-check référence (3 requêtes COUNT sur transactions/fixed_charges/monthly_overrides) → 409
  - [ ] Tests unitaires

- [ ] **Task 6 — Refactor `llm-categorizer.ts`** (AC: #10)
  - [ ] Modifier la signature de `categorizeStatement` pour accepter `categories: ReadonlyArray<{ code: string, label: string, isVariable: boolean }>`
  - [ ] Mettre à jour l'orchestrator `statement-ingestion-orchestrator.ts` pour lire `categoryDefinitions` depuis la DB et passer la liste
  - [ ] `DEFAULT_CATEGORIES` ne reste utilisé que par le bootstrap seed
  - [ ] Mettre à jour `llm-categorizer.test.ts` (tests existants doivent passer en injectant les categories)

- [ ] **Task 7 — Composable** (AC: #9)
  - [ ] Étendre `useCategories` (composable existant) pour exposer aussi `addCategory`, `updateCategory`, `deleteCategory` (avec invalidations) — OU créer un `useCategoryAdmin` séparé pour la page `/categories` et garder `useCategories` read-only

- [ ] **Task 8 — UI** (AC: #9)
  - [ ] `app/components/categories/CategoryList.vue`
  - [ ] `app/components/categories/CategoryForm.vue`
  - [ ] `app/pages/categories.vue`
  - [ ] Réutiliser `ConfirmDialog`
  - [ ] Lien `/categories` dans `AppNav.vue`

- [ ] **Task 9 — E2E** (AC: #12, #13)
  - [ ] `tests/e2e/categories.spec.ts`

- [ ] **Task 10 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run`, `yarn test:e2e` verts
  - [ ] Audit : `grep -r 'DEFAULT_CATEGORIES' server/services/` retourne uniquement le bootstrap, pas le LLM
  - [ ] Mapping FR des 2 nouveaux codes d'erreur OK (manual check)
  - [ ] Commit unique

## Dev Notes

### Pourquoi le `code` est immuable

Les FK `transactions.category_code`, `fixed_charges.category_code`, `monthly_overrides.category_code` pointent sur `category_definitions.code`. Modifier le `code` casserait l'intégrité référentielle. Renommage = changer `label` (libellé d'affichage). Le `code` est l'**identifiant stable** ; le `label` est la **présentation**.

Si l'utilisateur veut "Bouffe" au lieu de "Restos" : PATCH `{ label: 'Bouffe' }` sur `code: 'restos'`. L'identifiant interne `restos` reste, l'UI affiche `Bouffe`.

### Pourquoi `divers` est protégée

`divers` est utilisée comme fallback par :
- `accept_gap` (story 3.1) qui insère une transaction `categoryCode: 'divers'`
- `llm-categorizer` (story 2.4) quand le LLM renvoie une catégorie hors-liste

La supprimer casserait ces flows. Le rename est OK (l'identifiant ne change pas).

### Slugification — règles V1

```
'Carburant'             → 'carburant'
'Café & Co'             → 'cafe-co'
'Frais bancaires'       → 'frais-bancaires'
'  multi   spaces  '    → 'multi-spaces'
'!!!'                   → ''  → REJECT 422
'Carburant' (collision) → 'carburant-2'
'café'                  → 'cafe'  (NFD strip diacritics)
```

Algo :
1. NFD normalize + strip diacritics
2. lowercase
3. `[^a-z0-9]+` → `-`
4. trim leading/trailing `-`
5. si vide → 422
6. si collision : suffix `-2`, `-3`, etc. (boucle DB)

Limiter `length` à 32 (cf. AC#2).

### Migration LLM — risque

`llm-categorizer.ts` est central. Le refactor (AC#10) change sa signature. Risque : casser story 2.4 + 2.6 (orchestrator). **Mitigation** :
1. Faire le refactor avec injection (signature change `categorizeStatement(transactions, categories)`)
2. Tests `llm-categorizer.test.ts` mis à jour pour passer la fixture de categories
3. Tests `statement-ingestion-orchestrator.test.ts` mis à jour pour seeder `category_definitions` avant l'appel
4. Un commit unique pour minimiser le scope du diff

### `referenceCount` — performance

Une requête agrégée unique :
```sql
SELECT cd.code, cd.label, cd.is_variable,
       COALESCE(t.cnt, 0) + COALESCE(f.cnt, 0) + COALESCE(m.cnt, 0) AS reference_count
FROM category_definitions cd
LEFT JOIN (SELECT category_code, COUNT(*) cnt FROM transactions GROUP BY category_code) t ON t.category_code = cd.code
LEFT JOIN (SELECT category_code, COUNT(*) cnt FROM fixed_charges GROUP BY category_code) f ON f.category_code = cd.code
LEFT JOIN (SELECT category_code, COUNT(*) cnt FROM monthly_overrides GROUP BY category_code) m ON m.category_code = cd.code
ORDER BY cd.is_variable DESC, cd.label ASC;
```

Drizzle équivalent : 3 sub-queries via `db.select(...).from(...).groupBy(...).as(...)` puis `leftJoin`. Si trop verbeux, faire 4 requêtes simples (1 catégories + 3 counts en map) — KISS V1.

### Anti-patterns à éviter

- ❌ Permettre la modification du `code` via PATCH
- ❌ Supprimer `divers` (cas test explicite AC#8)
- ❌ Supprimer une catégorie référencée sans 409 explicite (le silent succès corromprait des FK)
- ❌ Continuer à passer `DEFAULT_CATEGORIES` au LLM après cette story (audit explicite Task 10)
- ❌ Cacher la liste catégories au LLM côté serveur (lecture DB à chaque ingestion — invalidation auto via la nature stateless du LLM)

### Project Structure Notes

Cette story modifie/crée :
- `shared/schemas/api-errors.ts` (2 nouveaux codes)
- `app/composables/useApiError.ts` (2 nouveaux mappings)
- `shared/schemas/category.schema.ts` (NEW)
- `server/api/categories/` (restructure + 3 endpoints)
- `server/services/llm-categorizer.ts` (signature change — REFACTOR)
- `server/services/statement-ingestion-orchestrator.ts` (passe les categories au LLM)
- 2 composants + 1 page

### Definition of Done

- [ ] CRUD complet endpoints
- [ ] `referenceCount` correctement calculé
- [ ] Catégories protégées (`divers`)
- [ ] Refactor LLM : DB-driven (pas DEFAULT_CATEGORIES)
- [ ] 2 nouveaux codes d'erreur mappés FR
- [ ] Tests unit + E2E (incl. test ingestion)
- [ ] Lien navigation `/categories`
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR55-FR57]
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 5.6]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure (categories)]
- [Source: `CLAUDE.md`#Format API normalisé] — codes d'erreur stables, message FR centralisé
- [Source: `server/db/schema.ts:24-30`] — table `category_definitions` (existante)
- [Source: `server/api/categories.get.ts`] — endpoint à étendre
- [Source: `server/services/llm-categorizer.ts`] — refactor cible (signature + injection)
- [Source: `shared/constants/default-categories.ts`] — bornes après refactor (seed only)
- [Source: `app/components/shared/ConfirmDialog.vue`] — réutilisable
- [Stories précédentes : `2-1` (schéma DB), `2-4` (LLM categorizer), `2-10` (CategoryEditor) ; `3-1` (`divers` fallback usage) ; `5-1` (fixed_charges FK)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

### Review Findings
