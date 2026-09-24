# Story 28.1: Choisir la banque d'un relevé, et être arrêté si elle ne correspond pas

Status: review

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
7. **Fixture versionnée (NFR36, AR40, D43) — révisée le 2026-09-23, décision de Marceau.** ~~Pages positionnées + texte plat, identifiants remplacés par des faux de même forme~~ : cette approche (capture d'un vrai PDF + substitution réel→faux) a été **abandonnée** après un verdict BLOQUER de `pr-reviewer` — des valeurs réelles se trouvaient en dur dans du code de test versionné, et le chiffrement de substitution était réversible. `tests/fixtures/statements/boursorama-2026-03.json` est désormais **entièrement synthétique** : la STRUCTURE est réaliste (3 pages, positions x/right/y, en-tête Débit/Crédit et bloc d'identité réimprimés à l'identique sur les pages 1 et 2 comme sur un relevé réel, page 3 de continuation sans en-tête, récapitulatif de soldes), le CONTENU est entièrement INVENTÉ (opérations, montants, dates, IBAN, nom, adresse) — **aucune donnée réelle, même anonymisée**. Les soldes sont recalculés pour réconcilier par construction. Le test vérifie : période et soldes attendus (`balancesAndPeriod`, les quatre champs) ; `recognizes` vrai pour Boursorama et faux pour Crédit Mutuel ; sur le texte transmis au fournisseur (après `redactIdentity`), l'absence de toute séquence de forme IBAN et de toute suite de ≥ 10 chiffres, sur les DEUX pages porteuses d'un bloc d'identité (pas seulement la première) ; le chemin de repli sans lecture positionnelle ; un snapshot verrouillant la sortie. Ce test n'est **jamais** sauté, en local comme en CI.
8. **Prompt (D41).** La partie commune du prompt système ne mentionne plus Boursorama ; un paragraphe propre à la banque s'y ajoute. Pour Boursorama, l'ensemble « commun + paragraphe » conserve **toutes** les règles de la version 3. `BANK_STATEMENT_PROMPT_VERSION` passe à 4.
9. **Crédit Mutuel, périmètre de cette story.** Seul `recognizes` est réel. Un relevé Crédit Mutuel déposé sous « Crédit Mutuel » est refusé en `400 pdf_parse_failed` avec `reason: 'credit_mutuel_not_supported_yet'` — **avant** l'appel au fournisseur. L'extraction arrive en 28.2.

## Tasks / Subtasks

- [x] **Tâche 1 — Figer le comportement Boursorama AVANT de toucher au code (AC 6)**
  - [x] Utilitaire jetable équivalent : comparaison golden directe entre `extractStatement` du commit `408a14a` (snapshot temporaire, jamais commité) et le nouveau `extractStatement(buffer, 'boursorama')`, sur les 22 PDF réels disponibles (`tests/fixtures/pdfs/` + `_data/raw/`).
  - [x] Lancé AVANT la Tâche 3 (baseline) puis RELANCÉ après (comparaison) : **22/22 identiques** à chaque fois, y compris après le correctif lint des échappements ` `/` ` (Tâche 3bis). Fichiers temporaires supprimés après usage, jamais commités.
- [x] **Tâche 2 — Types partagés (AC 2, 3)**
  - [x] `shared/types/bank.ts` **n'existait pas** dans ce worktree (27.1 non fusionnée ici) — créé dans le périmètre de cette passe : `BANKS`, `type Bank`, `BANK_LABELS`. ⚠️ **À réconcilier avec 27.1** au merge (probable conflit si 27.1 pose sa propre version).
  - [x] `shared/schemas/api-errors.ts` : `BankMismatch: 'bank_mismatch'` ajouté. `useApiError.ts` : message FR + `bankMismatchMessage(data)` détaillé sur `data.detected` (motif `categoryInUseMessage`). `PdfParseFailed` neutralisé (ne cite plus Boursorama).
- [x] **Tâche 3 — Découper l'extracteur (AC 5, 6, 9)**
  - [x] `server/services/bank-formats/types.ts`, `fr-parsing.ts` (déplacé sans modification), `columns.ts` (déplacé sans modification), `boursorama.ts`, `credit-mutuel.ts`, `index.ts` — conformes aux Dev Notes.
  - [x] `pdf-extractor.ts` : ne garde que `extractText`/`getDocumentProxy` (+ `readFlatText`, factorisation interne sans changement de comportement), exporte `readPositionedPages`, garde `redactIdentity`. Nouvelle signature `extractStatement(pdfBuffer, bank)`.
  - [x] Importeurs mis à jour (`pdf-extractor.test.ts`, `llm-categorizer.ts`/test, orchestrateur/test). Pas de ré-export « au cas où ».
  - [x] Comparaison golden relancée : **zéro différence** (AC 6).
- [x] **Tâche 4 — Prompt (AC 8)**
  - [x] `BANK_STATEMENT_SYSTEM_PROMPT` neutre (plus de « Boursorama », plus de « SOLDE AU »/« Nouveau solde »). `BANK_PROMPT_NOTES.boursorama` porte la note déplacée ; `BANK_PROMPT_NOTES.credit_mutuel = ''`.
  - [x] `buildBankStatementSystemPrompt(bank)` = commun + note. `BANK_STATEMENT_PROMPT_VERSION` → 4.
  - [x] `llm-categorizer.categorizeStatement(rawText, categories, bank)` utilise ce prompt.
- [x] **Tâche 5 — Orchestrateur et endpoint (AC 2, 3, 4, 9)**
  - [x] `IngestStatementArgs.bank?: Bank` — absent → `requireCurrentProfile(event).defaultBank` (27.1/27.2 désormais fusionnées) plutôt qu'une constante fixe. `server/utils/current-profile.ts` gagne `requireCurrentProfile` (renvoie le `Profile` complet), dont `requireProfile` n'est plus qu'un enrobage — un seul point de lecture du cookie, une seule requête DB par appel, pas de duplication.
  - [x] `tx.insert(bankStatements).values({ ..., bank, ... })` — la banque résolue (explicite ou défaut du profil) est désormais persistée, plus de valeur en dur.
  - [x] `server/api/statements/index.post.ts` : champ multipart `bank` lu, `trim()`é, validé via `isBank` contre `BANKS` → `422 validation_failed` sinon ; absent ou vide → `undefined` transmis à `ingestStatement`, qui retombe sur le profil.
  - [x] `server/api/statements/index.get.ts` : `bank` ajouté à la sélection Drizzle et à `StatementListItem`.
- [x] **Tâche 6 — Front (AC 1, 3)**
  - [x] `useStatements.uploadStatement` accepte `opts.bank?: Bank`, ajouté au `FormData` si fourni. `StatementListItem` (les deux définitions, `useStatements.ts` et `index.get.ts`) gagne `bank: Bank`.
  - [x] `useIngestionQueue` : `QueueItem.bank` figé au moment de `enqueue(files, bank)` — une relance (`retry`) réutilise cette même valeur, la file ne relit jamais le sélecteur de la page.
  - [x] `app/pages/import.vue` : sélecteur « Banque » (natif, classe `.select`, cohérent avec `regles.vue`), préremplissage réactif depuis `useCurrentProfile().currentProfile.defaultBank` (`watch`, le fetch du profil étant asynchrone), modifiable. Colonne « Banque » ajoutée à la liste des relevés (`BANK_LABELS[stmt.bank]`).
- [x] **Tâche 7 — Fixture et tests (AC 4, 6, 7, 9)** — refondue le 2026-09-22 suite au verdict BLOQUER de `pr-reviewer` (voir Debug Log References). Fixture `tests/fixtures/statements/boursorama-2026-03.json` **entièrement synthétique** (géométrie réaliste, contenu inventé) générée par `generate-synthetic-fixture.test.ts` et écrite dans le worktree — elle n'est PAS committée par l'agent (aucun commit n'a été créé, cf. consigne du chantier) ; aucun identifiant réel n'y figure, structurellement (rien n'est dérivé d'un PDF réel), vérifié par grep direct sur les anciennes valeurs réelles.

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

### Question ouverte (hors AC, signalée en revue `pr-reviewer`)

`useIngestionQueue.QueueItem.bank` est figé par élément (AC 1), mais **`IngestionQueue.vue`
n'affiche cette banque nulle part** dans la file (une ligne montre le nom du fichier et son
statut, pas la banque avec laquelle il a été déposé). Ce n'est pas un manquement à un AC de
cette story — aucun AC ne demande cet affichage — mais si un utilisateur dépose des relevés de
deux banques dans la même file (mixte Boursorama + Crédit Mutuel), rien à l'écran ne le
distingue avant le résultat. À trancher : afficher la banque par ligne de file (feature
minuscule) ou l'assumer comme non nécessaire tant qu'un seul profil n'a qu'une banque
courante. Ne pas coder sans validation explicite (scope verrouillé, CLAUDE.md).

## Dev Agent Record

### Agent Model Used

Agent de développement du chantier.

### Debug Log References

- Comparaison golden (Tâche 1) : `extractStatement` du commit `408a14a` (snapshot temporaire,
  jamais commité) vs. nouveau code, sur 22 PDF réels (`tests/fixtures/pdfs/` + `_data/raw/`
  du dépôt principal, copiés dans le worktree pour l'exécution — dossiers gitignorés, jamais
  committés, supprimés du worktree une fois la comparaison terminée). **22/22 identiques**,
  relancé après la Tâche 3 puis après le correctif lint (échappements des espaces insécables) :
  toujours 22/22.
- **Fixture D43 — revue de sécurité et décision de Marceau (2026-09-22) : refonte complète.**
  Une première version capturait la géométrie d'un vrai PDF puis substituait les identifiants
  réels par des faux (`digitCipher`, table réel→faux). La revue `pr-reviewer` a bloqué : des
  valeurs réelles (IBAN, codes banque/guichet/compte, adresse, prénoms de proches) se
  trouvaient en dur dans le code de test versionné (`capture-statement-fixture.test.ts` et les
  tests copiés depuis lui), et `digitCipher` étant un chiffrement réversible publié dans le
  même dépôt, l'anonymisation n'en était pas une. Marceau a tranché : la fixture ne contient
  **aucune donnée réelle, même anonymisée**. Remédiation : `capture-statement-fixture.test.ts`
  et la table `_data/fixture-substitutions.json` **supprimés de la génération** ; remplacés par
  `generate-synthetic-fixture.test.ts` qui invente entièrement le contenu (opérations, montants,
  dates, IBAN, nom, adresse) tout en conservant une géométrie réaliste (pages, positions
  x/right/y, en-tête Débit/Crédit, bloc d'identité au-dessus de l'en-tête, récapitulatif de
  soldes) — les soldes sont recalculés pour que la réconciliation tombe juste par construction.
  Généré via `GENERATE_FIXTURE=1 yarn test:run generate-synthetic-fixture`.
- **Contre-revue du 2026-09-23** : les deux points BLOQUANT sont levés, mais le croisement avec
  les 20 relevés réels a montré que CHAQUE page y porte son propre en-tête Débit/Crédit et son
  propre bloc d'identité — la fixture (alors à 2 pages) n'en avait ni l'un ni l'autre sur sa
  page 2, et ne prouvait donc la coupe géométrique que sur une seule page. Fixture regénérée à
  3 pages : page 1 et page 2 réimpriment le même bloc d'identité et le même en-tête (mêmes
  positions relatives), page 3 reste une continuation sans en-tête (cas de repli conservé
  volontairement, non observé sur les relevés réels mais couvert par le code). `_data/fixture-substitutions.json`
  supprimé (n'a plus d'objet, la fixture ne dérive plus d'aucune donnée réelle).

### Completion Notes List

- **Reprise après pivot de périmètre.** Ce worktree a été relancé sur la pointe de `master`,
  où 27.1/27.2/27.3 sont déjà fusionnées (`shared/types/bank.ts`, `profiles.default_bank`,
  `bank_statements.bank`, `requireProfile`, `useCurrentProfile`/`useProfiles`). Le travail de
  cette passe complète donc la partie restée non faite de 28.1 : persistance de `bank`, champ
  multipart, préremplissage front, affichage liste — sans toucher à l'extracteur (Tâches 1-4,
  7, déjà closes et vérifiées inchangées par `yarn test:run`).
