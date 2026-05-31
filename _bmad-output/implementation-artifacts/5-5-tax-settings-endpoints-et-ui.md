# Story 5.5: Schéma `tax_settings` + endpoints + UI (flat tax, mode imposition)

Status: ready-for-dev

## Story

As a user,
I want to configure how dividends are taxed (flat tax PFU vs. progressive IR option),
so that the forecast (Epic 7) can compute net amounts correctly from the gross dividend.

## Acceptance Criteria

1. **Given** la table `tax_settings` (singleton — une seule ligne `id=1`) ajoutée au schéma Drizzle,
   **When** je `yarn db:push`,
   **Then** elle existe avec :
   - `id INTEGER PRIMARY KEY` (toujours = 1)
   - `dividend_tax_rate_pct INTEGER NOT NULL DEFAULT 3000` (en pct × 100 ; `3000` = 30 % flat tax)
   - `dividend_tax_mode TEXT NOT NULL DEFAULT 'flat_tax' CHECK(dividend_tax_mode IN ('flat_tax','progressive'))`
   - `updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))`

2. **Given** le bootstrap (extension story 1.5/5.3/5.4),
   **When** la DB est ouverte au premier lancement,
   **Then** la ligne `id=1` est seedée avec `dividend_tax_rate_pct: 3000, dividend_tax_mode: 'flat_tax'` (`INSERT OR IGNORE`). Étendre `0.bootstrap.ts` à la suite du seed `sas_config`.

3. **Given** le fichier `shared/constants/fiscal-defaults.ts`,
   **When** il est créé,
   **Then** il exporte les défauts utilisables comme valeurs initiales et fallback :
   ```ts
   export const FLAT_TAX_DEFAULT_PCT = 3000        // 30 %
   export const IS_RATE_REDUCED = 1500             // 15 %
   export const IS_RATE_NORMAL = 2500              // 25 %
   export const IS_REDUCED_THRESHOLD_CENTS = 4_250_000  // 42 500 €
   export const DIVIDEND_TAX_MODES = ['flat_tax', 'progressive'] as const
   export type DividendTaxMode = typeof DIVIDEND_TAX_MODES[number]
   ```
   Ces constantes sont **lues** par les calculs (story 5.4 + 7.x) quand la DB n'est pas encore peuplée OU comme valeurs de référence ; les valeurs réelles viennent de `tax_settings` et `sas_config` (cf. CLAUDE.md `Taux fiscaux paramétrables`).

4. **Given** un schéma Zod `shared/schemas/tax-settings.schema.ts`,
   **When** exposé,
   **Then** il définit :
   - `TaxSettingsSchema` (lecture)
   - `TaxSettingsPatchSchema` (`.strict()`, partiel)
   - `dividendTaxRatePct: z.number().int().min(0).max(10000)`
   - `dividendTaxMode: z.enum(DIVIDEND_TAX_MODES)` (importé depuis `fiscal-defaults.ts`)

5. **Given** `GET /api/tax-settings` et `PUT /api/tax-settings`,
   **When** appelés,
   **Then** ils respectent le pattern singleton (cohérent stories 5.3/5.4). PUT applique un patch partiel.

6. **Given** la page `app/pages/parametres.vue`,
   **When** elle se charge,
   **Then** elle affiche `TaxSettingsForm` :
   - **Slider OU input number** pour `dividendTaxRatePct` : range `0-10000`, step `100` (= 1 %), affichage `30,00 %` (formaté `value / 100` avec 2 décimales — V1 simple, peut être un input number `0-100` pas pct×100 si plus ergonomique → faire la conversion à la soumission)
   - **Select** pour `dividendTaxMode` : 2 options `flat_tax` (libellé FR *« Flat tax PFU (30 %) »*) et `progressive` (libellé FR *« Barème progressif IR »*)
   - **Note FR** sous le select : *« Le mode "barème progressif" est déclaratif en V1 : aucune simulation détaillée n'est appliquée. »* (FR36)
   - Bouton *Enregistrer* unique pour les 2 champs

7. **Given** la note FR36 (mode déclaratif),
   **When** le mode `progressive` est sélectionné,
   **Then** **aucune** logique métier ne change V1. Le forecast (story 7.x) lit le mode mais applique uniquement le taux `dividendTaxRatePct` pour le calcul NET → BRUT. Les implications d'imposition réelle au barème (impôt sur le revenu progressif, abattement 40 %, etc.) sont **hors scope V1** — assumé. UI marqué *« Déclaratif »*.

8. **Given** le composable `useTaxSettings()`,
   **When** utilisé,
   **Then** il expose `{ data, pending, error, refresh, update(patch) }` (pattern stories 5.3/5.4). Mutation invalide forecast + dashboard.

9. **Given** un test unitaire,
   **When** il s'exécute,
   **Then** il couvre :
   - GET sur DB fraîche (post-seed) → singleton avec `dividendTaxRatePct: 3000`, `dividendTaxMode: 'flat_tax'`
   - PUT `{ dividendTaxRatePct: 1700 }` → met à jour, `updated_at` régénéré
   - PUT `{ dividendTaxMode: 'invalid' }` → 422 `validation_failed`
   - PUT `{ dividendTaxRatePct: 12000 }` → 422 (max 10000)
   - PUT body vide → 422

10. **Given** un test E2E,
    **When** il s'exécute,
    **Then** ouvrir `/parametres` → vérifier valeurs par défaut (30 %, flat tax) → changer pour 17 %, mode progressif → Enregistrer → reload → vérifier persistance.

