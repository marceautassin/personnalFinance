# Story 5.2: Service `charge-suggester` + endpoint `GET /api/fixed-charges/suggestions` + UI

Status: ready-for-dev

## Story

As a user,
I want suggestions for recurring charges based on my history,
so that I don't have to declare them all manually after importing several months.

## Acceptance Criteria

1. **Given** un service `server/services/charge-suggester.ts`,
   **When** il est créé,
   **Then** il exporte une fonction asynchrone `suggestRecurringCharges(db: Db): Promise<Suggestion[]>` :
   ```ts
   export interface Suggestion {
     normalizedLabel: string         // libellé canonisé (ex: 'netflix')
     sampleLabel: string             // libellé brut le plus fréquent (ex: 'NETFLIX 12.99')
     averageAmountCents: Cents       // moyenne arithmétique signée (négative pour dépense)
     occurrences: number             // nb de mois consécutifs où détecté
     suggestedFrequency: 'monthly' | 'quarterly' | 'annual'
     categoryCode: string            // catégorie majoritaire des transactions matchées (fallback 'divers')
     transactionIds: number[]        // ids des transactions qui ont contribué à la suggestion
   }
   ```

2. **Given** la détection de récurrence,
   **When** elle s'exécute sur `transactions`,
   **Then** elle suit ces règles V1 (KISS, déterministe) :
   - **Normalisation libellé** : lowercase, strip accents (`String.prototype.normalize('NFD').replace(/\p{Diacritic}/gu, '')`), strip digits + montants + dates inline (`/[\d.,€\s\-_]+/g` → ' '), strip mots de < 3 lettres, trim, collapse spaces
   - **Groupement** : par `normalizedLabel` non vide
   - **Critère récurrence** : un groupe est candidat si présent sur ≥ **3 mois calendaires distincts**, dont **les 3 derniers mois ingérés contiennent au moins 1 occurrence chacun** (heuristique "récurrence active") — OU 3 mois consécutifs quelconques avec amplitude `(max - min) / |moyenne| ≤ 0.15` (montants stables à ±15 %)
   - **Fréquence inférée** : `monthly` si 1 occurrence/mois en moyenne ; `quarterly` si présent 1× tous les 3 mois ; `annual` si seulement 1× tous les 12 mois (avec ≥ 2 années → ≥ 2 occurrences). Défaut : `monthly` si ambigu

3. **Given** la catégorie majoritaire,
   **When** plusieurs transactions matchées portent des `category_code` différents,
   **Then** on prend la modale (la plus fréquente). Égalité → ordre alphabétique pour stabilité. Fallback `'divers'` si toutes les transactions sont dans `divers`.

4. **Given** des "rejected suggestions" persistées,
   **When** une suggestion est calculée,
   **Then** elle est exclue si son `normalizedLabel` figure dans une nouvelle table `dismissed_suggestions` (`id`, `normalized_label TEXT UNIQUE`, `created_at`). Cette table est peuplée par `DELETE /api/fixed-charges/suggestions/[normalizedLabel]` (rejet utilisateur).

5. **Given** une suggestion **déjà transformée en `fixed_charges`**,
   **When** une nouvelle suggestion est calculée,
   **Then** elle est exclue si **un `fixed_charges` existe avec le même `normalizedLabel`** (re-normaliser le `label` côté requête). Évite de re-suggérer après acceptation.

6. **Given** `GET /api/fixed-charges/suggestions`,
   **When** appelé,
   **Then** il retourne `{ suggestions: Suggestion[] }` triées par `occurrences` desc puis `|averageAmountCents|` desc.

7. **Given** `DELETE /api/fixed-charges/suggestions/[normalizedLabel]`,
   **When** appelé,
   **Then** il insère/upsert la ligne dans `dismissed_suggestions` (idempotent → 204). Pas de body.

