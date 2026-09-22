# Story 28.2: Lire le compte courant d'un relevé Crédit Mutuel, et lui seul

Status: ready-for-dev

> ## ⚠️ BLOQUÉE par AR41 — ne pas démarrer avant d'avoir 3 à 5 relevés Crédit Mutuel supplémentaires
>
> Cette story a été rédigée à partir d'**un seul** relevé réel (février-mars 2022). Écrire le format
> dessus figerait ses particularités comme des règles. Les relevés supplémentaires doivent couvrir au
> minimum : un **solde débiteur**, un **remboursement carte**, **deux cartes** sur le même compte, un
> **détail carte prélevé hors période**. Voir « À revérifier sur les relevés supplémentaires » en fin
> de Dev Notes : chaque règle ci-dessous marquée **[À REVÉRIFIER]** doit y être confrontée avant d'être
> codée.
>
> **Prérequis livrés :** 27.1 (colonne `bank_statements.bank`, énumération `BANKS`) et 28.1 (type
> `BankFormat`, dossier `server/services/bank-formats/`, `recognizes()` Crédit Mutuel, refus
> `bank_mismatch`, fixtures JSON Boursorama, paragraphe de prompt par banque).

## Story

En tant que titulaire d'un compte Crédit Mutuel,
je veux que mes relevés soient lus, réconciliés et catégorisés comme ceux de Boursorama,
afin de suivre mes dépenses sans rien saisir.

## Acceptance Criteria

