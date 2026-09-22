# Story 28.1: Choisir la banque d'un relevé, et être arrêté si elle ne correspond pas

Status: ready-for-dev

<!-- Validation optionnelle : lancer validate-create-story avant dev-story. -->

## Story

En tant qu'utilisateur,
je veux que la banque de mon relevé soit proposée d'office et qu'un mauvais choix soit refusé net,
afin qu'un relevé ne soit jamais lu avec les règles d'une autre banque.

## Acceptance Criteria

1. **Préremplissage (FR77).** Sur la page d'import, un sélecteur « Banque » est prérempli avec la banque par défaut du profil courant, et modifiable. Chaque fichier déposé part avec la banque sélectionnée **au moment du dépôt** ; une relance (`retry`) réutilise cette même banque.
2. **Contrat HTTP (AR37).** `POST /api/statements` accepte un champ multipart `bank` optionnel. Absent → banque par défaut du profil courant. Présent mais hors de `BANKS` → `422 validation_failed`.
3. **Persistance.** Le relevé ingéré porte `bank_statements.bank` = la banque utilisée ; `GET /api/statements` expose `bank` et la liste des relevés l'affiche (libellé français).
4. **Refus croisé (FR78, AR38).** Un relevé Boursorama déposé sous « Crédit Mutuel », ou l'inverse, est refusé en `400 bank_mismatch`, avec `data: { expected, detected }` (`detected` = banque reconnue, ou `null`), **avant tout appel au fournisseur**, sans PDF sauvegardé ni ligne écrite. Le message FR dit quelle banque a été reconnue.
5. **Frontière (NFR21).** La logique propre à Boursorama vit dans `server/services/bank-formats/boursorama.ts` derrière le type `BankFormat` ; `pdf-extractor.ts` reste **le seul** fichier qui importe `unpdf`.
6. **Aucun changement de comportement Boursorama.** Pour chaque PDF de `_data/raw/` et de `tests/fixtures/pdfs/`, `extractStatement(buffer, 'boursorama')` rend un `rawText`, une période et des soldes **identiques octet pour octet** à ceux d'avant le refactor (comparaison « golden », voir Tâche 1). Tous ces PDF sont reconnus comme `boursorama`, aucun comme `credit_mutuel`.
7. **Fixture versionnée (NFR36, AR40, D43).** Un test d'extraction Boursorama tourne sur `tests/fixtures/statements/boursorama-2026-03.json` (pages positionnées + texte plat, identifiants remplacés par des faux de même forme). Il vérifie : période et soldes attendus ; **aucun** faux identifiant planté dans le texte transmis ; `recognizes` vrai pour Boursorama et faux pour Crédit Mutuel. Ce test n'est **jamais** sauté, en local comme en CI.
8. **Prompt (D41).** La partie commune du prompt système ne mentionne plus Boursorama ; un paragraphe propre à la banque s'y ajoute. Pour Boursorama, l'ensemble « commun + paragraphe » conserve **toutes** les règles de la version 3. `BANK_STATEMENT_PROMPT_VERSION` passe à 4.
9. **Crédit Mutuel, périmètre de cette story.** Seul `recognizes` est réel. Un relevé Crédit Mutuel déposé sous « Crédit Mutuel » est refusé en `400 pdf_parse_failed` avec `reason: 'credit_mutuel_not_supported_yet'` — **avant** l'appel au fournisseur. L'extraction arrive en 28.2.

## Tasks / Subtasks

- [ ] **Tâche 1 — Figer le comportement Boursorama AVANT de toucher au code (AC 6)**
  - [ ] Écrire un utilitaire jetable (test Vitest gardé par `it.skipIf(!process.env.GOLDEN_DIR)`) qui, pour chaque PDF de `_data/raw/` et `tests/fixtures/pdfs/`, écrit `extractStatement(buffer)` en JSON dans `_data/golden/<hash>.json` (gitignoré via `_data/`).
  - [ ] Le lancer sur le code actuel ; conserver la sortie. Il sera relancé après la Tâche 3 en mode comparaison.
