# Story 28.4: Importer une année d'historique Crédit Mutuel depuis l'export Excel

Status: review

<!-- Validation optionnelle : lancer validate-create-story avant dev-story. -->

## Story

En tant que titulaire d'un compte Crédit Mutuel,
je veux importer l'export Excel de ma banque en ligne,
afin d'avoir un an d'historique à analyser sans attendre douze relevés.

## Acceptance Criteria

1. **Lecture de la feuille du compte courant (FR82, AR42).** Étant donné l'écran de dépôt et un
   export Excel Crédit Mutuel déposé sur un profil dont la banque est Crédit Mutuel, chaque ligne
   datée de la feuille du compte courant devient une transaction : **date d'opération** (colonne
   `Date`, pas `Valeur`), libellé, montant signé lu dans `Débit` ou `Crédit` et converti en `Cents`
   par le code. **Aucun montant ne passe par le modèle**, qui ne reçoit que des libellés à
   catégoriser (`categorizeLabels`).
2. **Feuilles ignorées, et nommées.** Les autres feuilles (situation des comptes, feuilles
   techniques masquées, éventuelles feuilles d'autres comptes) sont ignorées ; la réponse
   d'ingestion les nomme (`ignoredSheets`), **chiffres des numéros masqués**, et l'écran de dépôt
   les affiche.
3. **Solde déduit, état « non vérifié » (FR83).** Le relevé créé porte `source = 'export'`, le
   solde final lu sur la ligne `Solde au jj/mm/aaaa`, un solde de départ **déduit** (solde final −
   somme des opérations), `continuity_gap_cents = null`, et l'état de fiabilité **`unverified`**
   (« Non vérifié ») — visible partout où un état de fiabilité s'affiche (liste des relevés, file
   d'ingestion, analyse, transactions d'une période, réconciliation). **Jamais « fiable ».**
4. **Agrégats carte (FR84).** Les lignes dont le libellé commence par `RELEVE CARTE` sont rangées
   **par le code, sans le modèle** (elles ne lui sont pas transmises), dans le poste « Carte (non
   détaillée) » ; `card_detail_missing` passe à vrai sur le relevé ; la réponse d'ingestion liste
   les mois concernés (`cardAggregateMonths`), affichés à l'écran.
5. **Poste présent partout.** « Carte (non détaillée) » est ajouté à `DEFAULT_REFERENTIAL` (donc à
   tout profil créé ensuite) et, par **migration conditionnelle** sur le modèle de 0009, à chaque
   profil déjà peuplé. Il est protégé (non supprimable) et n'est pas proposé au modèle.
6. **Texte transmis (NFR6, NFR36).** Le texte transmis au fournisseur ne contient **que des
   libellés** : ni RIB, ni numéro de compte (y compris à l'intérieur d'un libellé), ni solde, ni
   montant, ni en-tête, ni titre de feuille.
7. **Déduplication (FR5).** Le même fichier déposé deux fois : le second dépôt est refusé
   `409 pdf_already_ingested` (code existant), sans appel au fournisseur.
8. **Refus avant tout appel (FR78).** Un fichier Excel qui n'est pas un export Crédit Mutuel
   reconnu → `400 statement_format_unrecognized` ; un export Crédit Mutuel déposé sous Boursorama
   → `400 bank_mismatch` (`expected: 'boursorama'`, `detected: 'credit_mutuel'`). Dans les deux
   cas : **aucun appel au fournisseur, aucun fichier sauvegardé, aucune ligne écrite**.
9. **Fixture synthétique (NFR36, AR42).** Un classeur **synthétique** — structure de l'export réel,
   contenu entièrement inventé — généré par un test gardé, vérifie : lecture, signes, solde déduit,
   état `unverified`, agrégats carte (au moins deux lignes `RELEVE CARTE` sur deux mois) et absence
   de tout identifiant planté dans le texte transmis.
10. **Frontière `exceljs`.** `exceljs` n'est importé que par `server/services/spreadsheet-extractor.ts`
    (plus le seul test générateur de fixture, nommément exempté). Un test d'architecture le vérifie,
    en même temps que `unpdf` (→ `pdf-extractor.ts`) et `@mistralai/mistralai` (→
    `llm-categorizer.ts`).
11. **Hors périmètre, explicitement.** Le raccord avec le premier relevé PDF (écriture de
    `continuity_gap_cents`, lignes non réimportées) est **28.2** : ici la colonne existe et vaut
    toujours `null`. L'état dérivé `card_detail_missing` de `deriveReliability` est **28.3** : ici
    seule la colonne est posée et écrite.

## Tasks / Subtasks

- [x] **T1 — Schéma, migration 0011, référentiel** (AC 3, 4, 5)
  - [x] `shared/types/statement-source.ts` : `STATEMENT_SOURCES = ['pdf', 'export'] as const`,
        type `StatementSource`.
  - [x] `server/db/schema.ts` › `bankStatements` : `source` (`text`, enum, `NOT NULL DEFAULT 'pdf'`),
        `continuityGapCents` (`integer('continuity_gap_cents')`, **nullable**),
        `cardDetailMissing` (`integer('card_detail_missing', { mode: 'boolean' })`,
        `NOT NULL DEFAULT false`). Docblock : pourquoi ces deux derniers sont des **faits**
        stockés et non des états dérivés (D42, D44).
  - [x] `yarn db:generate` → `0011_*.sql` + snapshot ; puis **ajouter à la main** en fin de fichier,
        après un `--> statement-breakpoint`, l'insertion conditionnelle du poste (voir Dev Notes).
        Jamais de `drizzle push`.
  - [x] `shared/constants/default-referential.ts` : `CARD_UNDETAILED_ITEM_CODE =
        'divers-carte-non-detaillee'`, poste `{ label: 'Carte (non détaillée)', nature: 'expense' }`
        dans la rubrique `divers` ; mettre à jour le compte du docblock (14 rubriques / 52 postes).
  - [x] `shared/constants/protected-categories.ts` : ajouter le code à `PROTECTED_ITEM_CODES` (avec
        sa raison dans le commentaire).
  - [x] `tests/fixtures/test-schema.ts` : miroir des trois colonnes.
  - [x] `server/middleware/0.bootstrap.ts` : marqueur de schéma « colonne `bank_statements.source`
        (D44) », sur le modèle des marqueurs existants.
  - [x] Test de migration `server/db/migrations/0011-*.test.ts` (modèle : `0010-…test.ts`) : base
        peuplée → poste créé sur **chaque** profil, dans `divers`, nature `expense` ; base vierge →
        aucune insertion ; rejouée → idempotente ; relevés existants → `source = 'pdf'`,
        `card_detail_missing = 0`, `continuity_gap_cents IS NULL`.