1. **Compte courant seul (FR79).** Étant donné un relevé Crédit Mutuel contenant un compte courant, des livrets et un plan d'épargne, quand il est ingéré, alors seules les opérations de la section du compte courant sont importées.
2. **Sections ignorées nommées.** La réponse d'ingestion porte `ignoredSections: string[]` — les titres des autres sections **sans leurs numéros** (ex. `LIVRET BLEU`, `PLAN D'EPARGNE LOGEMENT`) — et l'écran de dépôt les affiche.
3. **Section sur deux pages.** Une section de compte courant dont le titre est réimprimé en tête de la page suivante reste **une seule** section ; ses opérations des deux pages sont importées.
4. **Zéro ou plusieurs comptes courants.** Si aucune section, ou plusieurs sections **distinctes** (numéros différents), sont reconnues comme compte courant, le relevé est refusé en `400 statement_format_unrecognized`, sans aucune ligne écrite et **sans appel au fournisseur**.
5. **Soldes.** Ouverture et clôture sont le premier et le dernier `SOLDE CREDITEUR AU jj/mm/aaaa` ou `SOLDE DEBITEUR AU jj/mm/aaaa` **de la section retenue** ; `DEBITEUR` donne un montant négatif. Les soldes des livrets et du PEL ne sont jamais lus.
6. **Période.** `periodStart` = **lendemain** de la date du solde d'ouverture ; `periodEnd` = date du solde de clôture.
7. **Relevés consécutifs (FR81).** Deux relevés Crédit Mutuel consécutifs (clôture du premier = ouverture du second) ne déclenchent **aucun** chevauchement de période.
8. **Écart (FR81).** Un relevé dont la somme des lignes ne tombe pas sur les soldes est marqué « non fiable » avec son écart, exactement comme un relevé Boursorama.
9. **Identité (NFR6, NFR36).** Le texte transmis au fournisseur ne contient ni IBAN, ni numéro de compte, ni numéro de carte — **libellés compris** (ex. `VIR PEL <numéro>`) — ni nom ou adresse du titulaire hors libellés. Les trois couches d'AR39 sont en place (voir Dev Notes). Les numéros de chèque (sept chiffres) restent lisibles.
10. **Fixtures (AR40).** Chaque relevé Crédit Mutuel de référence a sa fixture JSON anonymisée sous `tests/fixtures/statements/`, et un test vérifie soldes, période, section retenue, sections ignorées et **absence de tout faux identifiant planté** dans `operationsText`.
11. **Non-régression Boursorama.** Les tests de fixture Boursorama livrés en 28.1 passent inchangés.
12. **Hors périmètre de cette story.** La ligne `RELEVE CARTE` reste une opération ordinaire (son remplacement par le détail est 28.3). Le **bloc de détail carte n'est pas transmis** au fournisseur ici.

## Tasks / Subtasks

- [ ] **T1 — Géométrie Crédit Mutuel (AC 1, 3, 4)**
  - [ ] T1.1 Détecter l'en-tête de colonnes Crédit Mutuel : fragments **`Débit EUROS`** et **`Crédit EUROS`** (un seul fragment chacun, pas `Débit` seul) — `findDebitCreditHeader` actuel ne les reconnaît **pas** (regex `^d[ée]bit$`). Écrire un détecteur propre au format, ne pas élargir celui de Boursorama.
  - [ ] T1.2 Découper chaque page en **lignes** (`renderRows`-like, tolérance verticale 2 pt), puis le document en **sections** selon les règles « Découpage en sections » ci-dessous.
  - [ ] T1.3 Fusionner les sections de même numéro de compte d'une page à l'autre (AC 3).
  - [ ] T1.4 Sélectionner le compte courant ; 0 ou ≥ 2 comptes distincts → `ApiErrorCode.StatementFormatUnrecognized` (AC 4).
- [ ] **T2 — Soldes et période (AC 5, 6, 7)**
  - [ ] T2.1 Lire `SOLDE (CREDITEUR|DEBITEUR) AU dd/mm/yyyy <montant>` sur les **lignes de la section retenue** uniquement.
  - [ ] T2.2 Signe : `DEBITEUR` → négatif. Montant via `parseFrAmount` (format `12.345,67`).
  - [ ] T2.3 Période : `periodStart = ouverture + 1 jour` (calcul de date sans fuseau), `periodEnd = clôture`.
- [ ] **T3 — `operationsText` et identité (AC 9, 12)**
  - [ ] T3.1 Couche 1 (construction) : ne rendre que les lignes d'opérations de la section retenue, **sans** les lignes de solde, de titre, `TITULAIRE(S)`, en-tête de colonnes, pieds de page, marge gauche.
  - [ ] T3.2 Couche 2 (correspondance exacte) : collecter tous les numéros lus dans le **document entier** (titres `N° <n>`, colonne `Numéro`/`N° de compte` des tableaux de situation, lignes `IBAN :`) et les remplacer par `[COMPTE]` partout dans le texte rendu.
  - [ ] T3.3 Couche 3 (motif) : masquer toute suite restante d'au moins 10 chiffres ; appliquer ensuite `redactIdentity` (filet commun, IBAN/BIC).
  - [ ] T3.4 Marqueurs `[DÉBIT]`/`[CRÉDIT]` par colonne, comme Boursorama (séparateur = milieu des centres des deux en-têtes, **recalculé par page** : les colonnes se décalent de ~10 pt entre pages).
- [ ] **T4 — Branchement (AC 1, 2, 4, 8)**
  - [ ] T4.1 Implémenter `operationsText` et `balancesAndPeriod` dans `server/services/bank-formats/credit-mutuel.ts` ; `cardDebits` renvoie vide (28.3).
  - [ ] T4.2 Ajouter `StatementFormatUnrecognized: 'statement_format_unrecognized'` dans `shared/schemas/api-errors.ts` **avant** usage, et son message FR dans `app/composables/useApiError.ts`.
  - [ ] T4.3 Ajouter `ignoredSections: z.array(z.string())` à `IngestionResultSchema` (vide pour Boursorama) ; l'afficher dans le composant de dépôt via son composable.
  - [ ] T4.4 Vérifier que le refus de T1.4 intervient **avant** `categorizeStatement` (étape 3bis de l'orchestrateur).
  - [ ] T4.5 Compléter le paragraphe Crédit Mutuel du prompt : colonnes `Date` / `Date valeur` / `Opération` / `Débit EUROS` / `Crédit EUROS` ; **la date de l'opération est la PREMIÈRE colonne, jamais la date de valeur** ; une ligne sans date prolonge le libellé de la précédente.
- [ ] **T5 — Fixtures et tests (AC 9, 10, 11)**
  - [ ] T5.1 Capturer les pages `PositionedItem` de chaque relevé de référence via un script local passant par `pdf-extractor` (NFR21), **substituer** chaque identifiant par un faux de même forme, sérialiser en JSON.
  - [ ] T5.2 Tests : section retenue, sections ignorées, soldes, période, séparateur par page, et **pour chaque faux identifiant planté** : absent de `operationsText`.
  - [ ] T5.3 Cas limites (NFR3-style, un nominal + deux limites au moins) : solde débiteur, section sur deux pages, 0 compte courant, 2 comptes courants, numéro de chèque préservé.
  - [ ] T5.4 `yarn test:run`, `yarn lint`, `yarn typecheck` verts — sortie réelle dans le Dev Agent Record.

## Dev Notes

### Anatomie du relevé Crédit Mutuel (relevé de référence, identifiants remplacés par des faux)

Document « RELEVE ET INFORMATIONS BANCAIRES », 3 pages, A4 portrait (ordonnées PDF croissantes vers le haut). Structure observée :

```
PAGE 1
  y≈773-647  En-tête agence + adresse titulaire          ← au-dessus de l'en-tête : coupé
  y=542      RELEVE ET INFORMATIONS BANCAIRES   Caisse 99999
  y=528      04 mars 2030
  y=505      C/C EUROCOMPTE SERENITE N° 12345678901 en euros (GD)     ← TITRE DE SECTION
  y=498      €                                                         ← glyphe SÉPARÉ, x≈50, 7 pt plus bas
  y=493      TITULAIRE(S) : M JEAN EXEMPLE
  y=477      Date | Date valeur | Opération | Débit EUROS | Crédit EUROS   ← EN-TÊTE DE COLONNES
  y=458      SOLDE CREDITEUR AU 04/02/2030                  12.345,67     ← solde d'ouverture
  y=441…149  opérations (date x≈52, valeur x≈100, libellé x≈148,
             débit bord droit ≈460, crédit bord droit ≈534)
  y=107      <<Suite au verso>>                                         ← fin de page
  y≤105      Information sur la protection des comptes… / mentions légales / Page 1
  x=14       « 2 », « 0 », « X », « HT.xxxx… » : code vertical de marge   ← à exclure (x < 40)

