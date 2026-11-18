# Story 7.2: Table `monthly_overrides` + endpoints (FR44)

Status: done

## Story

As a user,
I want to override the projected amount of a variable category for a specific future month,
so that the forecast uses my manual value instead of the moving average for that month × category (FR44).

## Acceptance Criteria

1. **Given** la table `monthly_overrides` (schéma Drizzle),
   **When** `yarn db:push`,
   **Then** elle existe avec : `id` PK autoincrement ; `month TEXT NOT NULL` (`YYYY-MM`) ; `category_code TEXT NOT NULL` → FK `category_definitions.code` (ON DELETE RESTRICT) ; `amount_cents INTEGER NOT NULL` (≥ 0) ; `created_at` ; **UNIQUE(month, category_code)** (un override par mois × catégorie).

2. **Given** `shared/schemas/monthly-override.schema.ts`,
   **Then** : `MonthSchema` (`/^\d{4}-(0[1-9]|1[0-2])$/`) ; `NewMonthlyOverrideSchema` (`month`, `categoryCode`, `amountCents ≥ 0`, `.strict()`) ; `MonthlyOverrideSchema` (lecture + `id`/`createdAt`).

3. **Given** `POST /api/overrides`,
   **When** un override valide est posté,
   **Then** **upsert** sur `(month, category_code)` : crée ou remplace l'`amount_cents`. La catégorie doit exister ET être **variable** (`is_variable = 1`) → sinon 422 `validation_failed` (un override n'a de sens que pour une catégorie projetée). Retour 201 avec la ligne.

4. **Given** `GET /api/overrides`,
   **Then** retourne la liste des overrides (triés `month`, `category_code`). Query optionnelle `?month=YYYY-MM` filtre sur un mois.

5. **Given** `DELETE /api/overrides/[id]`,
   **Then** supprime l'override → 204 (revient à la projection). `id` inexistant → 404 ; `id` non entier → 422.

6. **Given** le shim `server/utils/monthly-overrides.ts` (créé en 5.6 comme temporaire),
   **When** la table existe désormais,
   **Then** il est **supprimé** ; `categories/index.get.ts` et `categories/[code].delete.ts` comptent les overrides via une requête Drizzle directe sur `monthlyOverrides`. Le DDL de `categories/categories.test.ts` gagne la table `monthly_overrides` (les tests restent verts) + un cas « referenceCount inclut un override ».

7. **Given** des tests unitaires,
   **Then** : POST crée (201) ; POST re-posté même (month, cat) → remplace (upsert, pas de doublon) ; POST catégorie fixe → 422 ; POST catégorie inconnue → 422 ; POST `month` invalide → 422 ; GET liste + filtre `?month` ; DELETE → 204 ; DELETE inexistant → 404.

8. **Given** CLAUDE.md,
   **Then** : `Cents` (colonne `_cents`, champ `amountCents`) ; erreurs via helpers ; pas de nouveau code d'erreur (réutilise `validation_failed`, `not_found`).

## Tasks / Subtasks

