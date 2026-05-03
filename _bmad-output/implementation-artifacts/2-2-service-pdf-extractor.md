# Story 2.2: Service `pdf-extractor` (wrapper `unpdf`)

Status: done

## Story

As a dev,
I want a stable interface for extracting raw text and headline metadata (period, balances) from a Boursorama PDF statement,
so that downstream services (LLM categorizer, ingestion endpoint) don't depend directly on `unpdf` and can be swapped if a different bank format requires a different parser later.

## Acceptance Criteria

1. **Given** `server/services/pdf-extractor.ts`,
   **When** j'expose une fonction `extractStatement(pdfBuffer: Buffer): Promise<RawStatement>`,
   **Then** elle utilise `unpdf` en interne pour récupérer le texte de toutes les pages et retourne un objet `{ rawText: string, periodStart: string | null, periodEnd: string | null, openingBalanceCents: Cents | null, closingBalanceCents: Cents | null }`.

2. **Given** un PDF Boursorama de fixture (à placer manuellement dans `tests/fixtures/pdfs/`),
   **When** j'écris `server/services/pdf-extractor.test.ts`,
   **Then** le test charge le PDF, appelle `extractStatement`, et vérifie : `rawText` non vide, `periodStart` et `periodEnd` au format YYYY-MM-DD valides et cohérents, soldes ouverture/clôture extraits en Cents (entiers).

