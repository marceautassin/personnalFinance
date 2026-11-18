# Story 28.2: Lire le compte courant d'un relevé Crédit Mutuel, et lui seul

Status: done

> ## AR41 levée le 2026-10-20 — on ne code que ce qu'on a vu, on refuse explicitement le reste
>
> Corpus de référence : **six relevés réels** du même compte courant (un profil existant, hors foyer), rangés dans
> `_data/samples/credit-mutuel/` (gitignoré, jamais dans le dépôt) :
> - cinq relevés **mensuels** de novembre 2021 à mars 2022 — 3 pages, sections livret / PEL / prêt,
>   bloc détail carte, titre de section réimprimé en page 2 ;
> - un **extrait à la demande** couvrant la première quinzaine d'un mois (2026) — section courante sur une seule page, code de
>   marge `HT.…` imprimé au MILIEU des opérations, ligne `QXBAN : …` suivie de `IBAN : …` après le solde
>   de clôture, tableau « Situation de vos autres comptes » au lieu des sections livret.
>
> Ce corpus ne contient **aucun** solde débiteur, aucun remboursement carte, une seule carte. Arbitrage
> de Marceau (2026-10-20) : pas d'attente de relevés qui n'existeront peut-être jamais (le compte joint
> n'a pas de carte). **Tout ce qui n'a pas été vu est refusé en `statement_format_unrecognized`, avant
> l'appel au fournisseur** — jamais deviné. La réconciliation au centime reste le filet en aval.
>
> **Prérequis livrés :** 27.1 (colonne `bank_statements.bank`, énumération `BANKS`), 28.1 (type
> `BankFormat`, dossier `server/services/bank-formats/`, `recognizes()` Crédit Mutuel, refus
> `bank_mismatch`, fixtures JSON Boursorama, paragraphe de prompt par banque) et 28.4 (import de
> l'export, `continuity_gap_cents`, état `unverified`).

## Story

En tant que titulaire d'un compte Crédit Mutuel,
je veux que mes relevés soient lus, réconciliés et catégorisés comme ceux de Boursorama,
afin de suivre mes dépenses sans rien saisir.

## Acceptance Criteria

1. **Compte courant seul (FR79).** Étant donné un relevé Crédit Mutuel contenant un compte courant, des livrets et un plan d'épargne, quand il est ingéré, alors seules les opérations de la section du compte courant sont importées.
2. **Sections ignorées nommées.** La réponse d'ingestion porte `ignoredSections: string[]` — les titres des autres sections **sans leurs numéros** (ex. `LIVRET BLEU`, `PLAN D'EPARGNE LOGEMENT`) — et l'écran de dépôt les affiche.
3. **Section sur deux pages.** Une section de compte courant dont le titre est réimprimé en tête de la page suivante reste **une seule** section ; ses opérations des deux pages sont importées.
4. **Zéro ou plusieurs comptes courants.** Si aucune section, ou plusieurs sections **distinctes** (numéros différents), sont reconnues comme compte courant, le relevé est refusé en `400 statement_format_unrecognized`, sans aucune ligne écrite et **sans appel au fournisseur**.
5. **Soldes.** Ouverture et clôture sont le premier et le dernier `SOLDE CREDITEUR AU jj/mm/aaaa` **de la section retenue**. Les soldes des livrets et du PEL ne sont jamais lus. **Toute autre ligne de solde dans la section retenue** — `SOLDE DEBITEUR AU`, ou tout libellé `SOLDE … AU` non vu — refuse le relevé en `400 statement_format_unrecognized` (avec le libellé rencontré dans `data`), sans ligne écrite et sans appel au fournisseur. *(Arbitrage AR41 du 2026-10-20 : un solde débiteur n'a jamais été observé, son signe et sa colonne ne sont pas devinés.)*
6. **Période.** `periodStart` = **lendemain** de la date du solde d'ouverture ; `periodEnd` = date du solde de clôture.
7. **Relevés consécutifs (FR81).** Deux relevés Crédit Mutuel consécutifs (clôture du premier = ouverture du second) ne déclenchent **aucun** chevauchement de période.
8. **Écart (FR81).** Un relevé dont la somme des lignes ne tombe pas sur les soldes est marqué « non fiable » avec son écart, exactement comme un relevé Boursorama.
9. **Identité (NFR6, NFR36).** Le texte transmis au fournisseur ne contient ni IBAN, ni numéro de compte, ni numéro de carte — **libellés compris** (ex. `VIR PEL <numéro>`) — ni nom ou adresse du titulaire hors libellés. Les trois couches d'AR39 sont en place (voir Dev Notes). Les numéros de chèque (sept chiffres) restent lisibles.
10. **Fixtures (AR40).** Chaque relevé Crédit Mutuel de référence a sa fixture JSON anonymisée sous `tests/fixtures/statements/`, et un test vérifie soldes, période, section retenue, sections ignorées et **absence de tout faux identifiant planté** dans `operationsText`.
11. **Non-régression Boursorama.** Les tests de fixture Boursorama livrés en 28.1 passent inchangés.
12. **Raccord avec l'export (FR83, AR42).** Étant donné un import d'export Crédit Mutuel du même profil dont la date de solde (`periodEnd` de l'export) tombe dans la période du relevé, quand le relevé est ingéré, alors ses opérations datées jusqu'à cette date incluse ne sont **pas** réimportées, son solde d'ouverture augmenté de ces opérations est comparé au solde de clôture de l'export, et l'écart est écrit dans `continuity_gap_cents` **de l'export** : zéro le fait passer fiable, tout autre écart non fiable. Le relevé commence alors le lendemain de la date de solde de l'export et se réconcilie au centime sur les lignes qu'il porte. Sans chevauchement (export clos avant le début du relevé), rien ne change et l'export reste `unverified`. **Garde (revue du 2026-10-20)** : le raccord n'a lieu que si l'export couvre le DÉBUT du relevé (`export.periodStart ≤ periodStart` du relevé) et s'arrête avant sa fin (`export.periodEnd < periodEnd`). Sinon — export commençant après le début du relevé, ou couvrant tout le relevé — pas de raccord : la garde de chevauchement ordinaire s'applique (409 `period_overlap`). Écarter des lignes antérieures au début de l'export les perdrait sans qu'aucun écart ne le signale.
13. **Hors périmètre de cette story.** La ligne `RELEVE CARTE` reste une opération ordinaire (son remplacement par le détail est 28.3). Le **bloc de détail carte n'est pas transmis** au fournisseur ici.

## Tasks / Subtasks

- [x] **T1 — Géométrie Crédit Mutuel (AC 1, 3, 4)**
  - [x] T1.1 Détecter l'en-tête de colonnes Crédit Mutuel : fragments **`Débit EUROS`** et **`Crédit EUROS`** (un seul fragment chacun, pas `Débit` seul) — `findDebitCreditHeader` actuel ne les reconnaît **pas** (regex `^d[ée]bit$`). Écrire un détecteur propre au format, ne pas élargir celui de Boursorama.
  - [x] T1.2 Découper chaque page en **lignes** (`renderRows`-like, tolérance verticale 2 pt), puis le document en **sections** selon les règles « Découpage en sections » ci-dessous.
  - [x] T1.3 Fusionner les sections de même numéro de compte d'une page à l'autre (AC 3).
  - [x] T1.4 Sélectionner le compte courant ; 0 ou ≥ 2 comptes distincts → `ApiErrorCode.StatementFormatUnrecognized` (AC 4).
- [x] **T2 — Soldes et période (AC 5, 6, 7)**
  - [x] T2.1 Lire `SOLDE CREDITEUR AU dd/mm/yyyy <montant>` sur les **lignes de la section retenue** uniquement.
  - [x] T2.2 Montant via `parseFrAmount` (format `12.345,67`). Toute ligne `SOLDE … AU` de la section qui n'est pas `SOLDE CREDITEUR AU` → `statement_format_unrecognized` (AC 5).
  - [x] T2.3 Période : `periodStart = ouverture + 1 jour` (calcul de date sans fuseau), `periodEnd = clôture`.
- [x] **T3 — `operationsText` et identité (AC 9, 13)**
  - [x] T3.1 Couche 1 (construction) : ne rendre que les lignes d'opérations de la section retenue, **sans** les lignes de solde, de titre, `TITULAIRE(S)`, en-tête de colonnes, pieds de page, marge gauche.
  - [x] T3.2 Couche 2 (correspondance exacte) : collecter tous les numéros lus dans le **document entier** (titres `N° <n>`, colonne `Numéro`/`N° de compte` des tableaux de situation, lignes `IBAN :`) et les remplacer par `[COMPTE]` partout dans le texte rendu.
  - [x] T3.3 Couche 3 (motif) : masquer toute suite restante d'au moins 10 chiffres ; appliquer ensuite `redactIdentity` (filet commun, IBAN/BIC).
  - [x] T3.4 Marqueurs `[DÉBIT]`/`[CRÉDIT]` par colonne, comme Boursorama (séparateur = milieu des centres des deux en-têtes, **recalculé par page** : les colonnes se décalent de ~10 pt entre pages).
- [x] **T4 — Branchement (AC 1, 2, 4, 8)**
  - [x] T4.1 Implémenter `operationsText` et `balancesAndPeriod` dans `server/services/bank-formats/credit-mutuel.ts` ; `cardDebits` renvoie vide (28.3).
  - [x] T4.2 Ajouter `StatementFormatUnrecognized: 'statement_format_unrecognized'` dans `shared/schemas/api-errors.ts` **avant** usage, et son message FR dans `app/composables/useApiError.ts`.
  - [x] T4.3 Ajouter `ignoredSections: z.array(z.string())` à `IngestionResultSchema` (vide pour Boursorama) ; l'afficher dans le composant de dépôt via son composable.
  - [x] T4.4 Vérifier que le refus de T1.4 intervient **avant** `categorizeStatement` (étape 3bis de l'orchestrateur).
  - [x] T4.5 Compléter le paragraphe Crédit Mutuel du prompt : colonnes `Date` / `Date valeur` / `Opération` / `Débit EUROS` / `Crédit EUROS` ; **la date de l'opération est la PREMIÈRE colonne, jamais la date de valeur** ; une ligne sans date prolonge le libellé de la précédente.
- [x] **T5 — Fixtures et tests (AC 9, 10, 11)**
  - [x] T5.1 Capturer les pages `PositionedItem` de chaque relevé de référence via un script local passant par `pdf-extractor` (NFR21), **substituer** chaque identifiant par un faux de même forme, sérialiser en JSON.
  - [x] T5.2 Tests : section retenue, sections ignorées, soldes, période, séparateur par page, et **pour chaque faux identifiant planté** : absent de `operationsText`.
  - [x] T5.3 Cas limites (NFR3-style, un nominal + deux limites au moins) : solde débiteur **refusé**, section sur deux pages, section sur une page avec code de marge au milieu, 0 compte courant, 2 comptes courants, numéro de chèque préservé.
- [x] **T6 — Raccord avec l'export (AC 12)**
  - [x] T6.1 Dans l'orchestrateur, après extraction et AVANT l'appel au fournisseur : chercher l'export du même profil et de la même banque dont `periodEnd` tombe dans `[periodStart, periodEnd]` du relevé.
  - [x] T6.2 S'il existe : écarter des lignes à persister celles datées ≤ `periodEnd` de l'export ; décaler `periodStart` au lendemain ; ouverture effective = ouverture lue + somme algébrique des lignes écartées ; écrire `continuity_gap_cents = ouverture effective − clôture de l'export` sur l'export, dans la même transaction que l'insertion du relevé.
  - [x] T6.3 Tests orchestrateur : raccord à zéro (export passe fiable), raccord avec écart (export non fiable), aucun chevauchement (export reste `unverified`, relevé inchangé).
  - [x] T5.4 `yarn test:run`, `yarn lint`, `yarn typecheck` verts — sortie réelle dans le Dev Agent Record.

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
- **`DEBITEUR` n'est jamais lu** : aucun relevé débiteur n'a été vu (AR41, 2026-10-20). Sa présence refuse le relevé (AC 5). Le jour où un relevé débiteur réel arrive, il devient une fixture et la règle s'écrit sur lui.
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

### Confrontation au corpus (AR41, 2026-10-20)

| Règle | Constat sur les six relevés |
|---|---|
| Titre de section | ✅ `C/C EUROCOMPTE SERENITE N° <11 chiffres> en euros (GD)` sur les six ; livrets et PEL suivent le même motif. Aucun autre libellé de compte courant vu. |
| Continuation | ✅ Mensuels : titre réimprimé en tête de page 2, même numéro. Extrait : section entière sur une page. Page sans titre ni en-tête : jamais vue → refus si des opérations y apparaissent hors section. |
| Fin de section | ✅ `Réf : <n> SOLDE CREDITEUR AU` clôt le compte courant sur les six, y compris sur une seule page. |
| Solde débiteur | ❌ Jamais vu → refus (AC 5). |
| Colonnes | ✅ En-tête `Débit EUROS` / `Crédit EUROS` sur les six, extrait 2026 compris. Décalage inter-pages à mesurer sur les fixtures. |
| Identité | ⚠️ Nouveau : ligne `QXBAN : …  IBAN : …` sous la clôture de l'extrait 2026 — exclue par construction (après `Réf :`), à collecter aussi par la couche 2. Libellés porteurs de références de contrat courtes (< 10 chiffres) : laissés lisibles. `RUM : …` long : couche 3. |
| Pieds de page | ✅ `<<Suite au verso>>` et `Information sur la protection des comptes` sur les six. ⚠️ Le code de marge `HT.<horodatage>… X 0 2` apparaît **au milieu** des opérations sur l'extrait 2026 : il doit être exclu par sa position (`x < 40`), **pas** traité comme un pied de page qui couperait la suite. |
| Période | ✅ Mensuels : ouverture = clôture du précédent, au centime et à la date. Extrait : ouverture `AU <jour J>`, premières opérations à J+1 — la règle « lendemain » tient. |
| Chèques | ✅ Sept chiffres (`CHEQUE 1234567`). |
| Plusieurs comptes courants | Jamais vu → refus (AC 4), comportement confirmé. |
| Carte | Une seule carte, une ligne `RELEVE CARTE` par mois sur les mensuels, aucune sur l'extrait. Hors périmètre (28.3). |

### Corpus réel et fixtures

- Les PDF réels sont dans `_data/samples/credit-mutuel/` (gitignoré). Ils servent **uniquement** au script local de capture.
- Fixtures versionnées (D43, dépôt public) : **structure** réelle (pages, positions, en-têtes, lignes de solde, sections, code de marge, lignes IBAN/QXBAN) et **contenu entièrement inventé** — libellés, montants, noms, numéros. Pas de substitution de chiffres (réversible) : réécrire. Au minimum deux fixtures : un mensuel 3 pages (livret + PEL + bloc carte) et l'extrait 1 page (code de marge au milieu). Avant tout commit, grep des valeurs réelles du corpus sur `tests/` : zéro occurrence.
- Export en base pour ce profil : clos plusieurs jours avant le début de l'extrait → pas de chevauchement réel. Le raccord (AC 12) se teste sur des données synthétiques.

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

Agent de développement, 2026-10-20.

### Debug Log References

- Capture locale des six PDF réels via `readPositionedPages` (pdf-extractor), fichier temporaire hors dépôt, supprimé. Aucune valeur réelle versionnée.
- Vérification sur les six relevés réels (`extractStatement(..., 'credit_mutuel')`, sans appel au fournisseur) : écart de réconciliation nul sur les six (somme des colonnes Débit/Crédit = clôture − ouverture, ligne `RELEVE CARTE` comprise), aucun numéro de compte / IBAN / `N°` / `TITULAIRE` dans `operationsText`, clôture de chaque mensuel = ouverture du suivant.
- Défaut trouvé par ce test : `maskIban` (partagé) avalait des MONTANTS (`<référence courte> <montant>` lu comme un IBAN à groupes de 2-4 caractères), d'où des écarts de 410 € à 580 € sur les relevés réels. Voir décisions.

### Completion Notes List

Décisions prises hors spec ou précisant la spec :

1. **Contrat `BankFormat`** : `balancesAndPeriod(flatText, pages?)` reçoit les pages en second paramètre OPTIONNEL (Boursorama l'ignore, ses tests passent inchangés) et peut rendre `ignoredSections?`. `RawStatement.ignoredSections` (toujours un tableau, vide pour Boursorama). Nouveau `StatementFormatError(reason, data)` dans `bank-formats/types.ts`, traduit par l'orchestrateur en `400 statement_format_unrecognized` (données : `reason` + éventuel `label` de solde), dans l'étape 3, avant le fournisseur.
2. **Pas de repli texte plat pour Crédit Mutuel** : pages `null` (lecture positionnelle en échec) → refus `positional_reading_unavailable`.
3. **`maskIban` resserré** (`identity.ts`, partagé avec Boursorama et l'export) : groupes de QUATRE caractères, seul le dernier peut être plus court. Un IBAN réel, espacé ou compact, reste masqué ; une référence courte suivie d'un montant n'est plus avalée. Aucun test Boursorama modifié.
4. **Refus supplémentaires** (règle « refuser l'inconnu ») : section du compte courant jamais clôturée par `Réf :`, même numéro réimprimé après clôture, page de continuation du compte courant sans en-tête de colonnes, nombre de lignes de solde différent de 2 dans la section retenue, bloc hors compte rencontré section ouverte (la section reste non clôturée, donc refusée).
5. **Raccord export (T6)** : l'export candidat est le plus récent du même profil ET de la même banque tel que `export.periodStart ≤ periodStart` du relevé ET `periodStart ≤ export.periodEnd < periodEnd` du relevé (revue du 2026-10-20). Borne haute STRICTE : un export qui couvre tout le relevé, ou qui commence après son début, n'est pas raccordé : chevauchement ordinaire (409 `period_overlap` sans `confirmReplace`). Borne basse inclusive : un export clos le jour du début du relevé se raccorde, sans ligne écartée. Les lignes ≤ date de l'export sont écartées APRÈS la catégorisation (elles sont encore envoyées au modèle : écart assumé par la spec, qui demande de les écarter des lignes « à persister »). Le relevé est stocké avec `periodStart` = lendemain de l'export et `opening` effectif ; `continuity_gap_cents` est écrit sur l'export dans la même transaction. Le chevauchement (étape 7) se calcule sur la période décalée.
6. **`ignoredSections` optionnel dans le schéma** (comme `ignoredSheets`) : toujours renseigné sur un PDF, absent sur un export. Affiché dans `IngestionQueue.vue` (« sections ignorées : … »).
7. **Prompt** : paragraphe Crédit Mutuel ajouté dans `BANK_PROMPT_NOTES` ; `BANK_STATEMENT_PROMPT_VERSION` NON incrémentée (partie commune et paragraphe Boursorama inchangés) : à trancher par le relecteur. Le test 28.1 « credit_mutuel reste neutre » est remplacé.
8. **Fixtures** : `credit-mutuel-mensuel.json` (3 pages : compte courant sur 2 pages, bloc carte, livret, PEL, tableaux de situation, IBAN, code de marge au milieu des opérations) et `credit-mutuel-extrait.json` (1 page + page de situation, ligne `QXBAN`/`IBAN` sous la clôture, code de marge au milieu). Générées par `generate-credit-mutuel-fixtures.test.ts` (garde `GENERATE_FIXTURE=1`), contenu entièrement inventé (dates en 2030). Pas de script de capture versionné : la capture locale a été faite hors dépôt.
9. **Revue du 2026-10-20** : fixtures sans ligne réelle (libellé, montant, dates inventés) ; `maskLabelledBankId` (`IBAN :`, `QXBAN :`, `RIB :` + groupes irréguliers, jamais un montant) appelé par `redactIdentity` ; message FR dédié à `statement_format_unrecognized` d'un relevé PDF (`useApiError`) ; `BANK_STATEMENT_PROMPT_VERSION` passée à 5 ; refus mort `columns_header_missing` supprimé.
10. **Limite `ignoredSections`** : dédoublonnage par libellé (deux sections de même titre n'apparaissent qu'une fois) ; sur un extrait à la demande, les livrets du tableau « Situation de vos autres comptes » ne sont PAS listés (ce ne sont pas des sections de compte).
11. Les valeurs issues des vrais relevés présentes dans le texte de la story (rédaction du 2026-09-22) ont été remplacées par des valeurs inventées le 2026-10-20.

Sortie réelle (2026-10-20) :

```
yarn test:run  -> Test Files  57 passed | 3 skipped (60) ; Tests  871 passed | 3 skipped (874)   (exit 0)
yarn lint      -> eslint . ; Done in 3.98s   (exit 0)
yarn typecheck -> nuxt typecheck ; Done in 5.51s   (exit 0)
```

### File List

Modifiés : `server/services/bank-formats/credit-mutuel.ts`, `server/services/bank-formats/types.ts`, `server/services/bank-formats/index.ts`, `server/services/bank-formats/identity.ts`, `server/services/pdf-extractor.ts`, `server/services/statement-ingestion-orchestrator.ts`, `shared/schemas/ingestion-result.schema.ts`, `shared/constants/bank-statement-llm-prompt.ts`, `app/components/ingestion/IngestionQueue.vue`, et les tests `credit-mutuel.test.ts`, `identity.test.ts`, `statement-ingestion-orchestrator.test.ts`, `bank-statement-llm-prompt.test.ts`.
Créés : `server/services/bank-formats/generate-credit-mutuel-fixtures.test.ts`, `tests/fixtures/statements/credit-mutuel-mensuel.json`, `tests/fixtures/statements/credit-mutuel-extrait.json`.