PAGE 2
  y=770      RELEVE ET INFORMATIONS BANCAIRES   Caisse 99999
  y=733      C/C EUROCOMPTE SERENITE N° 12345678901 en euros (GD)     ← MÊME numéro : continuation
  y=721      TITULAIRE(S) : …
  y=705      en-tête de colonnes (décalé de +10 pt en x par rapport à la page 1)
  y=689…581  opérations (dont RELEVE CARTE 234,56 au débit)
  y=567      Réf : 002   SOLDE CREDITEUR AU 04/03/2030         6.789,01   ← solde de clôture, FIN DE SECTION
  y=550      IBAN : FR76 9999 9000 0012 3456 7890 123  (+ une seconde ligne de type IBAN)   ⚠️ SOUS l'en-tête
  y=522      RELEVE DE VOTRE CARTE <type> N° ------1234--- Au 21/02/2030   ← bloc détail carte (28.3)
  y=510      TITULAIRE : M JEAN EXEMPLE
  y=491      Date | Commerce | Ville | Montant euros | Montant devises
  y=475…464  achats
  y=450      TOTAL PRELEVE SUR VOTRE COMPTE 99999 99999 12345678901 AU 28/02/2030 : 234,56 euros
  y=421…404  paragraphe d'information (paiements < 10 € regroupés)
  y=362      LIVRET BLEU N° 12345678902 en euros (GE)                    ← nouvelle section
  y=334      en-tête de colonnes
  y=315      SOLDE CREDITEUR AU 04/01/2030 …
  y=298      26/02/2030 01/03/2030 VIR DE M JEAN EXEMPLE    4.000,00
  y=284      Réf : 098   SOLDE TOTAL AU 04/03/2030 …                     ← fin de section livret
  y=259/248  - DONT LIVRET BLEU (GE) / - DONT LIVRET B (GD)
  y=233      IBAN : FR76 … (du livret)                                   ⚠️ SOUS l'en-tête