11. **Given** les conventions CLAUDE.md,
    **When** la story est review,
    **Then** :
    - **Aucun** taux fiscal hardcodé dans un calcul (utiliser `tax_settings` ou `fiscal-defaults.ts`)
    - Aucune nouvelle erreur (réutiliser `validation_failed`, `not_found`)
    - Pinia exclu pour data serveur

## Tasks / Subtasks

- [ ] **Task 1 — Constantes fiscales** (AC: #3)
  - [ ] Créer `shared/constants/fiscal-defaults.ts`
  - [ ] Pas de logique, juste des `export const`. Test minimal de présence (ou skip — c'est un fichier de constantes)

- [ ] **Task 2 — Schéma DB + bootstrap seed** (AC: #1, #2)
  - [ ] Ajouter `taxSettings` à `server/db/schema.ts`
  - [ ] Étendre `0.bootstrap.ts`
  - [ ] `yarn db:push`

- [ ] **Task 3 — Schéma Zod** (AC: #4)
  - [ ] `shared/schemas/tax-settings.schema.ts`

- [ ] **Task 4 — Endpoints** (AC: #5)
  - [ ] `server/api/tax-settings.get.ts`
  - [ ] `server/api/tax-settings.put.ts`
  - [ ] Tests unitaires (AC#9)

- [ ] **Task 5 — Composable** (AC: #8)
  - [ ] `app/composables/useTaxSettings.ts`

- [ ] **Task 6 — UI** (AC: #6, #7)
  - [ ] `app/components/parametres/TaxSettingsForm.vue`
  - [ ] `app/pages/parametres.vue`
  - [ ] Lien `/parametres` dans `AppNav.vue`

- [ ] **Task 7 — E2E** (AC: #10)
  - [ ] `tests/e2e/parametres.spec.ts`

- [ ] **Task 8 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run`, `yarn test:e2e` verts
  - [ ] **Audit** : grep que aucun `30` / `0.30` / `0.3` n'apparaît dans le code de calcul (forecast/dividend) — `FLAT_TAX_DEFAULT_PCT` ou lecture DB uniquement
  - [ ] Aucun nouveau code d'erreur
  - [ ] Commit unique

## Dev Notes

### Pourquoi `pct × 100` (entier) plutôt que float

Cohérent avec `sas_config.is_rate_pct` (story 5.4). Évite les floats en DB et les drift FP. La conversion vers float (0.30) se fait dans la fonction de calcul juste avant la multiplication.

### Pourquoi seeder `flat_tax 30 %` par défaut

C'est la convention française pour un dirigeant non-investisseur en V1 (le PRD cible "freelance/dirigeant SAS, mono-utilisateur Marceau" — flat tax 30 % par défaut). L'utilisateur peut modifier via UI. C'est un choix de "default raisonnable", pas une règle.

### Pourquoi `progressive` est déclaratif V1

Implémenter le barème IR progressif réel exigerait :
- Tranches actuelles (0 / 11 / 30 / 41 / 45 %)
- Quotient familial (parts)
- Abattement 40 % sur dividendes
- Articulation avec autres revenus du foyer
- Mise à jour annuelle des seuils

Hors scope V1 (le PRD cible un outil personnel mono-user qui produit une projection ROUGH, pas une déclaration fiscale). Le mode existe pour permettre à l'utilisateur de **basculer en V2** sans migration de schéma.

### `fiscal-defaults.ts` — constantes vs DB

CLAUDE.md §Taux fiscaux paramétrables : *« table `tax_settings` + `shared/constants/fiscal-defaults.ts`. Jamais en dur dans une fonction de calcul. »*

Architecture (`fiscal-defaults.ts`) :
- **Default** au premier seed (lu pour `INSERT OR IGNORE` dans bootstrap)
- **Fallback** si la table est vide (cas de test exotique)
- **Source de vérité** pour `IS_REDUCED_THRESHOLD_CENTS` (constante non éditable utilisateur — c'est la loi française)

Les calculs (story 5.4 `dividend-capacity.ts`, story 7.4 `dividend-calculator.ts`) lisent **toujours** la DB (via le service appelant), avec fallback sur les constantes en cas d'absence.

### Anti-patterns à éviter

- ❌ Hardcoder `30` ou `0.3` dans une fonction de calcul (utiliser `tax_settings.dividend_tax_rate_pct` ou `FLAT_TAX_DEFAULT_PCT`)
- ❌ Implémenter la simulation IR progressive (hors scope V1, FR36 explicite)
- ❌ Recompute "live" depuis l'UI (pas de calcul dérivé V1 — l'utilisateur ne voit que les valeurs déclaratives)
- ❌ Pinia
- ❌ Composant qui appelle `$fetch` direct

### Project Structure Notes

Cette story crée :
- `shared/constants/fiscal-defaults.ts` (listé `architecture.md:631`)
- Mutation schema (`tax_settings`) + seed bootstrap
- `shared/schemas/tax-settings.schema.ts`
- 2 endpoints (`tax-settings.get.ts`, `tax-settings.put.ts`)
- 1 composable
- 1 composant + 1 page

### Definition of Done

- [ ] Constantes exposées + utilisées par seed
- [ ] Schéma DB + seed flat tax 30 %
- [ ] GET/PUT opérationnels
- [ ] UI fonctionnelle, mode "déclaratif" annoté
- [ ] Tests verts
- [ ] Lien navigation `/parametres`
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR35-FR36]
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 5.5]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure (631), Cross-cutting (699, 825)]
- [Source: `CLAUDE.md`#Taux fiscaux paramétrables] — règle non-négociable
- [Stories précédentes : `5-3` (singleton pattern), `5-4` (pct × 100 cohérence)]
- [Story aval : `7-4-dividend-calculator-required-dividend` — calcul NET → BRUT consomme `dividend_tax_rate_pct`]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

### Review Findings