3. **Given** un PDF dont le texte ne contient pas de période ou de soldes parsables,
   **When** `extractStatement` est appelé,
   **Then** elle retourne les champs concernés à `null` (pas d'exception) — le fallback période est géré par l'orchestrateur (Story 2.6) à partir des dates min/max des transactions extraites par le LLM.

4. **Given** la convention NFR16 (parser isolé),
   **When** je grep le code projet,
   **Then** aucun import direct de `unpdf` n'existe en dehors de `pdf-extractor.ts`.

5. **Given** un PDF malformé / non-PDF passé en buffer,
   **When** `extractStatement` est appelé,
   **Then** elle lève une erreur explicite (à mapper en `domainError('llm_extraction_failed', ...)` côté endpoint, ou un nouveau code `pdf_parse_failed` à ajouter dans `ApiErrorCode` si tu juges utile — alternative : laisser remonter et l'endpoint la wrap).

## Tasks / Subtasks

- [x] **Task 1 — Implémenter `extractStatement`** (AC: #1, #3, #5)
  - [x] Créer `server/services/pdf-extractor.ts` selon le snippet Dev Notes
  - [x] Le service expose une seule fonction publique : `extractStatement(buf: Buffer): Promise<RawStatement>`
  - [x] Type `RawStatement` exporté
  - [x] Toute la logique de parsing texte (regex pour période et soldes) reste dans ce module — pas de leak ailleurs

- [x] **Task 2 — Parser la période** (AC: #1, #3)
  - [x] Implémenter une fonction interne `extractPeriod(rawText): { start: string | null, end: string | null }` qui cherche les patterns Boursorama courants. Voir Dev Notes pour les regex à essayer.
  - [x] Si trouvé : retourner les dates au format `YYYY-MM-DD` (Boursorama affiche en `JJ/MM/AAAA` → conversion explicite)
  - [x] Si non trouvé : `{ start: null, end: null }`

- [x] **Task 3 — Parser les soldes** (AC: #1, #3)
  - [x] Implémenter `extractBalances(rawText): { openingCents: Cents | null, closingCents: Cents | null }` qui cherche les libellés "Solde précédent", "Ancien solde", "Nouveau solde", "Solde au [date]" etc.
  - [x] Conversion via `eurosToCents` (helper Story 1.3)
  - [x] Garder la sémantique des signes : un solde négatif (compte à découvert) reste négatif

- [x] **Task 4 — Test sur fixture réelle** (AC: #2)
  - [x] Test conditionnel auto-détecte le premier `*.pdf` dans `tests/fixtures/pdfs/` ; skip propre si absent. Permet à l'utilisateur de déposer un PDF anonymisé sans modifier le test.
  - [x] Vérifie `rawText.length > 100`, format `YYYY-MM-DD` des dates, intégrité entière des Cents — assertions souples pour ne pas verrouiller des valeurs avant validation manuelle (cf. Completion Notes).
  - [x] Aucun fixture présent à ce stade : le test fixture est skipped, les ACs #3 et #5 sont couverts par les tests de robustesse.

- [x] **Task 5 — Test de robustesse** (AC: #3, #5)
  - [x] Test : buffer non-PDF (texte brut) → `extractStatement` rejette avec erreur explicite.
  - [x] Test : buffer vide → rejette avec erreur explicite.
  - [x] Comportement `null` sans erreur sur texte sans patterns garanti par contrat (`extractPeriod`/`extractBalances` retournent `null`).

- [x] **Task 6 — Vérifier l'isolation** (AC: #4)
  - [x] `grep` confirme la seule occurrence : `server/services/pdf-extractor.ts:7`.

- [x] **Task 7 — Sanity check final**
  - [x] `yarn lint` propre. `yarn test:run` : 10 tests pdf-extractor passent (1 skipped fixture). `yarn typecheck` propre sur les fichiers de cette story (les erreurs résiduelles concernent `llm-categorizer.ts`, story 2.4 non démarrée).

## Dev Notes

### Snippet `server/services/pdf-extractor.ts` (Tasks 1-3)

```ts
/**
 * pdf-extractor — extraction texte + métadonnées d'un relevé bancaire PDF.
 *
 * SEUL POINT D'ENTRÉE vers `unpdf` (NFR16). Tout autre import de `unpdf` ailleurs
 * dans le code est un anti-pattern documenté dans CLAUDE.md.
 */
import { extractText } from 'unpdf'
import { eurosToCents, type Cents } from '~/shared/types/money'

export interface RawStatement {
  /** Texte concaténé de toutes les pages du PDF. */
  rawText: string
  /** Première date de la période couverte (YYYY-MM-DD) ou null si non détectée. */
  periodStart: string | null
  /** Dernière date de la période couverte (YYYY-MM-DD) ou null. */
  periodEnd: string | null
  /** Solde d'ouverture du relevé en Cents, null si non détecté. */
  openingBalanceCents: Cents | null
  /** Solde de clôture du relevé en Cents, null si non détecté. */
  closingBalanceCents: Cents | null
}

export async function extractStatement(pdfBuffer: Buffer): Promise<RawStatement> {
  let rawText: string

  try {
    // unpdf accepte Uint8Array — Buffer en hérite
    const result = await extractText(new Uint8Array(pdfBuffer), { mergePages: true })
    rawText = typeof result.text === 'string' ? result.text : (Array.isArray(result.text) ? result.text.join('\n') : '')
  } catch (err) {
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!rawText || rawText.trim().length === 0) {
    throw new Error('PDF contains no extractable text')
  }

  const period = extractPeriod(rawText)
  const balances = extractBalances(rawText)

  return {
    rawText,
    periodStart: period.start,
    periodEnd: period.end,
    openingBalanceCents: balances.openingCents,
    closingBalanceCents: balances.closingCents,
  }
}

// === helpers internes ===

const FR_DATE_RE = /(\d{2})\/(\d{2})\/(\d{4})/

/** Convertit JJ/MM/AAAA → YYYY-MM-DD. Retourne null si invalide. */
function frDateToIso(dd: string, mm: string, yyyy: string): string | null {
  const day = Number(dd)
  const month = Number(mm)
  const year = Number(yyyy)
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${yyyy}-${mm}-${dd}`
}

interface PeriodResult {
  start: string | null
  end: string | null
}

/**
 * Tente de localiser la période couverte par le relevé.
 * Patterns courants Boursorama (à confirmer/ajuster sur fixture réelle) :
 *   - "Période du JJ/MM/AAAA au JJ/MM/AAAA"
 *   - "Du JJ/MM/AAAA au JJ/MM/AAAA"
 *   - "RELEVE DE COMPTE - Période : JJ/MM/AAAA - JJ/MM/AAAA"
 */
function extractPeriod(rawText: string): PeriodResult {
  const patterns: RegExp[] = [
    /[Pp]ériode\s+du\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/,
    /[Dd]u\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})/,
  ]

  for (const re of patterns) {
    const m = rawText.match(re)
    if (m && m.length >= 7) {
      const start = frDateToIso(m[1]!, m[2]!, m[3]!)
      const end = frDateToIso(m[4]!, m[5]!, m[6]!)
      if (start && end && start <= end) return { start, end }
    }
  }

  return { start: null, end: null }
}

interface BalancesResult {
  openingCents: Cents | null
  closingCents: Cents | null
}

/**
 * Tente d'extraire les soldes d'ouverture et de clôture.
 * Patterns courants Boursorama (à confirmer/ajuster sur fixture réelle) :
 *   - "Solde précédent au JJ/MM/AAAA : 1 234,56 €"
 *   - "Ancien solde : 1 234,56"
 *   - "Nouveau solde au JJ/MM/AAAA : 1 234,56 €"
 *   - "Solde au JJ/MM/AAAA : 1 234,56 €"
 */
function extractBalances(rawText: string): BalancesResult {
  const opening = matchAmountByLabels(rawText, [
    /[Ss]olde\s+pr[ée]c[ée]dent[^0-9-]{0,30}([0-9 .,  -]+)/,
    /[Aa]ncien\s+solde[^0-9-]{0,30}([0-9 .,  -]+)/,
  ])

  const closing = matchAmountByLabels(rawText, [
    /[Nn]ouveau\s+solde[^0-9-]{0,30}([0-9 .,  -]+)/,
    /[Ss]olde\s+au\s+\d{2}\/\d{2}\/\d{4}[^0-9-]{0,10}([0-9 .,  -]+)/,
  ])

  return { openingCents: opening, closingCents: closing }
}

function matchAmountByLabels(rawText: string, patterns: RegExp[]): Cents | null {
  for (const re of patterns) {
    const m = rawText.match(re)
    if (m && m[1]) {
      const cents = parseFrAmount(m[1])
      if (cents !== null) return cents
    }
  }
  return null
}

/**
 * Parse un montant FR ("1 234,56" ou "-1 234,56" ou "1234.56") vers Cents.
 * Gère les espaces fines/insécables ( ,  ) utilisés en typographie FR.
 */
export function parseFrAmount(s: string): Cents | null {
  // Nettoyer : enlever espaces (incl. insécables) et "€", remplacer virgule par point
  const cleaned = s.replace(/[\s  €]/g, '').replace(',', '.')
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return eurosToCents(num)
}
```

### Snippet test minimal `server/services/pdf-extractor.test.ts` (Task 4-5)

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractStatement, parseFrAmount } from './pdf-extractor'
import { eurosToCents } from '~/shared/types/money'

const FIXTURE_PATH = resolve('tests/fixtures/pdfs/statement-jan-2026.pdf')

describe('parseFrAmount', () => {
  it('parses standard FR amount', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })
  it('parses with euro symbol', () => {
    expect(parseFrAmount('1 234,56 €')).toBe(eurosToCents(1234.56))
  })
  it('parses negative amount', () => {
    expect(parseFrAmount('-12,34')).toBe(eurosToCents(-12.34))
  })
  it('parses with non-breaking spaces (U+00A0)', () => {
    expect(parseFrAmount('1 234,56')).toBe(eurosToCents(1234.56))
  })
  it('returns null on garbage', () => {
    expect(parseFrAmount('hello')).toBeNull()
  })
})

describe('extractStatement', () => {
  it('throws on non-PDF buffer', async () => {
    const garbage = Buffer.from('this is not a pdf')
    await expect(extractStatement(garbage)).rejects.toThrow()
  })

  it.skipIf(!existsSync(FIXTURE_PATH))('extracts text and metadata from a real Boursorama statement', async () => {
    const buf = readFileSync(FIXTURE_PATH)
    const result = await extractStatement(buf)

    expect(result.rawText.length).toBeGreaterThan(100)
    // Les valeurs exactes dépendent du PDF utilisé — à renseigner ici par le dev
    // après une première exécution exploratoire (console.log puis transformer en assert).
    expect(result.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.openingBalanceCents).not.toBeNull()
    expect(result.closingBalanceCents).not.toBeNull()
  })
})
```

### Préparation des fixtures

Avant de coder cette story, l'utilisateur doit :
1. Récupérer 1-3 relevés Boursorama PDF (n'importe quels mois récents).
2. Les anonymiser si désiré (gomme/floute le numéro de compte si tu veux les commit ; sinon laisse-les hors git via `tests/fixtures/pdfs/.gitkeep` + entry `.gitignore`).
3. Les placer dans `tests/fixtures/pdfs/`.
4. Renseigner les valeurs attendues (période, soldes) après première exécution du test.

**Décision V1** : `tests/fixtures/pdfs/*.pdf` est gitignored par défaut (données potentiellement sensibles). Ajouter dans `.gitignore` :
```
tests/fixtures/pdfs/*.pdf
!tests/fixtures/pdfs/.gitkeep
```

### Validation des regex Boursorama

Les patterns proposés sont **best-effort** sans vrai PDF en main. Le dev agent doit, lors de l'implémentation :
1. Tester sur le PDF réel.
2. Si un pattern ne match pas, ajouter un `console.log(rawText.substring(0, 2000))` temporaire pour voir le format exact du texte extrait par `unpdf`.
3. Ajuster les regex et les commit avec un commentaire indiquant la version Boursorama observée.
4. **Documenter dans Completion Notes** les patterns retenus, pour que les Stories 2.6 / Growth (multi-banques) en bénéficient.

### Anti-patterns à éviter

- ❌ Importer `unpdf` ailleurs — bloquant, viole NFR16.
- ❌ Faire du parsing complexe de transactions ici — c'est le job du LLM (Story 2.4). Cette story extrait UNIQUEMENT le texte brut + période + soldes.
- ❌ Utiliser `parseFloat` directement sur une string FR sans nettoyer les espaces / virgule — utiliser `parseFrAmount`.
- ❌ Tenter d'inférer la période depuis les dates de transactions ici — c'est le job de l'orchestrateur (Story 2.6) en fallback. Ce service retourne `null` si non trouvé dans le texte.

### Project Structure Notes

Cette story crée :
- `server/services/pdf-extractor.ts`
- `server/services/pdf-extractor.test.ts`
- `tests/fixtures/pdfs/.gitkeep` (placeholder)
- Modification `.gitignore` (ajout `tests/fixtures/pdfs/*.pdf`)

### Definition of Done

- [ ] `extractStatement` exposée avec interface stable `RawStatement`
- [ ] Parsing période et soldes implémenté (avec gestion des dates FR et montants FR)
- [ ] `parseFrAmount` exportée pour réutilisation éventuelle (et testable)
- [ ] Tests unitaires sur `parseFrAmount` (5+ cas)
- [ ] Test sur fixture réelle (skipped si fixture absente, mais idéalement présente)
- [ ] Test sur buffer non-PDF
- [ ] Aucun import `unpdf` en dehors de ce service (vérifié par grep)
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres

### References

- [Source: `CLAUDE.md`#Stack verrouillée] — `unpdf`
- [Source: `CLAUDE.md`#Invariants critiques §Boundaries imperméables] — `unpdf` consommé exclusivement depuis `pdf-extractor.ts`
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Cross-Cutting Concerns §6] — surface d'erreur LLM/extraction
- [Source: `_bmad-output/planning-artifacts/architecture.md`#NFR16] — parser PDF isolé
- [Source: `_bmad-output/planning-artifacts/architecture.md`#G3] — extraction période + fallback
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 2.2] — story originale

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context) — bmad-dev-story workflow.

### Debug Log References

- `unpdf@1.6.2`. Avec `mergePages: true`, `extractText` retourne `{ text: string, totalPages: number }` typé `string`, donc plus besoin du fallback array de la spec.
- Test fixture auto-détecte le premier `*.pdf` du dossier ; assertions strictes verrouillées sur `Releve-compte-31-03-2026.pdf` via guard sur le nom de fichier (test générique séparé pour les autres).
- **Patterns validés sur Boursobank (relevé mars 2026)** :
  - Période : pattern existant `/[Dd]u (\d{2})\/(\d{2})\/(\d{4}) au (\d{2})\/(\d{2})\/(\d{4})/` ✓
  - Solde d'ouverture : `/SOLDE AU : \d{2}\/\d{2}\/\d{4}\s+(-?[\d   .,]+?)\s/i` (libellé spécifique Boursobank, **pas** "Solde précédent")
  - Solde de clôture : capture des **3 montants** après `"Nouveau solde en EUR : Montant frais bancaires* :"` puis prise du **2e** (layout aplati par unpdf : `<total> <solde> <frais>`).
- **`parseFrAmount` étendu** : Boursobank affiche les milliers avec un point (`1.023,98`) dans le récap final. Heuristique ajoutée : si la chaîne contient une virgule → `,` est décimal, tous les `.` sont des séparateurs de milliers ; sinon → `.` est décimal (fallback ASCII).

### Completion Notes List

- **Implémentation** : service unique `server/services/pdf-extractor.ts` exposant `extractStatement(Buffer): Promise<RawStatement>` + helper `parseFrAmount` (testable, exporté).
- **Boundary NFR16** : seul `import { extractText } from 'unpdf'` autorisé est dans ce service. Vérifié via `grep`. Documenté en JSDoc du module.
- **Conversion FR** : `parseFrAmount` gère espace standard, U+00A0 (insécable), U+202F (fine insécable), virgule décimale, signe négatif, symbole €. 8 cas testés.
- **Convention import alias** : `~~/shared/types/money` (root via `~~`), Nuxt 4 résout `~` → `app/`, donc `~~` est correct côté server pour atteindre `shared/`.
- **Erreurs** : remontent en `Error` natif (pas de `createError` ici, c'est un service pur ; le wrap en `pdf_parse_failed`/`llm_extraction_failed` reste à la charge de l'endpoint Story 2.6).
- **Fixture absente** : aucun PDF Boursorama dans `tests/fixtures/pdfs/`. Le test correspondant est `it.skipIf(!fixturePath)` — il s'exécutera dès qu'un PDF anonymisé sera déposé.
- **Pré-existant hors scope** : `server/services/llm-categorizer.ts` (story 2.4 non livrée) a des erreurs typecheck/test ; non touché.

### File List

- `server/services/pdf-extractor.ts` (nouveau)
- `server/services/pdf-extractor.test.ts` (nouveau)
- `tests/fixtures/pdfs/.gitkeep` (nouveau, placeholder)

### Change Log

- 2026-04-30 — Implémentation initiale du service `pdf-extractor` (Story 2.2). Wrapper `unpdf` isolé conforme NFR16, helpers `parseFrAmount`/`extractPeriod`/`extractBalances`, 10 tests verts.
- 2026-05-01 — Patterns soldes adaptés au format Boursobank réel après dépôt fixture `Releve-compte-31-03-2026.pdf`. `parseFrAmount` gère désormais le format milliers-point (`1.023,98`). Test fixture verrouillé sur valeurs exactes (478,41 € → 1 023,98 €, 28/02 → 31/03). 14 tests verts.

### Review Findings

- [x] [Review][Decision→Patch] `parseFrAmount("1.234")` ambiguïté résolue en mode strict — `\d+\.\d{3}` sans virgule retourne `null`. Tests ajoutés (`1.234`, `12.345` → null ; `1234.56` → OK).
- [x] [Review][Decision→Defer] `matchClosingBoursobank` verrouillé sur 3 montants — status quo, protégé par fixture exacte + invariant `closing(t)===opening(t+1)`. À revoir si dérive observée.
- [x] [Review][Decision→Patch] `extractPeriod` ancré sur les 2000 premiers caractères — élimine les faux matches sur intervalles parasites en corps de PDF.
- [x] [Review][Decision→Defer] Sanitisation du message d'erreur `unpdf` — service pur, le wrap propre incombe à l'endpoint Story 2.6 (`pdf_parse_failed` sans `data`).

- [x] [Review][Patch] `frDateToIso` accepte des dates calendaires impossibles (31/02, 30/02, 31/04…) [server/services/pdf-extractor.ts:51-58] — Validation actuelle : `month 1-12, day 1-31`. Aucun contrôle jours/mois ni année bissextile. `frDateToIso("31","02","2026")` retourne `"2026-02-31"`. Tout consommateur via `new Date(...)` obtient `2026-03-03`. Fix : validation par mois (28/29/30/31) + leap year.
- [x] [Review][Patch] Test cross-statement passe à vide quand fixtures absentes [server/services/pdf-extractor.test.ts:119-131] — Boucle `if (!curPath || !nextPath) continue` : sans fixtures, le `it(...)` n'exécute aucun `expect()` et passe vert (pas un skip). Fix : remplacer par `it.skipIf(BOURSOBANK_FIXTURES.some(fx => !fixtureByName(fx.file)))` ou `expect.assertions(N)`.
- [x] [Review][Patch] `matchClosingBoursobank` charset incohérent avec les autres regexes [server/services/pdf-extractor.ts:121] — Le charset `[\d.,]` exclut U+00A0 (NBSP) et U+202F (NNBSP), alors que les regexes d'ouverture utilisent `[\d   .,]` (avec NBSP/NNBSP). Si Boursobank passe un jour à un format milliers-espace dans le récap, le solde de clôture devient `null`. Fix : ajouter NBSP/NNBSP au charset.
- [x] [Review][Patch] Garde défensive sur le type runtime de `result.text` [server/services/pdf-extractor.ts:27-29] — Le commentaire affirme que `mergePages: true` garantit `text: string`, mais une dérive de version `unpdf` pourrait retourner `string[]` ; `?? ''` n'attrape que `undefined`, pas un array. `rawText.trim()` lèverait alors un `TypeError` hors du `try`. Fix : `rawText = Array.isArray(result.text) ? result.text.join('\n') : (result.text ?? '')`.

- [x] [Review][Defer] Fixtures PDF gitignored → CI aveugle aux régressions parsing [tests/fixtures/pdfs/] — Sans fixtures, seul `parseFrAmount` + rejet non-PDF/empty sont testés ; toute la logique balances/period n'est validée que localement. Préoccupation process > code, hors-scope story.
- [x] [Review][Defer] AC #3 (texte valide sans patterns → null) non explicitement testé unitairement [server/services/pdf-extractor.test.ts] — Couvert par contrat de type uniquement. Mineur, à ajouter via mock `unpdf` dans une story future ou si le service évolue.
- [x] [Review][Defer] Trailing `\s` requis dans regexes ouverture/clôture-fallback [server/services/pdf-extractor.ts:99-105] — Si le montant est en fin de fichier sans whitespace suiveur, capture `null`. Cas théorique non observé sur fixtures Boursobank.
- [x] [Review][Defer] Fenêtre `[^\d-]{0,30}` peut être trop étroite [server/services/pdf-extractor.ts:100-101] — Pour des libellés legacy avec annotations longues entre étiquette et montant. Aucun cas réel constaté, à ajuster si nouveau format observé.
- [x] [Review][Defer] Tests manquants sur entrées limites de `parseFrAmount` (`'-'`, `'.'`, `','`, `'1,2,3'`, `'1e3'`, leading zeros, montants > MAX_SAFE_INTEGER) — Comportement actuel correct par inspection mais non verrouillé. À compléter dans une passe test ultérieure.
