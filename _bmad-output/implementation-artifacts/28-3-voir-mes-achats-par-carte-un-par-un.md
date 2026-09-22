# Story 28.3: Voir mes achats par carte un par un, au centime près

Status: ready-for-dev

> ⚠️ **BLOQUÉE par AR41 — ne pas démarrer avant d'avoir 3 à 5 relevés Crédit Mutuel
> supplémentaires.** Un seul relevé a été lu. Il ne montre ni remboursement carte, ni deux cartes,
> ni détail prélevé hors période : écrire l'algorithme sur lui seul figerait ses particularités en
> règles. Voir « Points à revérifier sur les nouveaux relevés » avant toute ligne de code.
>
> **Prérequis livrés :** 27.1 (migration, profils, colonne `bank`), 28.1 (`BankFormat`, champ
> `bank`, refus `bank_mismatch`), 28.2 (format Crédit Mutuel : sections, soldes, période,
> identité, fixtures). Cette story **étend** le format Crédit Mutuel de 28.2 ; elle n'en réécrit rien.

## Story

En tant que titulaire d'une carte à débit différé,
je veux voir chaque achat plutôt qu'une seule ligne mensuelle,
afin de savoir où part l'argent que je dépense par carte.

## Acceptance Criteria

1. **Remplacement nominal (FR80, AR39).** Étant donné un relevé portant une ligne `RELEVE CARTE`
   de montant −T et un bloc de détail dont la ligne `TOTAL PRELEVE … : T euros` vaut T, quand il
   est ingéré, alors la ligne agrégée n'est **pas** persistée et chaque achat du détail devient une
   transaction, catégorisée et **datée de son jour d'achat**.
2. **Qui lit quoi.** Le total T est lu **par le code** (regex du format Crédit Mutuel), jamais par
   le modèle. Les lignes du détail sont extraites et catégorisées par un **appel distinct** au
   fournisseur, sur le seul texte des lignes d'achat.