8. **Given** la page `/charges` (story 5.1),
   **When** des suggestions existent,
   **Then** un panneau `SuggestedChargesPanel` est rendu **au-dessus** de `FixedChargeList`, listant chaque suggestion avec :
   - Libellé sample, montant formaté, fréquence FR, occurrences "vu sur N mois"
   - 3 boutons : **Accepter** (POST direct vers `/api/fixed-charges` avec les valeurs suggérées + start_date = mois de la 1ère occurrence), **Modifier** (ouvre `FixedChargeForm` pré-rempli pour ajustement), **Rejeter** (DELETE suggestion → disparait du panneau)

9. **Given** un test unitaire,
   **When** il s'exécute,
   **Then** il couvre la détection sur des transactions de fixture :
   - 3 mois de "NETFLIX 12.99" (libellés bruts variés : `NETFLIX 12.99 EUR`, `Netflix Sub 12,99`, `NETFLIX 12,99`) → 1 suggestion `netflix`, `frequency: 'monthly'`, `averageAmountCents ~= -1299`
   - 2 mois seulement → aucune suggestion (sous le seuil)
   - 3 mois mais montants `-12.99 / -12.99 / -25.99` (amplitude > 15 %) → exclu (ou inclus selon variante)
   - Une suggestion déjà acceptée (`fixed_charges` contient `netflix`) → exclue
   - Une suggestion rejetée (`dismissed_suggestions` contient `netflix`) → exclue

10. **Given** un test E2E,
    **When** il s'exécute,
    **Then** il couvre (skip auto si `!FIXTURE` ou `!ANTHROPIC_API_KEY`) : ingérer 3 PDFs de fixture présentant un récurrent (NETFLIX) → ouvrir `/charges` → vérifier `SuggestedChargesPanel` visible avec la suggestion → cliquer **Accepter** → vérifier qu'elle apparaît dans `FixedChargeList` → vérifier qu'elle a disparu du panneau de suggestions au refresh.