- [ ] **Tâche 2 — Types partagés (AC 2, 3)**
  - [ ] Vérifier que `shared/types/bank.ts` existe (posé par 27.1) : `BANKS = ['boursorama', 'credit_mutuel'] as const`, `type Bank`. Y ajouter `BANK_LABELS: Record<Bank, string>` = `{ boursorama: 'Boursorama', credit_mutuel: 'Crédit Mutuel' }` s'il manque.
  - [ ] `shared/schemas/api-errors.ts` : ajouter `BankMismatch: 'bank_mismatch'` ; `app/composables/useApiError.ts` : message FR + message détaillé utilisant `data.detected` (même motif que `categoryInUseMessage`). Rendre le message de `PdfParseFailed` neutre vis-à-vis de la banque (il cite aujourd'hui Boursorama).
- [ ] **Tâche 3 — Découper l'extracteur (AC 5, 6, 9)**
  - [ ] `server/services/bank-formats/types.ts` : `PositionedItem`, `ColumnHeader`, `BankFormat`, `BankMismatchError` (voir Dev Notes).
  - [ ] `server/services/bank-formats/fr-parsing.ts` : `FR_AMOUNT_TOKEN`, `parseFrAmount`, `amountsAfter`, `frDateToIso` — **déplacés sans modification**.
  - [ ] `server/services/bank-formats/columns.ts` : `DEBIT_MARKER`, `CREDIT_MARKER`, `ROW_TOLERANCE`, `AMOUNT_RE`, `findDebitCreditHeader`, `findDebitCreditSeparator`, `operationRows`, `renderRows` — génériques, 28.2 les réutilisera.
  - [ ] `server/services/bank-formats/boursorama.ts` : `recognizes`, `operationsText` (corps actuel de `extractPositionalText` hors lecture unpdf, + repli `cutBeforeOperations`), `balancesAndPeriod` (`extractPeriod` + `extractBalances` actuels).
  - [ ] `server/services/bank-formats/credit-mutuel.ts` : `recognizes` réel ; `operationsText` et `balancesAndPeriod` lèvent `new Error('credit_mutuel_not_supported_yet')`.
  - [ ] `server/services/bank-formats/index.ts` : `BANK_FORMATS: Record<Bank, BankFormat>` et `detectBank(flatText): Bank | null`.
  - [ ] `pdf-extractor.ts` : garde `extractText` / `getDocumentProxy`, **exporte** `readPositionedPages` (pour la capture de fixture), garde `redactIdentity` (appliquée en dernier, toutes banques). Nouvelle signature `extractStatement(pdfBuffer, bank)` ; séquence dans Dev Notes.
  - [ ] Conserver les ré-exports nécessaires aux imports existants ou mettre à jour les importeurs (`pdf-extractor.test.ts`, orchestrateur). Pas de ré-export « au cas où ».
  - [ ] Relancer la comparaison golden : **zéro différence** (AC 6).
- [ ] **Tâche 4 — Prompt (AC 8)**
  - [ ] `shared/constants/bank-statement-llm-prompt.ts` : `BANK_STATEMENT_SYSTEM_PROMPT` devient la partie commune, sans « Boursorama ». La phrase de la règle 8 citant « SOLDE AU » / « Nouveau solde » passe dans `BANK_PROMPT_NOTES.boursorama` ; la règle commune garde « les lignes de solde ne sont pas des opérations ». `BANK_PROMPT_NOTES.credit_mutuel = ''` (rempli en 28.2).
  - [ ] `buildBankStatementSystemPrompt(bank)` = commun + note. Version → 4.
  - [ ] `llm-categorizer.categorizeStatement(rawText, categories, bank)` utilise ce prompt.
- [ ] **Tâche 5 — Orchestrateur et endpoint (AC 2, 3, 4, 9)**
  - [ ] `IngestStatementArgs` gagne `bank: Bank`. Appel `extractStatement(pdfBuffer, bank)` ; `BankMismatchError` → `domainError(BankMismatch, { expected, detected }, 400)` ; `credit_mutuel_not_supported_yet` → `PdfParseFailed` 400 (le `catch` existant le fait déjà si l'erreur est un `Error`).
  - [ ] Insertion : `bank` dans `bankStatements.values(...)`.
  - [ ] `server/api/statements/index.post.ts` : lire la partie `bank`, valider par `z.enum(BANKS)` ; absente → `default_bank` du profil obtenu par `requireProfile(event)` (27.2). Mettre à jour le docblock (« relevé Boursorama »).
  - [ ] `server/api/statements/index.get.ts` : `bank` dans `StatementListItem`.
- [ ] **Tâche 6 — Front (AC 1, 3)**
  - [ ] `useStatements.uploadStatement(file, { bank, confirmReplace, signal })` : `form.append('bank', bank)`.
  - [ ] `useIngestionQueue` : `QueueItem.bank` ; `enqueue(files, bank)` ; `process` et `retry` passent `item.bank`.
  - [ ] `app/pages/import.vue` : sélecteur « Banque » (libellés `BANK_LABELS`), prérempli par `useProfiles()` (27.3), masqué pendant `running` comme la zone de dépôt. Texte de `PdfDropZone.vue` (« Dépose tes relevés PDF Boursorama ici ») rendu neutre.
  - [ ] Liste des relevés : afficher la banque.
- [ ] **Tâche 7 — Fixture et tests (AC 4, 6, 7, 9)** — voir « Capture de la fixture » et « Tests ».

## Dev Notes

### Prérequis — à vérifier avant de démarrer

- **27.1** (obligatoire) : `bank_statements.bank`, `profiles.default_bank`, `shared/types/bank.ts`.
- **27.2** : `requireProfile(event)` pour le défaut serveur de l'AC 2.
- **27.3** : `useProfiles` pour le préremplissage de l'AC 1.
- ⚠️ `epics.md` indique que l'epic 28 « ne dépend que de 27.1 ». C'est vrai pour l'extraction, **pas** pour le préremplissage. Démarrer 28.1 après 27.3, ou signaler l'écart plutôt que coder un substitut jetable.

### État actuel — ce qui existe et doit être préservé

- `server/services/pdf-extractor.ts` (≈ 400 lignes) : `extractStatement(buffer)` → `{ rawText, periodStart, periodEnd, openingBalanceCents, closingBalanceCents }`. Le texte plat (`extractText`, `mergePages: true`) alimente période et soldes ; `rawText` vient de l'extraction positionnelle (`extractPositionalText`) avec repli sur `cutBeforeOperations(flatText)`, puis `redactIdentity`. L'échec de la lecture positionnelle est **volontairement avalé** (confort, pas prérequis) : conserver ce comportement.
- `extractPositionalText` : séparateur Débit/Crédit **reporté** sur les pages sans en-tête ; coupe `operationRows` au-dessus de l'en-tête (NFR6, story 17.1). Tout ceci est Boursorama-agnostique en principe mais n'a été validé que sur Boursorama : on le range dans `columns.ts` (générique) et `boursorama.ts` (orchestration).
- `extractBalances` / `extractPeriod` : ancres Boursobank (« SOLDE AU : », « Nouveau solde en EUR : Montant frais bancaires* : », « Période du … au … »), correctifs story 17.2 (séparateurs de milliers, dates neutralisées). **Déplacer sans retoucher une regex.**
- Orchestrateur `statement-ingestion-orchestrator.ts` : ordre hash → dédup → extraction → soldes obligatoires → catégorisation → période → bornage des dates → chevauchement → sauvegarde PDF → règles → réconciliation → transaction DB. Le refus `bank_mismatch` doit tomber à l'**extraction**, donc avant `savePdfByHash` et avant `categorizeStatement` : rien à défaire.
- `useIngestionQueue.process` : un `pdf_already_ingested` est « ignoré », tout autre code est « échec ». `bank_mismatch` est un échec (rouge) — c'est voulu : il faut changer la banque et redéposer.

### Type `BankFormat` (D41, forme retenue)

```ts
// server/services/bank-formats/types.ts
export interface BankFormat {
  readonly bank: Bank
  /** Le relevé est-il de cette banque ? Lu sur le texte plat complet, AVANT toute coupe. */
  recognizes(flatText: string): boolean
  /** Texte transmis au modèle, bloc d'identité coupé. `pages` vaut null si la lecture positionnelle a échoué. */
  operationsText(input: { pages: PositionedItem[][] | null, flatText: string }): string
  balancesAndPeriod(flatText: string): {
    periodStart: string | null, periodEnd: string | null,
    openingCents: Cents | null, closingCents: Cents | null
  }
}
export class BankMismatchError extends Error {
  constructor(readonly expected: Bank, readonly detected: Bank | null) { super('bank_mismatch') }
}
```

**Écart assumé avec D41** : la quatrième capacité, `cardDebits`, n'est **pas** ajoutée ici. Aucun appelant ne l'utiliserait avant 28.3 (YAGNI) ; 28.3 l'ajoutera avec son consommateur.

Séquence de `extractStatement(buffer, bank)` :

1. texte plat (erreurs actuelles inchangées : PDF vide, sans texte) ;
2. `if (!BANK_FORMATS[bank].recognizes(flat)) throw new BankMismatchError(bank, detectBank(flat))` ;
3. `pages = await readPositionedPages(buffer).catch(() => null)` ;
4. `rawText = redactIdentity(format.operationsText({ pages, flatText }))` ;
5. `balancesAndPeriod(flat)` → même forme de retour qu'aujourd'hui.

### Critère `recognizes` — marqueurs d'**émetteur**, jamais de libellé

Une ligne d'opération peut citer l'autre banque (`VIR SEPA … CREDIT MUTUEL`). Reconnaître sur le nom de la banque en clair produirait un faux positif. On reconnaît donc sur le **BIC** et le **domaine** de l'émetteur, imprimés en en-tête ou pied de page :

| Banque | Critère (texte plat complet) | Constat |
|---|---|---|
| `boursorama` | `/BOUSFRPP/` **ou** `/www\.boursobank\.com\|www\.boursorama\.(com\|fr)/i` | Relevés 2026 : BIC ×5, domaine ×5 |
| `credit_mutuel` | `/\bCMCIFR/` **ou** `/creditmutuel\.fr/i` | Relevé d'exemple : BIC ×2, domaine ×3 |

Vérifié : aucun marqueur Crédit Mutuel dans les deux relevés Boursorama de référence, aucun marqueur Boursorama dans le relevé Crédit Mutuel. **Les relevés Boursorama plus anciens de `_data/raw/` doivent être vérifiés** par la comparaison golden (AC 6) : si l'un n'est pas reconnu, élargir le critère Boursorama (autre forme du domaine) plutôt que d'assouplir en « nom de banque ».

`detectBank(flat)` : la première banque dont `recognizes` est vrai, sinon `null`. Si **les deux** reconnaissent (non observé), rendre `null` : le message dira « banque non reconnue » plutôt qu'un choix arbitraire.

### Capture de la fixture Boursorama (D43)

La fixture n'est pas un PDF : ce sont les **pages positionnées** et le **texte plat**, identifiants remplacés.

1. **Table de substitution, hors dépôt.** `_data/fixture-substitutions.json` (couvert par `_data/` dans `.gitignore`) : paires `{ "real": "...", "fake": "..." }`. Y mettre chaque identifiant **tel qu'il est découpé dans le PDF** : l'IBAN est imprimé par groupes de quatre, donc une paire par groupe ; numéro de compte, nom et adresse du titulaire (chaque ligne), numéro de carte tronqué. Faux de **même longueur et même forme** (chiffres ↔ chiffres, majuscules ↔ majuscules) : la géométrie et les regex doivent se comporter à l'identique.
2. **Capture.** Un test gardé `it.skipIf(!process.env.CAPTURE_PDF)` (aliases Nuxt disponibles sous Vitest, et `unpdf` reste importé par `pdf-extractor` seul via `readPositionedPages`) : lit le PDF, applique les substitutions à chaque `item.text` et au texte plat, écrit `tests/fixtures/statements/boursorama-2026-03.json` :
   ```json
   { "bank": "boursorama", "source": "Releve-compte-31-03-2026.pdf",
     "flatText": "...", "pages": [[{ "x": 0, "right": 0, "y": 0, "text": "..." }]],
     "planted": ["<chaque faux>"],
     "expected": { "periodStart": "2026-02-28", "periodEnd": "2026-03-31",
                   "openingCents": 47841, "closingCents": 102398 } }
   ```
   Commande : `CAPTURE_PDF=tests/fixtures/pdfs/Releve-compte-31-03-2026.pdf yarn test:run capture-statement-fixture`.
3. **Contrôle bloquant dans la capture elle-même.** Après substitution, la capture **échoue** si le JSON contient encore une valeur `real`, ou toute suite IBAN (`[A-Z]{2}\d{2}` suivi de groupes) ou d'au moins dix chiffres **absente de `planted`**. C'est ce qui empêche un identifiant oublié dans la table de partir en commit.
4. **Relecture humaine** du diff JSON avant commit ; le hook de pré-commit (scan de secrets) reste actif — `--no-verify` interdit.

Les valeurs `expected` sont celles déjà verrouillées dans `BOURSOBANK_FIXTURES` (`pdf-extractor.test.ts`). Ne recopier **aucun** identifiant réel dans la story, le test, un commentaire ou un message de commit.

### Tests

- `bank-formats/boursorama.test.ts` (fixture JSON, jamais sauté) : période et soldes ; `redactIdentity(operationsText(...))` ne contient **aucun** élément de `planted` ; texte non vide et contenant des marqueurs `[DÉBIT]`/`[CRÉDIT]` ; `recognizes(flatText)` vrai ; `credit-mutuel.recognizes(flatText)` faux.
- `bank-formats/credit-mutuel.test.ts` : `recognizes` sur chaînes synthétiques — vrai avec `CMCIFR` ou `creditmutuel.fr` ; **faux** sur un texte Boursorama contenant un libellé `VIR SEPA … CREDIT MUTUEL` (garde anti faux positif).
- `bank-formats/index.test.ts` : `detectBank` — une banque, aucune, les deux (→ `null`).
- Tests déplacés : `parseFrAmount` → `fr-parsing.test.ts` ; colonnes → `columns.test.ts`. Contenu inchangé.
- `pdf-extractor.test.ts` : les tests sur PDF réels restent (`skipIf`) mais passent `'boursorama'` ; ajouter `extractStatement(pdfBoursorama, 'credit_mutuel')` → `BankMismatchError` avec `detected = 'boursorama'`.
- `statement-ingestion-orchestrator.test.ts` : `bank_mismatch` → `categorizeStatement` **non appelé**, aucune ligne en base, aucun PDF sauvegardé ; `credit_mutuel_not_supported_yet` → idem ; `bank` persistée.
- `bank-statement-llm-prompt.test.ts` : partie commune sans « Boursorama » ; prompt Boursorama contenant chacune des règles 1 à 9 de la v3 (au moins une phrase-clé par règle) et « SOLDE AU ».
- Endpoint : `bank` absent → défaut du profil ; `bank` invalide → 422.
- `useApiError` : le `Record<ApiErrorCodeValue, string>` force la présence du message — typecheck vert.

### Garde-fous (CLAUDE.md)

- `unpdf` **uniquement** dans `pdf-extractor.ts` (NFR21) ; SDK fournisseur uniquement dans `llm-categorizer.ts` (NFR16).
- Erreur métier = `createError` via `domainError`, code stable ; pas de `try/catch` qui avale (le repli positionnel existant est documenté et conservé).
- Énumérations en anglais (`credit_mutuel`), libellés FR à l'écran.
- Composants sans `$fetch` ; mutation de store par action.
- Commits : fichiers nommés un par un, jamais `git add -A`.

### Project Structure Notes

- Nouveau dossier `server/services/bank-formats/` conforme à D41. Noms de fichiers en kebab-case (règle ESLint `unicorn/filename-case`).
- Nouveau dossier `tests/fixtures/statements/` (versionné) — distinct de `tests/fixtures/pdfs/`, gitignoré pour les `.pdf`.
- Aucun conflit détecté avec la structure existante.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 28.1]
- [Source: _bmad-output/planning-artifacts/prd.md#Profils et banques — FR77, FR78 ; NFR6, NFR21, NFR36]
- [Source: _bmad-output/planning-artifacts/architecture.md#D40, #D41, #D43]
- [Source: server/services/pdf-extractor.ts — extractStatement, extractPositionalText, extractBalances]
- [Source: server/services/statement-ingestion-orchestrator.ts — étapes 3 à 10]
- [Source: shared/constants/bank-statement-llm-prompt.ts — règle 8]
- [Source: app/composables/useStatements.ts, useIngestionQueue.ts, app/pages/import.vue]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