- [x] **T2 — Fiabilité : nouvel état `unverified`** (AC 3)
  - [x] `shared/types/statement-reliability.ts` : `'unverified'` dans `STATEMENT_RELIABILITIES` ;
        `deriveReliability` passe à **un objet** `{ gapCents, gapAccepted, source,
        continuityGapCents }` (le typecheck force alors chaque appelant) ; ordre de priorité et
        `worstReliability` : voir Dev Notes ; `RELIABILITY_LABELS.unverified = 'Non vérifié'`.
  - [x] `statement-reliability.test.ts` : nominal + deux cas limites (NFR3) pour `unverified` —
        export `null` → `unverified` ; export `0` → `reliable` ; export `≠ 0` → `gap_unreviewed` ;
        export avec écart interne non nul (ligne manuelle) → `gap_unreviewed` ; `gapAccepted`
        prime ; PDF inchangé. `worstReliability` avec `unverified`.
  - [x] Appelants à mettre à jour : `server/utils/statement-reliability.ts` (`baseSelection` lit
        `source` et `continuityGapCents`), `server/api/statements/[hash].get.ts` (+ exposer
        `source`), `server/api/reconciliation/[hash].post.ts` (branche `add_transaction`).
  - [x] Front : `ReliabilityBadge.vue` (`ICONS.unverified = '?'`, `BADGE_CLASS.unverified =
        'badge--warn'`, docblock « quatre états ») ; textes d'alerte de `app/pages/analyse.vue` et
        `app/pages/transactions/[period].vue` — un message propre à `unverified` (« repose sur un
        export non encore confirmé par un relevé PDF »), `role="status"` (pas `alert`) ;
        `reconciliation/[hash].vue` affiche déjà le badge via `isDegraded` (vérifier).
- [x] **T3 — Lecteur de classeur et format d'export** (AC 1, 2, 6, 8, 10)
  - [x] `yarn add exceljs` (4.4.0, MIT). Seul importateur : `server/services/spreadsheet-extractor.ts`.
  - [x] `spreadsheet-extractor.ts` : `readWorkbook(buffer)` → grilles neutres (voir Dev Notes,
        « Normalisation des cellules ») et `extractExport(buffer, bank): Promise<RawExport>`.
  - [x] `server/services/bank-formats/credit-mutuel-export.ts` : **fonction pure** sur les grilles —
        reconnaissance, choix de la feuille du compte courant, lecture des opérations, de la ligne
        `Solde au`, collecte des identifiants, `ignoredSheets`. Lève `ExportFormatError(reason)` (à
        déclarer dans `bank-formats/types.ts`) ou `BankMismatchError`.
  - [x] `server/services/bank-formats/identity.ts` : `maskAccountNumbers(text, knownNumbers)` —
        remplacement exact des numéros connus, puis motif « ≥ 10 chiffres » (D42 couches 2 et 3) ;
        les suites de 7 chiffres (chèques) restent lisibles. Pure, réutilisable par 28.2.
  - [x] Tests purs `credit-mutuel-export.test.ts` (grilles construites en mémoire, sans `exceljs`) et
        `identity.test.ts` (voir Tests).
- [x] **T4 — `categorizeLabels` sans dupliquer validation ni relance** (AC 1, 6)
  - [x] `server/services/llm-categorizer.ts` : extraire la boucle de conformité (MAX_ATTEMPTS, message
        de rejet renvoyé au modèle) en une fonction interne générique paramétrée par
        `systemPrompt`, `userMessage`, `schema`, `schemaName`, `validate` ; `callProvider` reçoit
        `schemaName` (garder `'bank_statement_transactions'` pour `categorizeStatement`).
        `categorizeStatement` : **comportement et tests inchangés**.
  - [x] `categorizeLabels(labels, availableCategories): Promise<string[]>` — codes alignés par
        index ; `labels` vide → `[]` **sans appel** ; schéma `{ labels: [{ index, categoryItemCode }] }` ;
        validation : chaque index de `0..n-1` présent **exactement une fois**, chaque code dans le
        référentiel fourni ; repli `FALLBACK_ITEM_CODE` nommé comme pour les relevés.
  - [x] `shared/constants/bank-statement-llm-prompt.ts` : `LABELS_PROMPT_VERSION = 1`,
        `LABELS_CATEGORIZATION_SYSTEM_PROMPT`, `buildLabelsUserMessage(labels, categories,
        fallbackCode)` réutilisant `renderReferential` (même fichier) et reprenant les règles 3
        (mouvement interne) et 4 (repli) ; aucune règle d'extraction, de montant ni de date.
  - [x] Tests `llm-categorizer.test.ts` : nominal ; index manquant / dupliqué → relance puis
        `LlmExtractionError` ; code inconnu → relance ; liste vide → aucun appel ; relance
        passagère réutilisée (5xx puis succès) ; tests de `categorizeStatement` inchangés et verts.
