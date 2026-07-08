# Story 5.6: Gestion des catégories — endpoints CRUD + UI `/categories`

Status: review

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

- [x] **Task 1 — Codes d'erreur** (AC: #14)
  - [x] Ajouter `CategoryInUse` et `CategoryProtected` à `shared/schemas/api-errors.ts`
  - [x] Mapper en FR dans `app/composables/useApiError.ts`
  - [x] `useApiError.test.ts` : le test « couvre tous les codes » valide automatiquement les 2 nouveaux

- [x] **Task 2 — Schéma Zod** (AC: #2)
  - [x] `shared/schemas/category.schema.ts` + helper `slugifyCategoryLabel`

- [x] **Task 3 — Endpoint GET étendu avec `referenceCount`** (AC: #3)
  - [x] `server/api/categories/index.get.ts` — compteur agrégé (transactions + fixed_charges + overrides)
  - [x] `monthly_overrides` inclus conditionnellement via `sqlite_master` (table absente avant 7.2 → 0)
  - [x] `useCategories` : shape additive (`referenceCount`), rétrocompatible `CategoryEditor`
  - [x] Ancien `categories.get.test.ts` remplacé par `categories/categories.test.ts`

- [x] **Task 4 — Endpoint POST** (AC: #4, #11)
  - [x] `server/api/categories/index.post.ts` — slugification + collision suffixage `-2`/`-3`
  - [x] Tests unitaires

- [x] **Task 5 — Endpoints PATCH + DELETE** (AC: #5, #6, #7, #8, #11)
  - [x] `[code].patch.ts` + `[code].delete.ts`
  - [x] `shared/constants/protected-categories.ts` (`PROTECTED_CATEGORY_CODES = {'divers'}`)
  - [x] Pré-check référence (transactions/fixed_charges/monthly_overrides) → 409
  - [x] Tests unitaires

- [x] **Task 6 — Refactor `llm-categorizer.ts`** (AC: #10)
  - [x] Signature `categorizeStatement` acceptait déjà `availableCategories` (injection) — aucun changement de signature nécessaire
  - [x] Orchestrator lit `categoryDefinitions` depuis la DB et passe la liste (fin de `DEFAULT_CATEGORIES` en prod)
  - [x] `DEFAULT_CATEGORIES` réservé au seed bootstrap
  - [x] Tests `llm-categorizer.test.ts` / orchestrator inchangés et verts (fixture / mock)

- [x] **Task 7 — Composable** (AC: #9)
  - [x] `useCategoryAdmin` (create/rename/delete + invalidations) ; `useCategories` reste read-only, `key` 'categories' partagée

- [x] **Task 8 — UI** (AC: #9)
  - [x] `CategoryList.vue` (édition inline, badge, referenceCount, delete bloqué + tooltip)
  - [x] `CategoryForm.vue` + `app/pages/categories.vue` + `ConfirmDialog` réutilisé
  - [x] Lien `/categories` dans `AppNav.vue`

- [x] **Task 9 — E2E** (AC: #12, #13)
  - [x] `tests/e2e/categories.spec.ts` (idempotent) + `categories-ingestion.spec.ts` (auto-skip sans fixture/clé)

- [x] **Task 10 — Sanity check final**
  - [x] `typecheck`, `lint`, `test:run` (283) verts ; `test:e2e categories` OK chromium (firefox non installé — hors env)
  - [x] Audit : `DEFAULT_CATEGORIES` absent du LLM/orchestrator prod (seed bootstrap + fixture test uniquement)
  - [x] Mapping FR des 2 nouveaux codes OK
  - [x] Commit unique

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

claude-opus-4-8 (dev-story workflow)

### Debug Log References

- Ajout de la route dynamique `/api/categories/:code` → `$fetch` typé de Nuxt dépasse la profondeur d'inférence (TS2321 dans `useFixedCharges`). Contourné par une référence `$fetch` élargie (`unknown`) dans les composables de mutation (`useFixedCharges`, `useCategoryAdmin`).
- E2E `categories` : rendu idempotent (nettoyage `carburant*` au démarrage) — un run précédent avait laissé une ligne renommée non supprimée. Firefox non installé dans l'env (chromium ✓).

### Completion Notes List

- CRUD complet `category_definitions` : GET (+`referenceCount` agrégé), POST (slugification + collision `-2`/`-3`), PATCH (label seul, `code`/`isVariable` immuables), DELETE (204 / 409 in-use / 409 protected / 404).
- Aucune migration DB : réutilise le schéma `category_definitions` (story 2.1).
- `divers` protégée (409 `category_protected`) ; rename autorisé.
- `referenceCount` = transactions + fixed_charges + monthly_overrides (cette dernière conditionnelle via `sqlite_master`, table créée en 7.2).
- Refactor LLM minimal : la signature `categorizeStatement(rawText, availableCategories)` acceptait déjà l'injection ; seul l'orchestrator change (lecture DB au lieu de `DEFAULT_CATEGORIES`).
- Endpoints restructurés en dossier `server/api/categories/` (`index.{get,post}.ts` + `[code].{patch,delete}.ts`) ; ancien `categories.get.ts` supprimé.
- 2 nouveaux codes d'erreur mappés FR ; couverts par le test « tous les codes ».
- 283 tests unitaires verts (14 nouveaux pour les endpoints catégories).

### File List

- `shared/schemas/api-errors.ts` (modifié — `CategoryInUse`, `CategoryProtected`)
- `app/composables/useApiError.ts` (modifié — mappings FR)
- `shared/schemas/category.schema.ts` (nouveau — schémas + `slugifyCategoryLabel`)
- `shared/constants/protected-categories.ts` (nouveau)
- `server/api/categories/index.get.ts` (nouveau — remplace `categories.get.ts`, +`referenceCount`)
- `server/api/categories/index.post.ts` (nouveau)
- `server/api/categories/[code].patch.ts` (nouveau)
- `server/api/categories/[code].delete.ts` (nouveau)
- `server/api/categories/categories.test.ts` (nouveau — 14 cas)
- `server/api/categories.get.ts` (supprimé)
- `server/api/categories.get.test.ts` (supprimé)
- `server/services/statement-ingestion-orchestrator.ts` (modifié — lecture DB des catégories)
- `app/composables/useCategories.ts` (modifié — ré-export type, import path)
- `app/composables/useCategoryAdmin.ts` (nouveau)
- `app/composables/useFixedCharges.ts` (modifié — contournement `$fetch` typé)
- `app/components/categories/CategoryList.vue` (nouveau)
- `app/components/categories/CategoryForm.vue` (nouveau)
- `app/pages/categories.vue` (nouveau)
- `app/components/shared/AppNav.vue` (modifié — lien `/categories`)
- `tests/e2e/categories.spec.ts` (nouveau)
- `tests/e2e/categories-ingestion.spec.ts` (nouveau)

### Change Log

- 2026-07-07 : Implémentation story 5.6 — CRUD catégories (endpoints + slugification + protection `divers` + `referenceCount`), refactor LLM DB-driven, UI `/categories`, 2 codes d'erreur, tests unit + E2E. Status → review.

### Review Findings