- **`requireCurrentProfile` ajouté à `server/utils/current-profile.ts`** plutôt que de refaire
  une lecture DB séparée dans l'orchestrateur : `requireProfile` (utilisé par 23 endpoints)
  n'est plus qu'un enrobage qui en extrait l'id. Un seul point de lecture du cookie reste vrai
  (AR35), et `ingestStatement` a accès à `defaultBank` sans requête supplémentaire.
- **Défaut de banque non trivial** : `bank = requestedBank ?? currentProfile.defaultBank` — le
  test `bank absent → défaut LA BANQUE DU PROFIL COURANT` seme un profil temporaire avec
  `default_bank = 'credit_mutuel'` pour prouver que ce n'est pas une constante déguisée
  (régression possible si quelqu'un réintroduit `'boursorama'` en dur).
- **Validation du champ multipart `bank`** : `422 validation_failed` avec `data: { reason,
  value, allowed }` si hors de `BANKS` — cohérent avec le contrat d'erreur du projet
  (`createError` + `statusMessage` stable). Absent ou chaîne vide → `undefined`, jamais une
  chaîne vide envoyée à l'orchestrateur.
- **Préremplissage front réactif** (`app/pages/import.vue`) : `selectedBank` initialisé depuis
  `currentProfile.value?.defaultBank` PUIS synchronisé par un `watch`, parce que
  `useCurrentProfile` est un `useFetch` asynchrone qui répond généralement après le montage de
  la page — une seule initialisation aurait figé le sélecteur sur `BANKS[0]`
  (`'boursorama'`) jusqu'à une interaction manuelle.
- **Banque figée par élément de file** (`useIngestionQueue.QueueItem.bank`), pas relue depuis
  la page au moment du traitement : un `retry` après que l'utilisateur a changé le sélecteur
  renvoie donc la MÊME banque que le dépôt initial (AC 1, dernière phrase).
- **Tests E2E `import-bank.spec.ts`** : Playwright ne restitue pas le corps d'une requête
  `multipart/form-data` envoyée par `fetch` (`postData()`/`postDataBuffer()` vides sous
  Chromium) — contournement par interception de `window.fetch` via `page.addInitScript` pour
  lire le `FormData` avant l'envoi. Découvert en cours de rédaction, documenté dans le test.
- **Vérification visuelle (`yarn dev`) : NON FAITE par cet agent.** Cet agent ne dispose pas
  d'outil navigateur (Playwright MCP) — seule la suite E2E Playwright (Chromium réel, headless)
  a exercé le préremplissage, le changement de banque et la validation serveur. La comparaison
  à l'écran proprement dite reste à faire par `pr-reviewer`, qui a accès au MCP Playwright.
- **AC 6 (zéro changement de comportement) vérifié empiriquement**, pas seulement par
  relecture : comparaison octet-à-octet de `extractStatement` avant/après sur les 22 PDF
  réels disponibles, deux fois (avant et après le correctif de lint). Zéro différence.
- **Fixture D43 — version finale, après remédiation de sécurité** : `tests/fixtures/statements/boursorama-2026-03.json`
  est ENTIÈREMENT SYNTHÉTIQUE. Géométrie réaliste conservée (2 pages, positions x/right/y,
  en-tête Débit/Crédit, bloc d'identité au-dessus de l'en-tête, récapitulatif de soldes,
  continuation de page sans en-tête). Contenu entièrement inventé : IBAN fictif
  (`FR76 1234 5678 9012 3456 7890 123`), nom et adresse fictifs (`M JEAN DUPONT`,
  `12 RUE DES LILAS`, `75000 PARIS`), 10 opérations inventées (dates, libellés, montants),
  soldes recalculés pour réconcilier exactement. `boursorama.test.ts` vérifie explicitement,
  sur le texte transmis au fournisseur (après `redactIdentity`) : zéro séquence de forme IBAN,
  zéro suite de ≥ 10 chiffres, absence de toute valeur de `_data/fixture-substitutions.json`
  si ce fichier existe encore localement (garde-fou best-effort, silencieux si absent — cas
  normal), plus un snapshot verrouillant la sortie dans le temps.
- Vérification finale : `grep -Fc` sur chaque valeur réelle historique (IBAN, codes
  banque/guichet/compte, adresse, noms) dans TOUS les fichiers modifiés/non suivis → 0
  occurrence partout. La fixture n'ayant plus aucun lien avec un PDF réel, ce risque a disparu
  structurellement plutôt que d'être seulement vérifié après coup.
- Points mineurs de la revue `pr-reviewer` également traités : `credit-mutuel.ts` documente
  pourquoi `CMCIFR` accepte volontairement le CIC (D41) ; le test de règle 7 du prompt cible
  la phrase exacte plutôt que le seul mot « Libellé » ; le `catch` silencieux de la lecture
  positionnelle (`pdf-extractor.ts`) logge désormais un `console.warn`.
- `yarn test:run`, `yarn lint`, `yarn typecheck` verts (voir rapport de fin de story).

### File List

**Créés**
- `shared/types/bank.ts` (déjà présent, posé par 27.1 sur `master` — non recréé)
- `server/services/bank-formats/types.ts`
- `server/services/bank-formats/fr-parsing.ts`
- `server/services/bank-formats/fr-parsing.test.ts`
- `server/services/bank-formats/columns.ts`
- `server/services/bank-formats/columns.test.ts`
- `server/services/bank-formats/boursorama.ts`
- `server/services/bank-formats/boursorama.test.ts`
- `server/services/bank-formats/credit-mutuel.ts`
- `server/services/bank-formats/credit-mutuel.test.ts`
- `server/services/bank-formats/index.ts`
- `server/services/bank-formats/index.test.ts`
- `server/services/bank-formats/generate-synthetic-fixture.test.ts` (remplace `capture-statement-fixture.test.ts`, supprimé — cf. Debug Log References)
- `server/services/bank-formats/__snapshots__/boursorama.test.ts.snap`
- `tests/fixtures/statements/boursorama-2026-03.json` (contenu entièrement synthétique)
- `tests/e2e/import-bank.spec.ts` (préremplissage, banque figée par dépôt, validation 422/défaut)

**Modifiés (cette passe — persistance, endpoint, front, story 28.1)**
- `server/utils/current-profile.ts` — ajout `requireCurrentProfile`
- `server/utils/current-profile.test.ts` — tests `requireCurrentProfile`
- `server/services/statement-ingestion-orchestrator.ts` — défaut de banque sur le profil, persistance `bank`
- `server/services/statement-ingestion-orchestrator.test.ts` — tests défaut profil / persistance
- `server/api/statements/index.post.ts` — champ multipart `bank`, validation `BANKS`
- `server/api/statements/index.get.ts` — `bank` exposé dans `StatementListItem`
- `server/api/statements/index.get.test.ts` — assertions sur `bank`
- `app/composables/useStatements.ts` — `StatementListItem.bank`, `uploadStatement(..., { bank })`
- `app/composables/useStatements.test.ts` — tests du champ `bank`
- `app/composables/useIngestionQueue.ts` — `QueueItem.bank`, `enqueue(files, bank)`
- `app/composables/useIngestionQueue.test.ts` — **créé** en correctif de revue (item MINEUR 6) : banque transmise à `uploadStatement`, réutilisée par `retry`, deux dépôts consécutifs gardent chacun la leur
- `app/pages/import.vue` — sélecteur « Banque », préremplissage, colonne liste ; correctif de revue (IMPORTANT 1) : `watch` sur `currentProfile.value?.id` plutôt que sur l'objet entier
- `app/components/ingestion/PdfDropZone.vue` — correctif de revue (IMPORTANT 2) : texte neutre (« relevés PDF », sans mention de banque)

**Modifiés (passe précédente — extracteur)**
- `server/services/pdf-extractor.ts`
- `server/services/pdf-extractor.test.ts`
- `server/services/llm-categorizer.ts`
- `server/services/llm-categorizer.test.ts`
- `shared/constants/bank-statement-llm-prompt.ts`
- `shared/constants/bank-statement-llm-prompt.test.ts`
- `shared/schemas/api-errors.ts`
- `app/composables/useApiError.ts`
- `app/composables/useApiError.test.ts`

### Change Log

- 2026-09-22 : implémentation de la partie extracteur (Tâches 1-5 partielle, 7) ; Tâche 6 et
  le reste de la Tâche 5 (persistance, endpoint, front) explicitement reportés après 27.1/27.3.
  Statut laissé en `in-progress`.
- 2026-09-24 : worktree relancé sur `master` (27.1/27.2/27.3 fusionnées). Complété la Tâche 5
  (persistance de `bank`, champ multipart validé, exposition dans `GET /api/statements`) et la
  Tâche 6 (sélecteur « Banque » préremplissable sur `/import`, banque figée par élément de
  file, colonne « Banque » dans la liste des relevés). Tests unitaires et E2E ajoutés. `yarn
  test:run`, `yarn lint`, `yarn typecheck` verts ; suite E2E complète verte (42 passés, 7
  auto-skippés sans `MISTRAL_API_KEY`/fixture PDF, comme avant cette passe). Statut passé à
  `review`.
- 2026-09-24 (revue `pr-reviewer`, aucun BLOQUANT, CHANGEMENTS REQUIS) : corrigé un bug réel
  trouvé par validation visuelle — le `watch(currentProfile, ...)` de `import.vue` réécrasait
  le choix de banque de l'utilisateur à chaque fin de file (`invalidateAnalysis()` recharge
  aussi `current-profile` sans clé) ; passage à `watch(() => currentProfile.value?.id, ...)`.
  Texte de `PdfDropZone.vue` neutralisé (ne mentionne plus Boursorama). Test de préremplissage
  E2E réécrit contre un profil `credit_mutuel` créé à la volée (`marceau`/`boursorama`
  coïncidait avec le repli `BANKS[0]`, ne prouvant rien). Assertion `not.toBe(422)` resserrée
  en `400 pdf_parse_failed` précis. Interception `window.fetch` remplacée par
  `page.route(...).request().postDataBuffer()`, qui restitue bien le corps multipart
  (l'hypothèse initiale d'un corps vide sous Chromium était fausse). Ajout d'un cas E2E dédié
  au bug du `watch` et d'un test unitaire `useIngestionQueue.test.ts` (banque transmise et
  réutilisée par `retry`). Question ouverte notée : la file n'affiche la banque figée d'aucun
  élément.