11. **Given** les conventions CLAUDE.md,
    **When** la story est review,
    **Then** :
    - le service ne fait **aucun** appel LLM (l'AC le précise — détection 100 % heuristique, déterministe)
    - aucun `*100`/`/100` à la main
    - codes d'erreur réutilisés (`validation_failed`)

## Tasks / Subtasks

- [ ] **Task 1 — Table `dismissed_suggestions`** (AC: #4)
  - [ ] Schéma Drizzle + `db:push`

- [ ] **Task 2 — Service `charge-suggester.ts`** (AC: #1, #2, #3, #4, #5)
  - [ ] Helper privé `normalizeLabel(label: string): string`
  - [ ] Logique de groupement par normalizedLabel + filtre récurrence
  - [ ] Inférence frequency
  - [ ] Tests unitaires `*.test.ts` (cas listés AC#9)

- [ ] **Task 3 — Endpoints** (AC: #6, #7)
  - [ ] `server/api/fixed-charges/suggestions/index.get.ts` (réutilise `db` → service)
  - [ ] `server/api/fixed-charges/suggestions/[normalizedLabel].delete.ts`
  - [ ] Tests unitaires endpoints

- [ ] **Task 4 — Composable** (AC: #8)
  - [ ] `app/composables/useChargeSuggestions.ts` exposant `{ data, refresh, dismiss(normalizedLabel), accept(suggestion) }` (accept = POST sur `/api/fixed-charges` + refresh des deux composables `useFixedCharges` ET `useChargeSuggestions`)

- [ ] **Task 5 — UI** (AC: #8)
  - [ ] `app/components/charges/SuggestedChargesPanel.vue`
  - [ ] Intégration dans `app/pages/charges.vue` (au-dessus de `FixedChargeList`)
  - [ ] Bouton **Modifier** ouvre `FixedChargeForm` (story 5.1) en mode pré-rempli — extraire le `FixedChargeForm` en mode "edit existant" + "create from suggestion" si pas déjà flexible

- [ ] **Task 6 — E2E** (AC: #10)
  - [ ] Étendre `tests/e2e/fixed-charges.spec.ts` ou créer `tests/e2e/charge-suggester.spec.ts`

- [ ] **Task 7 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` verts
  - [ ] Performance : sur ~500 transactions, `suggestRecurringCharges` < 200 ms (sinon optimiser)
  - [ ] Commit unique

## Dev Notes

### Pourquoi pas le LLM pour suggérer

Tentation : demander à Claude *"voici 6 mois de transactions, identifie les récurrents"*. Refus en V1 :
- Coût + latence à chaque ouverture de `/charges`
- Non déterministe (suggestions différentes entre 2 ouvertures → confusion utilisateur)
- Heuristique simple (lowercase + strip + group) suffit pour 90 % des récurrents communs (Netflix, Spotify, loyer, abonnements téléphone)
- Conforme à CLAUDE.md `Boundaries imperméables` : l'usage de `@anthropic-ai/sdk` est restreint à `llm-categorizer.ts`

### Normalisation des libellés — exemples

```
'NETFLIX 12.99 EUR'        → 'netflix'
'Netflix Sub 12,99'        → 'netflix sub'  → conflict possible, voir AC#2
'CB CARREFOUR 47.20'       → 'carrefour'
'VIRT EDF GAZ 89.45'       → 'virt edf gaz' → 'edf gaz' après strip mots <3
'PAIEMENT IDF MOBILITES'   → 'paiement idf mobilites' (collision possible avec 'mobilites')
```

KISS V1 : on accepte que la normalisation soit imparfaite. L'utilisateur peut **Modifier** la suggestion avant d'accepter. Si on observe trop de bruit en usage, durcir avec un dictionnaire de patterns en story future.

### Heuristique "récurrence" — pourquoi 3 mois consécutifs

3 mois = compromis entre :
- assez pour distinguer un récurrent d'une dépense ponctuelle (1-2 mois pourrait être un essai gratuit, un cadeau, un remboursement isolé)
- pas trop pour rester actionnable (V1 : si l'utilisateur ingère 3 mois, il doit voir des suggestions immédiatement)

L'amplitude `≤ 15 %` couvre les ajustements normaux (Netflix qui passe de 12,99 à 13,49 €). Au-delà → c'est probablement une catégorie variable, pas une charge fixe.

### Tri des suggestions

`occurrences DESC` puis `|amount| DESC` : on montre d'abord les plus récurrents et impactants. Stabilité (alphabetique en cas d'ex-aequo) optionnelle V1.

### Anti-patterns à éviter

- ❌ Appel LLM (cf. note précédente)
- ❌ Stockage des suggestions calculées en cache (recompute à chaque GET ; pour < 500 transactions, c'est rapide)
- ❌ Soft-delete sur `dismissed_suggestions` ; insert idempotent direct
- ❌ Dépendance circulaire avec `fixed_charges` (story 5.1) — ce service LIT `fixed_charges` mais ne mute jamais

### Project Structure Notes

Cette story crée :
- Table `dismissed_suggestions` (mutation schema)
- `server/services/charge-suggester.ts` (+ `.test.ts`) — listé `architecture.md:597`
- 2 endpoints sous `server/api/fixed-charges/suggestions/`
- 1 composable, 1 composant, intégration dans page existante

### Definition of Done

- [ ] Service détecte récurrents avec heuristique testée
- [ ] Suggestions acceptées/rejetées persistantes
- [ ] UI fluide (Accepter/Modifier/Rejeter)
- [ ] Pas d'appel LLM
- [ ] Tests unit + E2E verts
- [ ] Commit unique

### References

- [Source: `_bmad-output/planning-artifacts/prd.md`#FR17-FR18]
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 5.2]
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Project Structure (597, 681)]
- [Source: `CLAUDE.md`#Boundaries imperméables] — `@anthropic-ai/sdk` confiné à `llm-categorizer.ts`
- [Story précédente : `5-1-fixed-charges-crud-et-ui` — fournit `fixed_charges` table + UI à étendre]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

### Review Findings