PAGE 3
  PLAN D'EPARGNE LOGEMENT N° … (section, en-tête, soldes, Réf : 021)
  TOTAL INTERETS … / SITUATION DE VOS AUTRES COMPTES (tableau Numéro | Libellé | Solde)
  SITUATION DE VOS CREDITS (Numéro | Libellé | Montant emprunté | Solde)
  AUTORISATIONS DE DECOUVERTS (N° de compte | Libellé | Montant)
  TOTAL MENSUEL DES FRAIS …
```

**Constat qui invalide la coupe actuelle.** La coupe géométrique de `operationRows` garde tout ce qui est **sous** l'en-tête de colonnes. Sur ce format, on y trouve deux lignes `IBAN :`, des titres de section avec numéros de compte, `TITULAIRE(S)`, l'en-tête du bloc carte avec numéro de carte masqué partiellement, la ligne de total carte avec le numéro de compte, et trois tableaux de situation numérotés. La coupe géométrique **seule** transmettrait tout cela. [Source: architecture.md#D42]

**Constat qui invalide le détecteur actuel.** `findDebitCreditHeader` cherche des fragments exactement `Débit` / `Crédit`. Crédit Mutuel produit `Débit EUROS` / `Crédit EUROS` en **un** fragment chacun : `extractPositionalText` rend aujourd'hui `null` sur ce relevé et l'extracteur retombe sur `cutBeforeOperations` (texte plat), qui n'est pas acceptable ici. [Source: server/services/pdf-extractor.ts#findDebitCreditHeader]

### Règles de découpage en sections [À REVÉRIFIER]

Travailler sur des **lignes** (fragments regroupés par `y` à ±2 pt, triés par `x`), page par page, dans l'ordre de lecture (y décroissant).

1. **Exclusions préalables** : fragment `x < 40` (code vertical de marge) ; lignes à partir du premier pied de page de la page (`<<Suite au verso>>`, `Information sur la protection des comptes`, `Page \d+`, mentions légales) ; lignes **au-dessus** du premier en-tête de colonnes de la page.
2. **Titre de section de compte** : ligne dont le texte correspond à `/^(.+?)\s+N°\s*(\d{6,})\s+en euros\b/u`. Le libellé est le groupe 1 (`C/C EUROCOMPTE SERENITE`, `LIVRET BLEU`…), la clé est le **numéro** (groupe 2). Le glyphe `€` est un fragment séparé, 7 pt plus bas : ne pas s'en servir comme ancre.
3. **Continuation** : un titre dont le numéro est celui de la section ouverte (réimpression en tête de page) **ne crée pas** de nouvelle section.
4. **Fin de section de compte** : ligne contenant `Réf :` **et** `SOLDE (CREDITEUR|DEBITEUR|TOTAL) AU`. Tout ce qui suit jusqu'au prochain titre de section de compte est **hors section** (IBAN, bloc carte, paragraphes, tableaux).
5. **Blocs non-comptes** (hors section, jamais transmis ici) : `RELEVE DE VOTRE CARTE`, `SITUATION DE VOS AUTRES COMPTES`, `SITUATION DE VOS CREDITS`, `AUTORISATIONS DE DECOUVERTS`, `TOTAL MENSUEL DES FRAIS`, `TOTAL INTERETS`.
6. **Compte courant** : section dont le libellé contient `C/C`, `COMPTE COURANT` ou `COMPTE CHEQUES` (insensible à la casse). Exactement une clé distincte attendue, sinon `statement_format_unrecognized`.
7. **`ignoredSections`** : libellés (groupe 1) des autres sections de compte, **dans l'ordre du document, sans numéro**, dédoublonnés. Ne pas y mettre les blocs non-comptes.

### Soldes et période [À REVÉRIFIER : solde débiteur]

- Regex sur une ligne de la section : `/SOLDE\s+(CREDITEUR|DEBITEUR)\s+AU\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\S+)/u` ; le montant est le **dernier** jeton `AMOUNT_RE` de la ligne (ne pas confondre avec la date).
- Premier match de la section = ouverture, dernier = clôture (celui de la ligne `Réf :`). `SOLDE TOTAL AU` n'apparaît que sur les livrets : non concerné.
- Format montant : `12.345,67` → `parseFrAmount` le gère (point milliers, virgule décimale). Ne jamais multiplier à la main (`eurosToCents` est déjà dans `parseFrAmount`).
- `DEBITEUR` → `-montant` en `Cents`. **Aucun relevé débiteur n'a été vu** : vérifier que le montant n'est pas déjà signé ou placé dans la colonne Débit.
- `periodStart` = date d'ouverture **+ 1 jour** : le relevé s'ouvre à la date où le précédent s'est clos (`04/02` → ouverture ; précédent clos au `04/02`). Sans ce décalage, FR6 se déclenche à chaque relevé. Calculer en date civile (ex. `Date.UTC` puis ISO), pas en local. Boursorama n'a pas ce décalage : ne pas toucher son format.
- `periodEnd` = date de clôture. Les opérations observées tombent dans `[periodStart, periodEnd]` ; le bornage de la story 17.4 dans l'orchestrateur s'applique ensuite tel quel.

### Les trois couches d'identité (AR39, NFR6, NFR36)

1. **Par construction** — `operationsText` ne rend que les lignes d'opérations de la section retenue : pas de titre de section, pas de `TITULAIRE(S)`, pas d'en-tête de colonnes, pas des deux lignes de solde (lues par le code, inutiles au modèle), rien d'après la ligne `Réf :` finale. Cela exclut par construction les lignes `IBAN :`, le bloc carte, les tableaux de situation.
2. **Par correspondance exacte** — avant rendu, parcourir **tout** le document et collecter : numéros des titres `N° (\d{6,})`, numéros des tableaux de situation (première colonne), numéros des lignes `TOTAL PRELEVE SUR VOTRE COMPTE`, et chaînes d'IBAN (`IBAN : …`, espaces retirés et forme groupée). Remplacer chaque occurrence exacte (avec ou sans espaces de groupement) par `[COMPTE]` dans le texte rendu. Cas réel ciblé : le libellé `VIR PEL 99999 12345678903` contient le numéro du PEL.
3. **Par motif** — masquer toute suite restante `\d{10,}` par `[NUMÉRO]`, puis appliquer `redactIdentity` (IBAN, BIC). Les numéros de chèque (`CHEQUE 1234567`, 7 chiffres) et les dates restent lisibles.

Résidu **admis** (arbitrage NFR6) : le nom du titulaire dans un libellé d'opération (ex. `VIR DE M JEAN EXEMPLE` — ici sur le livret, donc exclu de toute façon). Références créancier `ICS : FR46ZZZ…` / `RUM : …` : ce ne sont pas des identifiants du compte du titulaire ; la couche 3 et `redactIdentity` peuvent en masquer une partie, c'est sans effet sur la catégorisation — ne pas écrire d'exception pour les préserver.

### Ce qui existe et doit être réutilisé

- `server/services/pdf-extractor.ts` : **seul** import de `unpdf` (NFR21). `readPositionedPages`, `PositionedItem`, `ROW_TOLERANCE`, `AMOUNT_RE`, `parseFrAmount`, `redactIdentity`, `DEBIT_MARKER`/`CREDIT_MARKER`, `renderRows`. Le format Crédit Mutuel reçoit les pages déjà extraites et n'importe jamais `unpdf`.
- `server/services/bank-formats/` (livré en 28.1) : `BankFormat { recognizes, operationsText, balancesAndPeriod, cardDebits }`, `BANK_FORMATS`. Ne pas modifier le contrat sans nécessité ; si `balancesAndPeriod` doit recevoir les pages plutôt que le texte plat, l'adapter pour les **deux** formats dans cette story et le dire dans le Dev Agent Record.
- `statement-ingestion-orchestrator.ts` : étapes 3 (extraction) et 3bis (soldes obligatoires avant l'appel payant, story 17.5). Le refus `statement_format_unrecognized` doit se produire dans l'étape 3, **avant** l'appel au fournisseur. Ne pas toucher à la réconciliation : elle compare les soldes à la somme des lignes et produit l'écart d'AC 8 sans code nouveau.
- `shared/types/statement-reliability.ts` : inchangé dans cette story (l'état `card_detail_missing` est 28.3).

### Garde-fous

- ❌ Pas de `Math.abs`, pas de `* 100`, pas de `parseFloat` sur un montant (CLAUDE.md).
- ❌ Pas de SQL brut ; pas d'accès base dans `bank-formats/`.
- ❌ Aucun identifiant réel dans le code, les tests, les commentaires ou les fixtures. Le PDF source reste dans `_data/raw/` ou `~/Downloads`, jamais dans le dépôt. `tests/fixtures/pdfs/*.pdf` est gitignoré, `tests/fixtures/statements/*.json` sera versionné : **relire chaque JSON avant commit**.
- ❌ Pas d'élargissement de `findDebitCreditHeader` pour accepter `Débit EUROS` : Boursorama doit rester strictement inchangé (AC 11).
- Libellés d'erreur en français dans `useApiError.ts` ; codes en anglais.

### Tests

- Vitest, co-localisé : `server/services/bank-formats/credit-mutuel.test.ts`.
- Fixture : `tests/fixtures/statements/credit-mutuel-<aaaa-mm>.json` = `PositionedItem[][]` + métadonnées attendues (soldes, période, `ignoredSections`, liste des faux identifiants plantés).
- Le test de fuite parcourt la liste des faux identifiants et vérifie leur **absence** (sous toute forme : groupée et compacte) dans `operationsText`.
- La partie confiée au modèle n'est pas testée ici : la réconciliation la contrôle (NFR10).

### À revérifier sur les relevés supplémentaires (AR41)

| Règle | Question à trancher sur les nouveaux relevés |
|---|---|
| Titre de section | Le motif `… N° <n> en euros` tient-il pour tous les comptes ? Libellé du compte courant toujours `C/C …` ? |
| Continuation | Le titre est-il toujours réimprimé en tête de page ? Une page peut-elle commencer sans titre ni en-tête ? |
| Fin de section | La ligne `Réf : … SOLDE … AU` clôt-elle toujours le compte courant, même sur une seule page ? |
| Solde débiteur | Libellé exact (`SOLDE DEBITEUR AU` ?), colonne du montant, signe éventuel |
| Colonnes | Décalage d'une page à l'autre toujours ≤ 15 pt ? En-tête toujours `Débit EUROS` / `Crédit EUROS` ? |
| Identité | Autres emplacements d'IBAN / numéros sous l'en-tête ; formats de numéros dans les libellés (`VIR PEL`, `VIR LIVRET`, prêts) |
| Pieds de page | Marqueurs de fin de page stables (`<<Suite au verso>>`, `Page N`) ; code de marge toujours à `x < 40` |
| Période | L'ouverture est-elle toujours égale à la clôture du relevé précédent ? |
| Chèques | Numéros de chèque toujours sur 7 chiffres ? |
| Plusieurs comptes courants | Un PDF peut-il contenir deux comptes courants distincts (compte joint + perso) ? Si oui, AC 4 refuse — à confirmer comme comportement voulu |

### Project Structure Notes

- Nouveau : `server/services/bank-formats/credit-mutuel.test.ts`, `tests/fixtures/statements/credit-mutuel-*.json`, script local de capture (hors `server/`, ex. `scripts/capture-statement-fixture.mjs`, qui passe par `pdf-extractor`).
- Modifié : `server/services/bank-formats/credit-mutuel.ts`, `shared/schemas/api-errors.ts`, `shared/schemas/ingestion-result.schema.ts`, `app/composables/useApiError.ts`, composant/composable de dépôt (affichage `ignoredSections`), `shared/constants/bank-statement-llm-prompt.ts` (paragraphe Crédit Mutuel).
- Nommage : fichiers kebab-case, énumération `credit_mutuel`, clés JSON camelCase (`ignoredSections`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 28.2]
- [Source: _bmad-output/planning-artifacts/prd.md#Profils et banques — FR79, FR81 ; NFR6 ; NFR36]
- [Source: _bmad-output/planning-artifacts/architecture.md#D41, #D42, #D43]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements — AR38, AR39, AR40, AR41]
- [Source: server/services/pdf-extractor.ts — extractPositionalText, findDebitCreditHeader, operationRows, renderRows, redactIdentity, parseFrAmount]
- [Source: server/services/statement-ingestion-orchestrator.ts — étapes 3, 3bis, 6 (bornage 17.4), 7 (chevauchement)]
- [Source: CLAUDE.md — Cents partout, boundaries imperméables, sécurité]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