- [x] **Task 1 — Schéma DB** (AC: #1) — `monthlyOverrides` + `uniqueIndex(month, category_code)` + push (drift préexistant sans impact, cf. mémoire)
- [x] **Task 2 — Zod** (AC: #2) — `monthly-override.schema.ts` (+ `OverrideListQuerySchema`)
- [x] **Task 3 — Endpoints** (AC: #3-#5) — `overrides/index.{get,post}.ts` (upsert + check variable), `[id].delete.ts`
- [x] **Task 4 — Retrait shim** (AC: #6) — `monthly-overrides.ts` supprimé ; endpoints catégories lisent `monthlyOverrides` en direct ; DDL test + cas referenceCount override
- [x] **Task 5 — Tests** (AC: #7) — `overrides/crud.test.ts` (12 cas)
- [x] **Task 6 — Sanity** — typecheck/lint/test (343) verts

## Dev Notes

### Upsert plutôt que 409
Poser un override est idempotent côté intention (« pour ce mois × catégorie, la valeur est X »). `onConflictDoUpdate` sur `(month, category_code)` évite un 409 et un GET+PUT côté client.

### Catégorie variable uniquement
Un override remplace la **projection** (moyenne mobile 7.1), qui n'existe que pour les catégories variables. Overrider une catégorie fixe n'a pas de sens (déclarée en `fixed_charges`). → 422.

### Mois « futur »
FR44 parle de mois futur, mais on ne borne pas à `> mois courant` au write (évite le couplage `Date`, et le cas mois courant). Le `forecast-engine` (7.3) applique les overrides aux mois qu'il projette.

### Retrait du shim (dette technique 5.6)
`monthlyOverridesTableExists()` était un shim explicitement temporaire. La table existant, on lit `monthlyOverrides` directement (Drizzle) dans les 2 endpoints catégories, et on ajoute la table au DDL de leur test.

### Hors scope
- UI `VariableOverrideDialog` → story 7.7.
- Application au forecast → story 7.3/7.5.

### References
- [Source: prd.md#FR44]
- [Source: architecture.md:303, 582-584, 623] — table, endpoints `overrides/*`, schéma
- [Source: `server/utils/monthly-overrides.ts`] — shim à retirer
- [Source: `server/api/fixed-charges/`] — patron CRUD ; [Source: `server/utils/category-fk.ts`]
- [Stories : `7-1` (projection overridée), `7-3` (application au forecast), `7-7` (UI)]

## Dev Agent Record

### Agent Model Used

Agent de développement.

### Completion Notes List

- Table `monthly_overrides` (UNIQUE month×catégorie, FK RESTRICT). POST = upsert (`onConflictDoUpdate`), catégorie variable requise → 422 sinon. GET liste + filtre `?month`. DELETE 204/404.
- Dette technique 5.6 résorbée : shim `monthlyOverridesTableExists` supprimé, `categories/index.get` + `[code].delete` comptent les overrides via `monthlyOverrides` (Drizzle), DDL du test catégories complété + cas referenceCount override.
- Aucun nouveau code d'erreur.
- 343 tests verts (12 overrides + 1 catégories).

### File List

- `server/db/schema.ts` (modifié — `monthlyOverrides` + import `uniqueIndex`)
- `shared/schemas/monthly-override.schema.ts` (nouveau)
- `server/api/overrides/index.get.ts` (nouveau)
- `server/api/overrides/index.post.ts` (nouveau)
- `server/api/overrides/[id].delete.ts` (nouveau)
- `server/api/overrides/crud.test.ts` (nouveau)
- `server/utils/monthly-overrides.ts` (supprimé — shim)
- `server/api/categories/index.get.ts` (modifié — count direct)
- `server/api/categories/[code].delete.ts` (modifié — count direct)
- `server/api/categories/categories.test.ts` (modifié — DDL + cas override)

### Change Log

- 2026-07-09 : Implémentation story 7.2 — table + endpoints `monthly_overrides` (FR44), retrait du shim. Status → review.

### Review Findings

Code review du 2026-07-19 (Blind Hunter + Edge Case Hunter + Acceptance Auditor).

- [x] [Review][Patch] **`CHECK amount_cents >= 0` absent au niveau DB** — AC1 spécifie `amount_cents INTEGER NOT NULL (≥ 0)` ; le plancher n'était garanti que par Zod, un insert hors endpoint pouvait écrire un négatif. Contrainte `check` ajoutée. ⚠️ Nécessite `yarn db:push` pour s'appliquer à la base de dev. [server/db/schema.ts]
- [x] [Review][Patch] Test AC5 manquant : `DELETE /api/overrides/[id]` avec `id` non entier positif (`abc`, `1.5`, `0`, `-3`) → 422. [server/api/overrides/crud.test.ts]
- [x] [Review][Patch] Test manquant : suppression d'une catégorie dont la **seule** référence est un `monthly_overrides` → 409 `category_in_use` avec `monthlyOverrideCount: 1` (couvre le nouveau chemin `refCount(monthlyOverrides, code)`). [server/api/categories/categories.test.ts]