- [x] **T5 — Orchestration `ingestExport`** (AC 1 à 8)
  - [x] Dans `server/services/statement-ingestion-orchestrator.ts` : extraire en helpers **privés**
        ce que les deux chemins partagent (dédup par hash, chargement des postes proposés au
        modèle, traduction des erreurs LLM, chargement des règles, recherche de chevauchement, table
        code → id) ; `ingestStatement` garde **exactement** son comportement (sa suite de tests est
        le filet). Exporter `ingestExport(args)` — pipeline dans Dev Notes.
  - [x] Exclure `CARD_UNDETAILED_ITEM_CODE` des postes proposés au modèle, **dans les deux
        chemins** (même raison que `JOINT_REIMBURSEMENT_ITEM_CODE`).
  - [x] `server/utils/file-storage.ts` : sauvegarde sous `{hash}.xlsx` (paramètre d'extension) ;
        la suppression par hash retire `.pdf` **et** `.xlsx` (le remplacement FR6 d'un export par un
        PDF, ou l'inverse, ne doit pas laisser d'orphelin).
  - [x] `shared/schemas/api-errors.ts` : `StatementFormatUnrecognized:
        'statement_format_unrecognized'` (nom d'AR39, que 28.2 réutilisera) ;
        `app/composables/useApiError.ts` : message FR (le `Record` l'impose au typecheck).
  - [x] `shared/schemas/ingestion-result.schema.ts` : `source` (requis, `'pdf'` renvoyé par
        `ingestStatement`), `ignoredSheets` et `cardAggregateMonths` optionnels.
  - [x] `statement-ingestion-orchestrator.test.ts` : le `vi.mock` de `llm-categorizer` doit exposer
        `categorizeLabels` ; tests listés dans Tests.
- [x] **T6 — Endpoint : accepter un `.xlsx`** (AC 1, 7, 8)
  - [x] `server/api/statements/index.post.ts` : détection par **octets magiques** — `%PDF-` →
        `ingestStatement` ; `PK\x03\x04` (zip OOXML) → `ingestExport` ; `D0 CF 11 E0` (`.xls`
        ancien format) → `400 validation_failed` « format .xls non pris en charge » ; autre →
        `400 validation_failed`. `MAX_PDF_BYTES` → `MAX_FILE_BYTES` (10 Mo inchangé). `bank`,
        `X-Confirm-Replace` et `requireProfile` inchangés.
- [x] **T7 — Front** (AC 2, 3, 4)
  - [x] `app/components/ingestion/PdfDropZone.vue` : accepter `.xlsx` (type
        `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, ou type vide /
        `application/octet-stream` + extension) ; `accept="application/pdf,.xlsx,…"` ; textes
        neutres : « relevés PDF ou export Excel » (aria-label, titre, motif de rejet « n'est ni un PDF
        ni un export Excel »). Garder le nom du composant (pas de renommage gratuit).
  - [x] `app/components/ingestion/IngestionQueue.vue` : pour `result.source === 'export'`, badge
        « Non vérifié », feuilles ignorées, mois d'achats carte non détaillés (libellés « octobre
        2025 », pas `2025-10`).
  - [x] `app/composables/useStatements.ts` : types à jour ; `statement_format_unrecognized` **non**
        relançable.
- [x] **T8 — Fixture synthétique, test de bout en bout, garde de frontière** (AC 9, 10)
  - [x] `server/services/generate-synthetic-export.test.ts` (gardé par `GENERATE_FIXTURE`, comme
        `bank-formats/generate-synthetic-fixture.test.ts`) → `tests/fixtures/statements/credit-mutuel-export.xlsx`.
  - [x] `server/services/spreadsheet-extractor.test.ts` : `extractExport` sur la fixture — opérations,
        signes, solde, période, `ignoredSheets`, lignes carte, identifiants collectés ; et
        `extractExport(fixture, 'boursorama')` → `BankMismatchError`.
  - [x] Test d'architecture des frontières d'import (voir Dev Notes) — **il n'existe pas encore**.
  - [x] E2E `tests/e2e/import-export.spec.ts` : la zone de dépôt accepte le `.xlsx` ; dépôt sous
        Boursorama → message `bank_mismatch` affiché, rien dans la liste. L'import complet ne tourne
        qu'avec `MISTRAL_API_KEY` (`test.skip`, comme les autres specs).
- [x] **T9 — Clôture** : `yarn test:run`, `yarn lint`, `yarn typecheck`, `yarn test:e2e` verts ;
      import réel du fichier de `_data/raw/` sur une **copie** de la base de dev (après
      `yarn db:migrate-safe`) : nombre de lignes, solde final égal à la cellule `Solde au`, badge
      « Non vérifié », mois carte listés. Consigner les **comptes** (jamais les valeurs) dans le
      Debug Log. Revue `pr-reviewer`.

## Dev Notes

### Structure de l'export réel — décrite, jamais recopiée

Relevée sur le fichier réel (lecture seule, valeurs masquées). **Tous les exemples ci-dessous sont
inventés**, de même forme que le réel.

- Fichier `.xlsx` (zip OOXML, octets `PK\x03\x04`), ~35 Ko pour un an. **Quatre feuilles** :

| # | Nom (forme) | État | Contenu |
|---|---|---|---|
| 1 | `Vos comptes` | visible | Situation : `A1` « Votre situation financière au jj/mm/aaaa » (fusion A1:D1) ; ligne 3 d'en-tête `Compte \| R.I.B. \| Solde \| Dev` ; une ligne de synthèse puis une ligne **par compte** (livrets, épargne, compte courant, crédit…) avec son RIB en colonne B (`10000 12345 00012345678`), son solde (nombre, parfois négatif) et `EUR`. |
| 2 | `Cpt 12345 00012345678` — **le nom de la feuille contient le numéro de compte** | visible | Le compte courant, détaillé ci-dessous. Seule feuille de détail du fichier réel. |
| 3, 4 | noms techniques en minuscules | **`veryHidden`** | Tables internes ; l'une liste des comptes avec leur numéro. Jamais lues. |

- **Feuille du compte courant** (lignes réelles) :
  - `A1` (fusion A1:F1) : « Situation de votre compte C/C EUROCOMPTE … » — c'est ce titre qui
    désigne un compte courant (`C/C`, comme les titres de section de D42).
  - `A2` (fusion A2:F2) : « R.I.B. : 10000 12345 00012345678 » (banque 5 chiffres, guichet 5,
    compte 11).
  - Ligne 3 : `D3` « Solde initial : », `F3` **formule** `=F<fin>-SUM(D…)-SUM(E…)`, `G3` `EUR`.
  - `A4` (fusion A4:G4) : « Liste de vos comptes », **lien hypertexte** (valeur `{ text, hyperlink }`).
  - **Ligne 5 = en-tête** : `Date | Valeur | Libellé | Débit | Crédit | Solde | Dev`.
  - Lignes 6 à N : une opération par ligne. `A` et `B` = **cellules date** (format `mm-dd-yy`,
    heure 00:00) ; `C` = libellé texte (≤ 80 caractères, jamais de saut de ligne) ; **`D` Débit =
    nombre NÉGATIF** (déjà signé) ; `E` Crédit = nombre positif ; jamais les deux sur une ligne,
    jamais aucun ; ≤ 2 décimales ; `F` Solde = **formule** (`=F<n-1>+D<n>+E<n>`, la première avec un
    `IF(…<>"NA",…)`) ; `G` = `EUR`. Opérations **triées par date croissante** (ne pas s'y fier :
    calculer min/max). La date de valeur peut précéder ou suivre la date d'opération.
  - Une ligne vide, puis la ligne **`Solde au jj/mm/aaaa : `** : texte en `D` (fusion D:E), **valeur
    numérique en `F`** (colonne Solde — pas une formule), `EUR` en `G`. Dans le réel, sa date est le
    **lendemain** de la dernière opération.
  - Dernière ligne : « Liste de vos comptes » (fusion A:G).
- **Aucune formule n'a de valeur en cache** : `F3` (« Solde initial ») et toute la colonne `Solde`
  sont **vides** à la lecture. Ne jamais lire `cell.result`, ne jamais évaluer une formule : le seul
  solde fiable est la cellule `Solde au`. D'où le solde de départ **déduit** (D44).
- Libellés : environ un tiers contiennent une suite de **≥ 10 chiffres** (références SEPA de 15
  chiffres, forme `VIR SEPA SOCIETE FICTIVE 123456789012345`) ; une vingtaine contiennent un groupe
  isolé de 5 chiffres (codes postaux, par ex.). Aucun ne contient le numéro de compte de la feuille
  dans le fichier réel — la couche « correspondance exacte » reste obligatoire (D42, `VIR PEL
  <numéro>` sur les relevés PDF).
- Lignes `RELEVE CARTE` : libellé **exactement** `RELEVE CARTE` (sans suffixe), toujours au débit,
  **une par mois** (onze mois sur l'export réel).
- Cohérence vérifiée : le `Solde au` de la feuille 2 est égal au solde du compte courant en feuille 1.
  Ne pas en faire une règle de refus (inutile), mais c'est un bon contrôle manuel à T9.

### Découpage retenu (même principe que D41 : lecture confinée, format pur)

```
server/services/spreadsheet-extractor.ts          ← SEUL import d'exceljs (AR42)
  readWorkbook(buffer): Promise<SheetGrid[]>        exceljs → grilles neutres
  extractExport(buffer, bank): Promise<RawExport>   readWorkbook + format pur
server/services/bank-formats/credit-mutuel-export.ts ← pur, testable sans binaire
server/services/bank-formats/identity.ts           ← maskAccountNumbers (partagé avec 28.2)
```

`credit-mutuel-export.ts` n'implémente **pas** `BankFormat` (qui est un contrat sur texte de PDF) :
une seule banque exporte aujourd'hui, pas d'interface pour un seul membre (Rule of Three).

**Normalisation des cellules (`readWorkbook`)** — `SheetGrid = { name: string, hidden: boolean,
rows: GridCell[][] }`, `GridCell = null | { kind: 'text', value } | { kind: 'number', value } |
{ kind: 'date', iso } | { kind: 'formula' }` :
- `worksheet.state !== 'visible'` → `hidden: true` (`'hidden'` et `'veryHidden'`).
- `Date` → ISO `YYYY-MM-DD` via **getters UTC** (`exceljs` rend minuit UTC ; `getDate()` local
  décalerait d'un jour à l'ouest de Greenwich).
- `{ formula }` / `{ sharedFormula }` → `{ kind: 'formula' }`, **sans** `result`.
- `{ richText: [...] }` → texte concaténé ; `{ text, hyperlink }` → `text`.
- **Cellules fusionnées** : `exceljs` renvoie la valeur du maître sur chaque cellule esclave (une
  « Solde au » fusionnée D:E apparaîtrait deux fois). Ne garder que le maître
  (`cell.isMerged && cell.master !== cell` → `null`).
- Typage : `workbook.xlsx.load` attend un `ArrayBuffer`/`Buffer` ; avec TypeScript 6 le générique de
  `Buffer` peut ne pas passer — convertir proprement
  (`buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)`), pas de `any`.
- Import : `import ExcelJS from 'exceljs'` puis `new ExcelJS.Workbook()`.

**Règles du format (`credit-mutuel-export.ts`)** — tout écart lève `ExportFormatError(reason)`,
traduit en `400 statement_format_unrecognized` avec `data: { reason }` (raison **sans valeur**
lue : un numéro de ligne, jamais un libellé ni un montant) :
- **Feuille de compte** = feuille dont une ligne vaut exactement, après normalisation (casse,
  accents, espaces), `date | valeur | libelle | debit | credit | solde | dev`. Les colonnes sont
  localisées **par leur en-tête**, pas par index fixe.
- **Reconnaissance** d'un export Crédit Mutuel = au moins une feuille de compte, portant une ligne
  `R.I.B. :` au-dessus de l'en-tête et une ligne `Solde au jj/mm/aaaa` en dessous. Aucune → format
  non reconnu. Reconnu mais `bank !== 'credit_mutuel'` → `BankMismatchError(bank, 'credit_mutuel')`
  (réutiliser la classe existante). **Ordre** : reconnaître d'abord, puis comparer la banque —
  un `.xlsx` quelconque sous Boursorama doit dire « format non reconnu », pas « mauvaise banque ».
- **Compte courant** = feuilles de compte dont le titre (lignes au-dessus de l'en-tête) contient
  `C/C`, `COMPTE COURANT` ou `COMPTE CHEQUES` (mêmes motifs que D42). **Zéro ou plusieurs → refus**,
  jamais de choix arbitraire.
- **Opération** = ligne sous l'en-tête dont la cellule `Date` est une date. Libellé : texte non vide
  (sinon refus — NFR15, ne rien inventer), `trim()`. Montant : **exactement une** des cellules
  Débit / Crédit est un nombre non nul ; **Débit doit être < 0, Crédit > 0** — pris tels quels, puis
  `eurosToCents` (jamais `* 100`, jamais `Math.abs`, jamais de négation « pour corriger »). Signe
  inattendu, deux cellules ou aucune → refus : un export dont la convention a changé doit s'arrêter,
  pas être lu à l'envers.
- **Solde** : exactement une ligne dont un texte commence par `Solde au jj/mm/aaaa` ; le montant est
  le **nombre** de la colonne Solde sur cette ligne (`eurosToCents`). Date lue par `frDateToIso`
  (`bank-formats/fr-parsing.ts`). Absente, en double ou non numérique → refus.
- **Période** : `periodStart` = plus petite date d'opération ; `periodEnd` = date du `Solde au`. Une
  opération postérieure à `periodEnd` → refus. Aucune opération → refus.
- **Identifiants collectés** (pour `maskAccountNumbers`) : tout groupe de **≥ 5 chiffres** lu dans
  les noms de **toutes** les feuilles, dans la ligne `R.I.B.` de la feuille retenue et dans la
  colonne `R.I.B.` de `Vos comptes`, plus chaque RIB complet (avec et sans espaces).
- **`ignoredSheets`** : nom de chaque autre feuille, dans l'ordre du classeur, **suites de chiffres
  remplacées** (`Cpt 12345 00012345678` → `Cpt … …`) ; les feuilles masquées suffixées
  « (masquée) ». La feuille retenue n'y figure pas.

`RawExport = { operations: { transactionDate, label, amountCents: Cents }[], closingBalanceCents:
Cents, periodStart, periodEnd, knownNumbers: string[], ignoredSheets: string[] }`.

### `maskAccountNumbers` — deux couches de D42, appliquées aux seuls libellés transmis

1. Remplacement **exact** de chaque numéro connu (le plus long d'abord) par `[COMPTE]`.
2. Toute suite restante de **≥ 10 chiffres** → `[NUMÉRO]`.
Les suites de 7 chiffres (chèques) et les groupes de 5 chiffres non collectés restent intacts. La
couche 1 peut masquer un code postal égal au code guichet : faux positif assumé, sans conséquence.

**Stockage** : le libellé est **persisté tel que lu** (la base est locale, les règles de classement
et la recherche portent sur le libellé bancaire réel) ; **seul le texte transmis** est masqué. Choix
signalé en question ouverte.

### Pipeline `ingestExport` (ordre imposé)

```
1. sha256(buffer) → dédup globale par hash (D37)       → 409 pdf_already_ingested
2. extractExport(buffer, bank)                          → 400 statement_format_unrecognized | bank_mismatch
   bank = requested ?? currentProfile.defaultBank (requireCurrentProfile, comme ingestStatement)
3. Chevauchement de période DANS LE PROFIL (FR6)        → 409 period_overlap si !confirmReplace
   ↑ AVANT l'appel au modèle : la période est connue sans lui ; un utilisateur qui annule ne paie rien.
4. Postes proposés au modèle (helper partagé, sans JOINT_REIMBURSEMENT ni CARD_UNDETAILED)
   + id de CARD_UNDETAILED dans le profil — absent → 500 categories_not_seeded, data { code }
5. Partition : RELEVE CARTE (/^RELEV[EÉ] CARTE\b/i sur le libellé trimé) | autres
6. Autres : libellés masqués, DÉDOUBLONNÉS → categorizeLabels → codes remappés par libellé
   (aucune ligne « autres » → aucun appel) ; puis applyRules sur ces seules lignes
7. Lignes carte : code = CARD_UNDETAILED_ITEM_CODE, hors modèle ET hors règles (FR84 : rangées par le code)
8. opening = closing − Σ montants (helpers de shared/types/money.ts, jamais d'arithmétique ad hoc)
9. saveFileByHash(buffer, hash, 'xlsx')  — point de rollback FS
10. reconcile() — écart 0 par construction (il ne prouve rien, d'où unverified)
11. db.transaction SYNCHRONE : DELETE des relevés remplacés ; INSERT bank_statements
    { source: 'export', bank, periodStart, periodEnd, opening, closing, gapAccepted: false,
      continuityGapCents: null, cardDetailMissing: lignesCarte > 0 } ; INSERT transactions
    (erreur → suppression du fichier sauvegardé, puis rethrow)
12. nettoyage FS des relevés remplacés (post-commit, comme aujourd'hui)
→ { hash, periodStart, periodEnd, transactionCount, isBalanced, gapCents, source: 'export',
    ignoredSheets, cardAggregateMonths: mois 'YYYY-MM' distincts et triés des lignes carte }
```

Traductions d'erreur du modèle **identiques** à `ingestStatement` (`LlmConfigError` testé avant
`LlmUnavailableError`) — c'est précisément le helper à extraire, pas à recopier.

**Pas de garde « dates hors période » (story 17.4)** : les dates viennent de cellules, pas du modèle ;
la règle « opération postérieure au `Solde au` → refus » du format la remplace.

**Chevauchement export / PDF, en attendant 28.2** : un relevé PDF déposé sur la période d'un export
déclenche aujourd'hui FR6 (remplacer ou annuler) — confirmer supprimerait l'export. C'est le
comportement existant, assumé jusqu'au raccord de 28.2. Ne pas l'anticiper ici.

### `deriveReliability` — ordre de priorité

```ts
deriveReliability({ gapCents, gapAccepted, source, continuityGapCents }):
  gapAccepted                         → 'gap_accepted'     // décision de l'utilisateur, prime (inchangé)
  gapCents !== 0                      → 'gap_unreviewed'   // écart interne (ligne manuelle ajoutée…)
  source === 'export' && continuity === null → 'unverified'
  source === 'export' && continuity !== 0    → 'gap_unreviewed'
  sinon                               → 'reliable'
```

`isDegraded('unverified') === true` (dégradé au sens de l'affichage, D44). `worstReliability` :
`gap_unreviewed` > `unverified` > `gap_accepted` > `reliable` (inconnu pire qu'assumé — à valider,
cf. questions). `unreliableStatements` de `analysis.get.ts` inclut donc les exports non vérifiés :
le texte de l'alerte doit le dire (« relevé(s) non vérifié(s) », pas « présentent un écart »).
L'affichage de `continuity_gap_cents` comme montant d'écart est **28.2**.

### Migration 0011 — insertion conditionnelle du poste

Après le SQL généré (trois `ALTER TABLE bank_statements ADD COLUMN …`) :

```sql
--> statement-breakpoint
-- Story 28.4 (FR84, D44) — poste « Carte (non détaillée) » sur chaque profil DÉJÀ peuplé.
-- Conditionné à l'existence de la rubrique `divers` : sur une base neuve (E2E), rien n'est
-- inséré et le seed porte le poste depuis DEFAULT_REFERENTIAL (cf. 0009). OR IGNORE + index
-- unique (profile_id, code) : rejouable.
INSERT OR IGNORE INTO `category_items` (`profile_id`, `code`, `group_id`, `label`, `nature`, `position`, `created_at`)
SELECT g.`profile_id`, 'divers-carte-non-detaillee', g.`id`, 'Carte (non détaillée)', 'expense',
  (SELECT COALESCE(MAX(i.`position`), -1) + 1 FROM `category_items` i WHERE i.`group_id` = g.`id`),
  strftime('%s','now')
FROM `category_groups` g WHERE g.`code` = 'divers';
```

Appliquer sur la base réelle par `yarn db:migrate-safe` (sauvegarde vérifiée, comptages
avant/après), jamais par `apply-migration` nu ni `drizzle push`.

### Test d'architecture des frontières d'import (à créer)

D44 dit « ajoutée au test qui garde déjà `unpdf` et le SDK du fournisseur » : **ce test n'existe
pas**. `server/api/architecture.test.ts` ne garde que `requireProfile`, et ESLint n'a aucune
restriction d'import. Créer `server/services/import-boundaries.test.ts` : parcourir `server/`,
`shared/`, `app/` (hors `node_modules`, `.nuxt`), lire chaque `.ts`/`.vue` et échouer si un fichier
importe (`from 'x'` ou `from 'x/…'`) :

| Module | Seuls fichiers autorisés |
|---|---|
| `unpdf` | `server/services/pdf-extractor.ts` |
| `@mistralai/mistralai` | `server/services/llm-categorizer.ts` (+ `llm-categorizer.test.ts`, qui le mocke) |
| `exceljs` | `server/services/spreadsheet-extractor.ts` (+ `server/services/generate-synthetic-export.test.ts`) |

Exemptions **nommées**, pas par motif (même leçon que la revue de 27.3). Garde « a trouvé des
fichiers » comme dans `architecture.test.ts`. `generate-synthetic-fixture.test.ts` (Boursorama)
n'importe pas `unpdf` (vérifié) : aucune exemption à prévoir pour lui.

### Fixture synthétique (AC 9) — `tests/fixtures/statements/credit-mutuel-export.xlsx`

Générée par `server/services/generate-synthetic-export.test.ts`, gardé par `GENERATE_FIXTURE=1`
(`GENERATE_FIXTURE=1 yarn test:run generate-synthetic-export`). Reproduire la **structure** : quatre
feuilles (`Vos comptes` ; `Cpt 12345 00012345678` ; deux feuilles `veryHidden` aux noms techniques
inventés, dont une listant un faux numéro), fusions (titre, R.I.B., « Liste de vos comptes »
hyperlien, « Solde au » D:E), formule `Solde initial` en `F3` et formules en colonne Solde **sans
valeur en cache**, cellules date au format `mm-dd-yy`, Débit négatif, ligne vide puis `Solde au`,
ligne finale. **Contenu entièrement inventé** : RIB `10000 12345 00012345678`, titre « C/C
EUROCOMPTE FICTIF », une quinzaine d'opérations sur trois mois, dont **deux `RELEVE CARTE` sur deux
mois distincts**, un libellé `VIR PEL 00012345678` (numéro de compte planté dans un libellé), un
libellé avec une référence de 15 chiffres, un libellé `CHQ 1234567` (7 chiffres, doit survivre), un
remboursement au crédit. Solde final calculé depuis les lignes inventées, date = lendemain de la
dernière opération. **Jamais le fichier réel, ni une valeur qui en proviendrait** (dépôt public).

Le classeur est binaire : ses octets varient à chaque génération (horodatage) — le générer une fois,
le committer, ne pas le régénérer sans raison.

### Tests (récapitulatif)

- `credit-mutuel-export.test.ts` (grilles en mémoire) : nominal ; Débit positif → refus ; Crédit
  négatif → refus ; Débit et Crédit remplis → refus ; aucun → refus ; libellé vide → refus ; `Solde
  au` absent / double → refus ; zéro ou deux feuilles « compte courant » → refus ; en-tête dans un
  autre ordre de colonnes → lu correctement ; opération après `Solde au` → refus ; reconnu sous
  `boursorama` → `BankMismatchError` ; grille quelconque → `ExportFormatError` ; `ignoredSheets`
  sans chiffres.
- `identity.test.ts` : numéro connu dans un libellé → masqué ; ≥ 10 chiffres → masqué ; chèque 7
  chiffres → intact ; numéros connus qui se recouvrent → le plus long d'abord.
- `spreadsheet-extractor.test.ts` : fixture → comptes, signes, période, solde, cellules fusionnées
  non dupliquées, formules ignorées, feuilles masquées détectées.
- `statement-ingestion-orchestrator.test.ts` (base SQLite temporaire, `categorizeLabels` mocké) :
  import nominal → `source = 'export'`, `opening = closing − Σ`, `continuity_gap_cents IS NULL`,
  `card_detail_missing = 1`, lignes carte sur le bon poste **et absentes de l'appel**, `ignoredSheets`
  et `cardAggregateMonths` rendus ; **texte transmis** (arguments de `categorizeLabels`) : aucun faux
  identifiant planté, aucun montant, aucun titre de feuille, aucun « Solde », aucun « R.I.B. » ;
  libellés dédoublonnés ; même fichier deux fois → 409, modèle non appelé ; sous Boursorama →
  `bank_mismatch`, modèle non appelé, aucun fichier, aucune ligne ; `.xlsx` non reconnu →
  `statement_format_unrecognized`, idem ; chevauchement sans confirmation → 409 **sans appel au
  modèle** ; poste carte absent → 500 `categories_not_seeded` ; tous les tests PDF existants verts
  sans modification d'assertion.
- `statement-reliability.test.ts`, test de migration 0011, `import-boundaries.test.ts`,
  `llm-categorizer.test.ts` : voir tâches.
- Tests de lecture existants (`statements/index.get.test.ts`, `[hash].get.test.ts`,
  `analysis.get.test.ts`, `transactions/index.get.test.ts`, `reconciliation/[hash].post.test.ts`) :
  ajouter un cas export `unverified` là où la fiabilité est exposée.

### Ce qui existe et doit être préservé

- `ingestStatement` : ordre des étapes, codes d'erreur, garde des soldes avant l'appel (17.5), garde
  des dates (17.4), règles après le modèle, écriture synchrone, rollback FS. Tout refactor en helpers
  est **iso-comportement**.
- `categorizeStatement` : prompt v4, schéma `bank_statement_transactions`, deux tentatives de
  conformité × une relance passagère (pire cas quatre appels, borné et assumé).
- Refus croisé `bank_mismatch` des PDF (28.1), fixture Boursorama, `detectBank`.
- `gap_accepted` : décision persistée, prioritaire ; `accept_gap` refusé sans écart (un export neuf
  n'a pas d'écart interne : le bouton ne doit pas devenir une porte de sortie de « non vérifié »).
- Aucune donnée d'un profil visible d'un autre : `ingestExport` passe par `requireCurrentProfile`,
  chevauchement et postes lus **dans le profil**.

### Garde-fous (règles du projet)

- `Cents` partout ; `eurosToCents` sur les cellules ; aucun `parseFloat`, `* 100`, `Math.abs`.
- Frontières : `exceljs` ← `spreadsheet-extractor.ts` seul ; SDK ← `llm-categorizer.ts` seul ;
  `unpdf` ← `pdf-extractor.ts` seul.
- Erreurs métier via `domainError` et codes stables ; pas de `try/catch` qui avale.
- Énumérations en anglais (`export`, `unverified`), libellés FR à l'écran ; codes de poste en
  français (`divers-carte-non-detaillee`).
- Composants sans `$fetch`. Pas de `console.log`.
- **Dépôt public** : aucune valeur de `_data/raw/comptes.xlsx` dans le code, les tests, la fixture,
  les messages de commit ni le Debug Log. Le fichier réel ne se copie **jamais** dans `tests/`.
- Commits : fichiers nommés un à un, jamais `git add -A`.

### Project Structure Notes

- Nouveaux fichiers conformes à D41/D44 : `server/services/spreadsheet-extractor.ts`,
  `server/services/bank-formats/credit-mutuel-export.ts`, `server/services/bank-formats/identity.ts`,
  `shared/types/statement-source.ts`, `tests/fixtures/statements/credit-mutuel-export.xlsx`.
- `card_detail_missing` naît ici (D44 le dit explicitement) : **28.3 ne la recrée pas**, elle ajoute
  seulement l'état dérivé et l'écriture côté PDF. Le fichier de story 28.3 (rédigé le 2026-09-22)
  prévoit encore de poser la colonne : à ajuster à sa reprise.
- 28.2 réutilisera `ExportFormatError`/`statement_format_unrecognized`, `maskAccountNumbers` et
  écrira `continuity_gap_cents`.
- Variante : nom `PdfDropZone.vue` conservé bien qu'il accepte désormais un `.xlsx` (renommer
  toucherait `import.vue` et les specs E2E sans gain).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 28.4] · [#Epics 27 et 28 — dépendances (28.4 avant 28.2)] · AR42
- [Source: _bmad-output/planning-artifacts/prd.md — FR5, FR6, FR12, FR78, FR82, FR83, FR84 ; NFR6, NFR36]
- [Source: _bmad-output/planning-artifacts/architecture.md#D44 (fait foi), #D37 (hash global), #D40, #D41, #D42 (identité en trois couches, motifs de compte courant), #D43]
- [Source: server/services/statement-ingestion-orchestrator.ts — étapes 1 à 11]
- [Source: server/services/llm-categorizer.ts — callProvider, callProviderWithRetry, validate, categorizeStatement]
- [Source: shared/constants/bank-statement-llm-prompt.ts — renderReferential, règles 3 et 4]
- [Source: shared/types/statement-reliability.ts ; server/utils/statement-reliability.ts]
- [Source: server/db/migrations/0009_joint_account_share.sql — modèle d'insertion conditionnelle]
- [Source: server/services/bank-formats/generate-synthetic-fixture.test.ts — modèle de fixture gardée]
- [Source: _bmad-output/implementation-artifacts/28-1-choisir-la-banque-d-un-releve.md — fixture 100 % synthétique exigée après revue, `watch` sur l'id du profil, `page.route(...).postDataBuffer()` pour lire un multipart en E2E]

### Questions ouvertes (ne bloquent pas le démarrage ; défaut retenu entre parenthèses)

1. **Sens du mouvement transmis au modèle ?** Sans montant ni marqueur `[DÉBIT]/[CRÉDIT]`, `VIR SEPA
   …` est ambigu entre recette et dépense : le taux de correction peut en pâtir. D44 dit « que des
   libellés ». **Tranché le 2026-09-26 (architecte) : chaque libellé part avec son sens, via les
   marqueurs `[DÉBIT]` / `[CRÉDIT]` déjà utilisés par le chemin PDF — jamais avec le montant.** Le
   sens ne révèle rien de plus que le libellé et lève l'ambiguïté recette / dépense.
2. **Libellé persisté masqué ou brut ?** (défaut : brut en base, masqué à la transmission).
3. **`unverified` pire que `gap_accepted` dans `worstReliability` ?** (défaut : oui).
4. **État d'un export avec `card_detail_missing` une fois confirmé par 28.2** : `reliable` ou
   `card_detail_missing` ? À trancher en 28.3, qui introduit l'état.

## Dev Agent Record

### Agent Model Used

Agent de développement.

### Debug Log References

- T9, vérification manuelle sur le vrai fichier `_data/raw/comptes.xlsx` (lecture seule, jamais
  copié, base et vérification jetables, `extractExport` avec `readWorkbook`, aucun appel LLM) :
  4 feuilles (2 masquées), 353 opérations, 3 feuilles ignorées, 19 identifiants connus collectés,
  250 lignes débit / 103 crédit (somme = total des opérations), 11 lignes `RELEVE CARTE` (une
  par mois environ, cohérent avec la description du fichier réel dans les Dev Notes), solde
  déduit fini, toutes les dates dans `[periodStart, periodEnd]`. Aucune valeur (libellé, montant,
  date, numéro) n'a été consignée ici ni ailleurs — seuls des comptes.
- `yarn test:run` : 808 passés, 9 skippés (générateurs de fixtures gardés par `GENERATE_FIXTURE`,
  et l'E2E LLM-dépendant côté Vitest n'existe pas — les 9 skips sont les deux fichiers de fixture
  gardés `describe.skipIf`, comptés en tests).
- `yarn lint`, `yarn typecheck` : verts.
- `yarn test:e2e` : 47 passés, 8 skippés (tous LLM-dépendants, `MISTRAL_API_KEY` absent de cet
  environnement) — aucun échec, aucune régression sur la suite existante.

### Completion Notes List

- Analyse de contexte terminée — guide de développement complet rédigé.
- T1 : colonnes `source`/`continuity_gap_cents`/`card_detail_missing` posées sur `bank_statements`
  (Drizzle + migration 0011 générée puis complétée à la main par l'insertion conditionnelle du
  poste « Carte (non détaillée) »), `CARD_UNDETAILED_ITEM_CODE` ajouté au référentiel par défaut
  (divers, 14e poste) et protégé. Test de migration dédié (5 cas : ajout de colonnes, poste créé
  sur chaque profil peuplé, base vierge non touchée, idempotence, relevés existants inchangés).
- T2 : `deriveReliability` prend désormais un objet `{ gapCents, gapAccepted, source,
  continuityGapCents }` — typecheck en a forcé la mise à jour des trois appelants
  (`server/utils/statement-reliability.ts`, `[hash].get.ts`, `reconciliation/[hash].post.ts`).
  Nouvel état `unverified` (badge `?`, `badge--warn`), priorité dans `worstReliability` entre
  `gap_unreviewed` et `gap_accepted`.
- T3 : `spreadsheet-extractor.ts` (seul importateur d'`exceljs`) produit des grilles neutres
  (`SheetGrid`/`GridCell`, déclarées dans `bank-formats/types.ts` pour rester partageables sans
  dépendance à `exceljs`) ; `bank-formats/credit-mutuel-export.ts` est une fonction PURE dessus
  (n'implémente pas `BankFormat`, Rule of Three) ; `bank-formats/identity.ts` porte
  `maskAccountNumbers`, réutilisable par 28.2.
- T4 : boucle de conformité extraite en `categorizeWithConformity` (générique), réutilisée par
  `categorizeStatement` (comportement et tests inchangés — 40/40 verts) et la nouvelle
  `categorizeLabels`. Prompt dédié `LABELS_CATEGORIZATION_SYSTEM_PROMPT` reprenant les règles 3
  (mouvement interne) et 4 (repli) uniquement. **Décision architecte du 2026-09-26 appliquée** :
  chaque libellé part avec son sens `[DÉBIT]`/`[CRÉDIT]`, jamais son montant.
- T5 : helpers partagés extraits (`guardAgainstDuplicate`, `loadAvailableCategories`,
  `guardNonEmptyCategories`, `translateLlmError`, `loadRules`, `findOverlapping`, `guardOverlap`,
  `loadItemIdByCode`) — `ingestStatement` garde exactement son comportement (sa suite de tests,
  25 cas, sert de filet et reste verte sans modification d'assertion). `ingestExport` suit le
  pipeline des Dev Notes : dédup → extraction → chevauchement (avant le modèle) → postes
  proposés (sans `JOINT_REIMBURSEMENT` ni `CARD_UNDETAILED`) → partition carte/autres → libellés
  masqués et dédoublonnés → `categorizeLabels` → règles (sur les seules lignes non-carte) →
  solde de départ déduit → sauvegarde → réconciliation (nulle par construction) → transaction
  DB → nettoyage FS. `file-storage.ts` prend un paramètre d'extension (`pdf`/`xlsx`) ;
  `deletePdfByHash` supprime les deux extensions (remplacement export ↔ PDF, FR6).
- T6 : détection par octets magiques (`%PDF-`, `PK\x03\x04`, `D0 CF 11 E0` pour l'ancien `.xls`
  explicitement refusé) — jamais par extension de nom de fichier ni Content-Type déclaré.
- T7 : `PdfDropZone.vue` accepte `.xlsx` (type MIME ou repli sur l'extension) ; `IngestionQueue.vue`
  affiche badge « Non vérifié », feuilles ignorées et mois carte (`formatMonth` : « octobre
  2025 », jamais `2025-10`) pour `result.source === 'export'` ; `useApiError.ts` porte le message
  FR de `statement_format_unrecognized` (non listé dans `RETRYABLE_ERROR_CODES`, donc non
  relançable par construction).
- T8 : fixture `tests/fixtures/statements/credit-mutuel-export.xlsx` générée par
  `generate-synthetic-export.test.ts` (gardé `GENERATE_FIXTURE`, contenu entièrement inventé :
  RIB, titre, 15 opérations sur 3 mois, 2 `RELEVE CARTE` sur 2 mois distincts, un numéro de
  compte planté dans un libellé `VIR PEL`, une référence à 15 chiffres, un chèque à 7 chiffres,
  un remboursement au crédit). `import-boundaries.test.ts` garde `unpdf`/SDK Mistral/`exceljs`
  chacun à son seul fichier autorisé (+ tests qui les mockent). E2E `import-export.spec.ts` :
  dépôt `.xlsx` accepté côté client, refus `bank_mismatch` sous Boursorama, refus explicite
  `.xls`/fichier non reconnu, scénario complet skippé sans `MISTRAL_API_KEY` (comme les specs
  PDF existantes).
- T9 : suite complète verte (unitaires, lint, typecheck, E2E) ; vérification manuelle du vrai
  fichier via un test temporaire jamais committé (supprimé après exécution) — voir Debug Log.

### Revue `pr-reviewer` — corrections appliquées

Retour « CHANGEMENTS REQUIS » (1 BLOQUANT). Tous les points corrigés dans ce worktree, sans commit :

- **BLOQUANT** — `ingestStatement` n'excluait que `JOINT_REIMBURSEMENT_ITEM_CODE` des postes
  proposés au modèle : `CARD_UNDETAILED_ITEM_CODE` y était encore, en contradiction avec l'AC 5.
  Corrigé (`loadAvailableCategories(profileId, [JOINT_REIMBURSEMENT_ITEM_CODE,
  CARD_UNDETAILED_ITEM_CODE])`) ; test existant (« passe au LLM les postes lus en base ») mis à
  jour pour exclure aussi ce code et l'assertion `not.toContain` ajoutée ; commentaire faux de
  `protected-categories.ts` corrigé.
- **IMPORTANT** — `ingestExport` faisait retomber silencieusement tout code inconnu sur
  `cardItemId` (`?? cardItemId`) : remplacé par le `throw domainError(LlmExtractionFailed, …)`
  du chemin PDF, à l'identique.
- **IMPORTANT** — `maskAccountNumbers` ne masquait pas un IBAN écrit par groupes (`FR76 XXXX
  XXXX …`), invisible à la couche « ≥10 chiffres consécutifs ». `maskIban` extrait dans
  `bank-formats/identity.ts`, RÉUTILISÉ par `pdf-extractor.ts::redactIdentity` (DRY, motif
  auparavant dupliqué) ; tests ajoutés (`identity.test.ts`).
- **IMPORTANT** — `ReconciliationGap.vue` affichait « ✅ Soldes équilibrés » sur un export,
  équilibre vrai par construction qui ne prouve rien (D44). Nouveau prop `source` ; message
  dédié « Export non vérifié » quand `isBalanced && source === 'export'`. `source` propagé de
  bout en bout : `[hash].get.ts` → `StatementDetailResponse` (`useReconciliation.ts`) →
  `reconciliation/[hash].vue`.
- **MINEUR** — reconstruction de l'ordre d'origine des transactions d'export : remplacé le
  `.find()` O(n²) par une repartition à deux pointeurs sur `cardOps`/`ruled.transactions`
  (sous-suites de `raw.operations` qui préservent l'ordre par construction).
- **MINEUR** — `import-boundaries.test.ts` : motif élargi à `import(` dynamique, `require(` et
  import nu (`import 'x'`), en plus de `from 'x'`.
- **MINEUR** — `Cents` au lieu de `number` sur `WithCategory.amountCents` et la signature de
  `keyOf` dans l'orchestrateur.
- **MINEUR** — `buildLabelsUserMessage` neutralise désormais les caractères de contrôle des
  libellés d'export (`cleanLabel`), comme pour les libellés de poste.

Suites relancées après corrections : `yarn test:run` (812 passés, 9 skippés), `yarn lint` (0
erreur), `yarn typecheck` (0 erreur), `yarn test:e2e` (47 passés, 8 skippés LLM-dépendants — 0
échec, aucune régression).

### File List

**Nouveaux**
- `shared/types/statement-source.ts`
- `server/db/migrations/0011_violet_invisible_woman.sql`
- `server/db/migrations/0011-violet-invisible-woman.test.ts`
- `server/db/migrations/meta/0011_snapshot.json`
- `server/services/spreadsheet-extractor.ts`
- `server/services/spreadsheet-extractor.test.ts`
- `server/services/bank-formats/credit-mutuel-export.ts`
- `server/services/bank-formats/credit-mutuel-export.test.ts`
- `server/services/bank-formats/identity.ts`
- `server/services/bank-formats/identity.test.ts`
- `server/services/generate-synthetic-export.test.ts`
- `server/services/import-boundaries.test.ts`
- `tests/e2e/import-export.spec.ts`
- `tests/fixtures/statements/credit-mutuel-export.xlsx` (binaire, synthétique)

**Modifiés**
- `package.json`, `yarn.lock` (`exceljs` 4.4.0)
- `server/db/schema.ts`
- `server/db/migrations/meta/_journal.json`
- `server/db/migrations/0010-profiles-and-category-ids.test.ts` (garde contre les migrations
  ultérieures dans `buildSchema0009`, sans lien fonctionnel avec 28.4)
- `server/middleware/0.bootstrap.ts`
- `server/services/bank-formats/types.ts`
- `server/services/llm-categorizer.ts`, `server/services/llm-categorizer.test.ts`
- `server/services/statement-ingestion-orchestrator.ts`, `.test.ts`
- `server/utils/file-storage.ts`
- `server/utils/statement-reliability.ts`
- `server/api/statements/index.post.ts`
- `server/api/statements/[hash].get.ts`
- `server/api/reconciliation/[hash].post.ts`
- `shared/types/statement-reliability.ts`, `.test.ts`
- `shared/constants/default-referential.ts`
- `shared/constants/protected-categories.ts`
- `shared/constants/bank-statement-llm-prompt.ts`
- `shared/schemas/api-errors.ts`
- `shared/schemas/ingestion-result.schema.ts`
- `tests/fixtures/test-schema.ts`
- `app/components/ingestion/PdfDropZone.vue`
- `app/components/ingestion/IngestionQueue.vue`
- `app/components/shared/ReliabilityBadge.vue`
- `app/composables/useApiError.ts`
- `app/pages/analyse.vue`
- `app/pages/transactions/[period].vue`

**Modifiés (corrections de revue `pr-reviewer`)**
- `server/services/pdf-extractor.ts` (`redactIdentity` réutilise `maskIban`)
- `app/components/reconciliation/ReconciliationGap.vue` (prop `source`, message export non vérifié)
- `app/composables/useReconciliation.ts` (`StatementDetailResponse.source`)
- `app/pages/reconciliation/[hash].vue` (passe `source` au composant)