3. **Achat antérieur à la période.** Un achat du détail daté avant `periodStart` du relevé est
   accepté (il ne déclenche **pas** le garde « dates hors période » de l'étape 6), figure dans
   l'analyse du mois de l'achat, et reste rattaché au relevé qui le porte (FR36 : on le retrouve en
   descendant jusqu'à la ligne).
4. **Détail qui ne tombe pas juste.** Si la somme des achats diffère de T d'au moins un centime, le
   relevé est ingéré, marqué « non fiable » par la réconciliation existante (l'écart apparaît
   mécaniquement), et la réponse d'ingestion précise que l'écart vient du détail carte
   (`cardDetailGapCents`).
5. **Agrégat sans détail.** Une ligne `RELEVE CARTE` sans bloc de détail correspondant est
   conservée telle quelle ; `bank_statements.card_detail_missing` vaut vrai ; le relevé est dans
   l'état dégradé `card_detail_missing`, affiché avec sa cause **partout** où il contribue (FR12).
6. **L'acceptation d'un écart n'efface pas cet état.** `card_detail_missing` l'emporte sur
   `gap_accepted` dans `deriveReliability`, y compris dans la réponse de
   `POST /api/reconciliation/[hash]` (aujourd'hui codée en dur à `'gap_accepted'`).
7. **Deux cartes.** Chaque agrégat est remplacé par **son** détail, rapproché par son total (et, à
   égalité de montant, par la date du total).
8. **Détail sans agrégat.** Un bloc de détail sans ligne agrégée correspondante n'est pas importé ;
   la réponse d'ingestion le dit (`orphanCardDetails`).
9. **Identité (NFR36).** Le texte transmis pour le détail ne contient que les lignes d'achat : ni
   l'en-tête du bloc (numéro de carte, titulaire, en-tête de colonnes), ni la ligne de total (qui
   porte des numéros de compte), ni le paragraphe d'information qui suit.
10. **Tests (NFR3).** Le nouvel état de fiabilité a un cas nominal et deux cas limites ;
    l'algorithme de remplacement est une fonction pure testée isolément ; la fixture Crédit Mutuel
    de 28.2 est étendue et vérifie qu'aucun faux identifiant planté (numéro de carte, numéros de
    compte de la ligne de total, titulaire) n'apparaît dans le texte du détail.

## Tasks / Subtasks

- [ ] **T0 — Lever le blocage (AR41)** (toutes AC)
  - [ ] Capturer les nouveaux relevés en fixtures JSON anonymisées (outil de capture de 28.2).
  - [ ] Répondre par écrit, dans les Completion Notes, aux points de « Points à revérifier ».
  - [ ] Si un point contredit cette story (ex. remboursement en colonne signée), **s'arrêter** et
        le remonter au PM avant de coder.
- [ ] **T1 — Lecture des blocs de détail dans le format Crédit Mutuel** (AC 2, 7, 8, 9)
  - [ ] Implémenter `cardDebits(...)` dans `server/services/bank-formats/credit-mutuel.ts`
        (capacité déjà déclarée au type `BankFormat` par 28.1, vide jusqu'ici).
  - [ ] Rendre, par bloc : `totalCents` (lu par le code), `debitDate` (date `AU jj/mm/aaaa` de la
        ligne TOTAL), `detailText` (lignes d'achat seules, passées par les trois couches
        d'identité de 28.2).
  - [ ] Tests unitaires sur la fixture étendue.
- [ ] **T2 — Appel distinct au fournisseur pour le détail** (AC 2)
  - [ ] Étendre la signature de `categorizeStatement` introduite en 28.1 (paramètre de banque)
        d'un **type de texte** : relevé ou détail carte. Paragraphe de prompt dédié au détail :
        colonne unique `Montant euros`, un achat = montant **négatif** ; libellé = commerce +
        ville.
  - [ ] Même validation Zod, même relance bornée (AR17), mêmes règles de classement appliquées
        ensuite (`applyRules`).
- [ ] **T3 — Remplacement déterministe, fonction pure** (AC 1, 4, 7, 8)
  - [ ] `replaceCardAggregates(statementLines, cardBlocks)` dans un fichier dédié à côté de
        l'orchestrateur (ex. `server/services/card-debit-replacer.ts`) — **pas de DB, pas de log**.
  - [ ] Tests : nominal, écart d'un centime, agrégat sans détail, détail sans agrégat, deux cartes
        de même montant départagées par la date.
- [ ] **T4 — Branchement dans l'orchestrateur** (AC 1, 3, 4, 5, 8)
  - [ ] Insérer le remplacement **après** les règles (8bis) et **avant** la réconciliation (9).
  - [ ] Adapter le garde de dates (étape 6) : les lignes du détail en sont exemptées et soumises à
        leur propre borne (voir Dev Notes).
  - [ ] Persister `cardDetailMissing` dans l'`INSERT` du relevé.
  - [ ] Étendre `IngestionResultSchema` : `cardDetailGapCents: number | null`,
        `cardDetailMissing: boolean`, `orphanCardDetails: number`.
- [ ] **T5 — Migration `card_detail_missing`** (AC 5)
  - [ ] Prochaine migration disponible après celles de 27.1/28.x : `ALTER TABLE bank_statements
        ADD COLUMN card_detail_missing integer DEFAULT false NOT NULL` (colonne sans clé
        étrangère : `ADD COLUMN` suffit, pas de rebuild). `yarn db:generate`, jamais `push`.
  - [ ] Déclarer la colonne dans `server/db/schema.ts` avec son commentaire « fait du PDF, pas
        état dérivé ».
- [ ] **T6 — Fiabilité** (AC 5, 6, 10)
  - [ ] `shared/types/statement-reliability.ts` : nouvel état, `deriveReliability`,
        `worstReliability`, libellé. Tests.
  - [ ] `server/utils/statement-reliability.ts` : lire la colonne, la passer à `deriveReliability`.
  - [ ] Les trois appelants directs de `deriveReliability` (voir liste) passent la colonne.
  - [ ] `POST /api/reconciliation/[hash]` : ne plus renvoyer `'gap_accepted'` en dur.
- [ ] **T7 — Affichages** (AC 4, 5, 8)
  - [ ] `ReliabilityBadge.vue`, bandeaux de `analyse.vue` et `transactions/[period].vue`,
        `reconciliation/[hash].vue`, résultat d'ingestion dans `import.vue` (voir liste).
- [ ] **T8 — Vérifications de fin** : `yarn test:run`, `yarn lint`, `yarn typecheck`, E2E
      ingestion ; revue `pr-reviewer`.

## Dev Notes

### Le format réel du bloc (relevé d'exemple, identifiants remplacés par des faux)

```
€ C/C EUROCOMPTE … N° 00000000000 …           ← section du compte courant (28.2)
  28/02/2030 28/02/2030 RELEVE CARTE                        234,56      ← agrégat, colonne Débit
  …
  Réf : 002        SOLDE CREDITEUR AU 04/03/2030           6.789,01
RELEVE DE VOTRE CARTE <type> N° ------1234--- Au 21/02/2030              ← en-tête : NE PAS transmettre
TITULAIRE : M DUPONT JEAN                                              ← NE PAS transmettre
   Date      Commerce                 Ville          Montant euros   Montant devises
   31/01/2030 MAGASIN EXEMPLE             EXEMPLEVILLE            123,45      ← lignes d'achat : transmises
   02/02/2030 COMMERCE EXEMPLE         EXEMPLEVILLE           111,11
   TOTAL PRELEVE SUR VOTRE COMPTE 00000 00000000000 00 AU 28/02/2030 : 234,56 euros   ← lu par le code, NE PAS transmettre
Vous disposez d'une carte de paiement : … paiements de moins de 10 EUR … regroupée …    ← NE PAS transmettre
€ LIVRET BLEU N° …                                                     ← section ignorée (28.2)
```

Constats utiles :
- Le bloc de détail vit **entre la fin de la section du compte courant et la section suivante**.
  28.2 découpe sur les titres `€ …` : le bloc tombe donc hors section retenue, ce qui explique
  qu'il ne soit pas transmis en 28.2. `cardDebits` doit le chercher **dans le texte entre la
  section retenue et la suivante**, pas dans tout le document.
- Le total est au format `234,56 euros` (virgule décimale, `.` des milliers ailleurs dans le
  relevé : `6.789,01`). Réutiliser `parseFrAmount` de `pdf-extractor.ts`.
- La date `AU 28/02/2030` de la ligne TOTAL **égale** la date d'opération de la ligne
  `RELEVE CARTE` du compte courant. Utile pour départager deux cartes de même montant.
- L'arrêté du détail (`Au 21/02/2030`) précède le débit ; le premier achat (31/01) **précède le
  début de la période** du relevé (05/02, lendemain du solde d'ouverture du 04/02 — D42).
- Le paragraphe « paiements de moins de 10 EUR … regroupée » signifie qu'une ligne de détail peut
  déjà être un regroupement par commerçant. Aucune incidence sur l'algorithme ; le libellé reste
  celui du commerce.
- La colonne `Montant devises` existe : on retient **toujours** `Montant euros`.

### Points à revérifier sur les nouveaux relevés (T0)

| Point | Pourquoi il bloque | Hypothèse actuelle, à confirmer |
|---|---|---|
| **Signe d'un remboursement carte** dans le détail | Colonne unique `Montant euros` : un crédit peut s'y écrire avec un `-`, un suffixe `CR`, ou dans une autre colonne. Se tromper inverse un montant sans que le total le voie si deux erreurs se compensent. | Inconnu. Ne **pas** coder avant d'avoir vu un cas réel. |
| **Deux cartes** sur le même compte | Deux blocs, deux agrégats : le rapprochement doit se faire bloc par bloc. | Chaque bloc a son TOTAL ; rapprochement par montant puis date. |
| **Détail prélevé hors période** | Si la ligne TOTAL porte une date postérieure au solde de clôture, l'agrégat est dans le relevé suivant et le détail ici — ou l'inverse. | Décide si « détail sans agrégat » (AC 8) est un cas réel. |
| **Bloc de détail sur deux pages** | Le découpage de 28.2 tient-il ? | À observer. |
| **Libellé de l'agrégat** | `RELEVE CARTE` est-il constant (`REL CARTE`, numéro de carte accolé) ? | Match par `includes('RELEVE CARTE')` après normalisation. |

### Algorithme de remplacement (T3) — fonction pure

Entrées : `statementLines` (lignes du compte courant **après** catégorisation et règles, montant
signé) et `cardBlocks: { totalCents, debitDate, lines }[]` (lignes du détail catégorisées, montants
négatifs).

```
remaining = copie de statementLines
out = []
orphans = 0
missingDetail = false
cardGap = 0

pour chaque bloc B (ordre du document) :
  candidats = lignes de remaining dont
              normalize(label) contient 'RELEVE CARTE'
              ET amountCents === -B.totalCents
  si candidats.length > 1 : garder celles dont transactionDate === B.debitDate
  si aucun candidat : orphans++ ; continuer            ← AC 8, détail non importé
  retirer le premier candidat de remaining
  ajouter B.lines à out
  cardGap += (-B.totalCents) - somme(B.lines.amountCents)

agrégats restants = lignes de remaining contenant 'RELEVE CARTE'
si agrégats restants non vide : missingDetail = true  ← AC 5, ils sont conservés
retourner { lines: remaining ∪ out, cardDetailGapCents: cardGap (ou null si aucun bloc),
            cardDetailMissing: missingDetail, orphanCardDetails: orphans }
```

- **Le rapprochement se fait sur le TOTAL lu par le code, jamais sur la somme des lignes
  extraites.** C'est ce qui rend l'écart visible : si le modèle a mal lu un achat, la somme diverge
  du total, la ligne agrégée est quand même retirée, et la réconciliation du relevé le signale.
- **Aucun code n'est nécessaire pour l'écart** : la réconciliation (étape 9) compare les soldes à
  la somme des lignes persistées. Remplacer −T par des lignes totalisant −T+δ produit un écart δ.
  `cardDetailGapCents` sert uniquement à **attribuer** cet écart dans la réponse.
- Arithmétique : `sumCents`/`subCents` de `shared/types/money.ts`. Jamais `Math.abs` (D28).

### Garde de dates de l'étape 6 — piège principal

L'orchestrateur **rejette** aujourd'hui en `502 llm_extraction_failed` toute ligne hors
`[periodStart, periodEnd]` (story 17.4). Un achat du 31/01 dans un relevé ouvert le 05/02 serait
refusé et **tout le relevé échouerait**. Règle proposée :
- lignes du compte courant : garde inchangée ;
- lignes d'un bloc de détail : `transactionDate ≤ debitDate` du bloc **et**
  `transactionDate ≥ debitDate − 62 jours` (un cycle de débit différé est mensuel ; 62 jours
  couvre un décalage d'arrêté). Hors de cette borne → même rejet, pour la même raison (NFR15 :
  ne pas corriger une date, refuser).
- La borne est à **confirmer en T0** sur les nouveaux relevés.

Conséquence assumée par le PRD (FR80, note sous FR80) : un achat peut tomber dans une période
d'analyse antérieure à celle du relevé qui le porte. La fiabilité par période (`reliabilityOverlapping`)
recouvre sur les **périodes de relevé**, pas sur les dates de ligne : un relevé non fiable ne
contaminera pas le mois de janvier où tombe l'achat du 31/01. Ce trou est connu et accepté — ne pas
l'élargir dans cette story.

### Ordre dans l'orchestrateur (`server/services/statement-ingestion-orchestrator.ts`)

Ordre actuel : hash → dédup → extraction → soldes (3bis) → catégorisation (4) → période (5) →
dates (6) → chevauchement (7) → sauvegarde PDF (8) → règles (8bis) → réconciliation (9) → tx DB
(10) → nettoyage FS (11). Insertion :

- **4bis** — si `bank === 'credit_mutuel'` et `cardDebits` non vide : un appel
  `categorizeStatement` par bloc, sur `detailText`. Les erreurs sont traduites **exactement**
  comme pour l'appel principal (`LlmConfigError` d'abord, puis `LlmUnavailableError`, puis
  `LlmExtractionError`). Les appels passent **avant** l'étape 8 : un échec ne laisse ni PDF ni
  ligne (AR18, atomicité).
- **6** — garde adaptée (ci-dessus).
- **8ter** — `applyRules` sur les lignes du détail aussi (même tri `id`), puis
  `replaceCardAggregates`.
- **9** — réconciliation sur les lignes **après** remplacement.
- **10** — `INSERT` du relevé avec `cardDetailMissing`.

Coût : un appel fournisseur de plus par bloc. Avec la relance sur défaillance passagère (17.5), le
pire cas d'un relevé à une carte double. Accepté (pas de plafond de coût, PRD).

### Fiabilité — extension (`shared/types/statement-reliability.ts`)

```ts
export const STATEMENT_RELIABILITIES = ['reliable', 'gap_unreviewed', 'card_detail_missing', 'gap_accepted'] as const

export function deriveReliability(gapCents: number, gapAccepted: boolean, cardDetailMissing: boolean): StatementReliability {
  if (cardDetailMissing) return 'card_detail_missing'   // AC 6 : prime sur l'acceptation
  if (gapAccepted) return 'gap_accepted'
  return gapCents === 0 ? 'reliable' : 'gap_unreviewed'
}

// worstReliability : gap_unreviewed > card_detail_missing > gap_accepted > reliable
// RELIABILITY_LABELS.card_detail_missing = 'Achats carte non détaillés'
```

Justification de l'ordre : un écart non examiné appelle une action ; un détail manquant est un fait
du PDF que l'utilisateur ne peut pas corriger ; un écart accepté est une décision prise. Le PRD ne
prévoit **pas** l'acceptation de `card_detail_missing` : ne pas l'ajouter.

`card_detail_missing` est **stocké** alors que la règle du fichier dit « seule la décision est
persistée » : ce n'est pas une contradiction, c'est un fait du PDF qui n'est dérivable d'aucune
ligne en base une fois l'ingestion faite. Le dire dans le commentaire du schéma (D42).

### Consommateurs à mettre à jour (liste exhaustive, relevée dans le code)

Serveur — appel direct à `deriveReliability` (signature change, le compilateur les signalera) :
- `server/utils/statement-reliability.ts` — `baseSelection` et `toRow` : ajouter la colonne.
  Alimente `reliabilityByStatement`, `reliabilityOfStatement`, `reliabilityOverlapping`, donc
  `GET /api/statements`, `GET /api/analysis`, `GET /api/transactions`.
- `server/api/statements/[hash].get.ts:57`
- `server/api/reconciliation/[hash].post.ts:109` et **`:166`** (valeur en dur `'gap_accepted'`
  à remplacer par `deriveReliability(result.gapCents, true, statement.cardDetailMissing)`).

Front — rendu par état (les `Record<StatementReliability, …>` casseront au typecheck, c'est voulu) :
- `app/components/shared/ReliabilityBadge.vue` — `ICONS`, `BADGE_CLASS` (variante `badge--warn`
  proposée), libellé : ne **pas** suffixer de montant quand l'état est `card_detail_missing`
  (l'écart peut être 0).
- `app/pages/analyse.vue:190-194` — bandeau : rôle `status`, message dédié.
- `app/pages/transactions/[period].vue:399-407` — le ternaire à deux branches devient un message
  par état ; ajouter « Des achats par carte n'ont pas pu être détaillés sur cette période. »
- `app/pages/reconciliation/[hash].vue:83` — afficher la cause ; le bouton « Accepter l'écart »
  reste régi par l'écart (inchangé), il ne fait pas disparaître cet état.
- `app/pages/import.vue:195` — badge par relevé, et **résultat d'ingestion** : afficher
  `cardDetailGapCents` (« l'écart vient du détail carte »), `orphanCardDetails` et
  `cardDetailMissing`.
- `app/composables/useStatements.ts`, `useTransactions.ts`, `useReconciliation.ts` : types
  seulement.
- `app/composables/useApiError.ts` : **aucun nouveau code d'erreur** — aucun des cas de cette
  story n'est un refus. En revanche le message de `PdfParseFailed` cite encore « relevé
  Boursorama » : vérifier que 28.1 l'a neutralisé, sinon le faire.

### Tests

- `shared/types/statement-reliability.test.ts` : `card_detail_missing` nominal ; cas limites
  « écart accepté + détail manquant » (→ `card_detail_missing`) et « écart nul + détail
  manquant » (→ `card_detail_missing`, jamais `reliable`) ; `worstReliability` avec les quatre.
- `card-debit-replacer.test.ts` : les cinq cas de T3.
- Orchestrateur (`statement-ingestion-orchestrator.test.ts`, fournisseur simulé) : achat antérieur
  à la période accepté ; achat à `debitDate − 63 j` rejeté ; échec de l'appel détail → rien de
  persisté, PDF non sauvegardé.
- Fixture Crédit Mutuel (28.2) étendue : faux numéro de carte `------1234---`, faux numéros de
  compte sur la ligne TOTAL, faux titulaire — **absents** de `detailText`.
- Les tests d'API de fiabilité existants passent avec la colonne à `false` (non-régression
  Boursorama : `cardDebits` y est vide).

### Garde-fous projet

- `Cents` partout, `parseFrAmount` pour lire le total, jamais `parseFloat`, jamais `* 100`.
- Le SDK fournisseur reste dans `llm-categorizer.ts` ; `unpdf` reste dans `pdf-extractor.ts` ;
  `credit-mutuel.ts` n'importe ni l'un ni l'autre.
- Pas de `try/catch` qui avale : un échec d'appel détail fait échouer l'ingestion entière.
- Pas de `console.log` ; les `step(...)` existants de l'orchestrateur suffisent (`card-details`,
  `card-replaced`).
- Aucun identifiant réel dans les fixtures, les tests, les logs ni ce fichier.

### Project Structure Notes

- Nouveau : `server/services/card-debit-replacer.ts` (+ test). Justification : fonction pure,
  testable sans DB ni fournisseur, même logique que `reconciler.ts` et `rule-matcher.ts`.
- Modifiés : `bank-formats/credit-mutuel.ts`, `llm-categorizer.ts`,
  `shared/constants/bank-statement-llm-prompt.ts`, `statement-ingestion-orchestrator.ts`,
  `shared/schemas/ingestion-result.schema.ts`, `server/db/schema.ts` + migration,
  `shared/types/statement-reliability.ts`, `server/utils/statement-reliability.ts`, deux endpoints,
  cinq pages ou composants, trois composables (types).
- `bank_statements` ne porte pas de `profile_id` dans cette story : acquis en 27.1.

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR80 et note sous FR80] — date d'achat,
  agrégat sans détail gardé et non fiable
- [Source: _bmad-output/planning-artifacts/prd.md#NFR36] — identité par banque, libellés compris
- [Source: _bmad-output/planning-artifacts/architecture.md#D42] — total lu par le code, appel
  distinct, remplacement avant réconciliation, `card_detail_missing`, non couvert par `gap_accepted`
- [Source: _bmad-output/planning-artifacts/architecture.md#D43] — fixtures JSON anonymisées
- [Source: _bmad-output/planning-artifacts/epics.md#Story 28.3] — critères d'origine
- [Source: server/services/statement-ingestion-orchestrator.ts] — étapes 4, 6, 8bis, 9, 10
- [Source: shared/types/statement-reliability.ts] — trois états actuels, priorité de la décision
- [Source: server/api/reconciliation/[hash].post.ts:166] — état renvoyé en dur

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
