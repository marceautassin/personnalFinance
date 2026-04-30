# Story 2.2: Service `pdf-extractor` (wrapper `unpdf`)

Status: ready-for-dev

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

- [ ] **Task 1 — Implémenter `extractStatement`** (AC: #1, #3, #5)
  - [ ] Créer `server/services/pdf-extractor.ts` selon le snippet Dev Notes
  - [ ] Le service expose une seule fonction publique : `extractStatement(buf: Buffer): Promise<RawStatement>`
  - [ ] Type `RawStatement` exporté
  - [ ] Toute la logique de parsing texte (regex pour période et soldes) reste dans ce module — pas de leak ailleurs

- [ ] **Task 2 — Parser la période** (AC: #1, #3)
  - [ ] Implémenter une fonction interne `extractPeriod(rawText): { start: string | null, end: string | null }` qui cherche les patterns Boursorama courants. Voir Dev Notes pour les regex à essayer.
  - [ ] Si trouvé : retourner les dates au format `YYYY-MM-DD` (Boursorama affiche en `JJ/MM/AAAA` → conversion explicite)
  - [ ] Si non trouvé : `{ start: null, end: null }`

- [ ] **Task 3 — Parser les soldes** (AC: #1, #3)
  - [ ] Implémenter `extractBalances(rawText): { openingCents: Cents | null, closingCents: Cents | null }` qui cherche les libellés "Solde précédent", "Ancien solde", "Nouveau solde", "Solde au [date]" etc.
  - [ ] Conversion via `eurosToCents` (helper Story 1.3)
  - [ ] Garder la sémantique des signes : un solde négatif (compte à découvert) reste négatif

- [ ] **Task 4 — Test sur fixture réelle** (AC: #2)
  - [ ] Placer un PDF Boursorama réel anonymisé dans `tests/fixtures/pdfs/statement-jan-2026.pdf` (à fournir manuellement par l'utilisateur — préciser dans Completion Notes la date du relevé utilisé)
  - [ ] Écrire `server/services/pdf-extractor.test.ts` qui :
    - Charge le buffer du PDF de fixture
    - Appelle `extractStatement`
    - Vérifie que `rawText` contient des mots-clés attendus (ex: "BOURSORAMA", "RELEVE")
    - Vérifie période et soldes (les valeurs exactes dépendent du PDF — le dev agent les renseignera dans le test après une première exécution exploratoire)
  - [ ] Si aucun PDF fixture disponible, créer un test minimal qui passe un buffer vide ou random et vérifie que la fonction lève (AC#5)

- [ ] **Task 5 — Test de robustesse** (AC: #3, #5)
  - [ ] Test : buffer non-PDF (par ex. random bytes ou texte brut) → erreur explicite
  - [ ] Test : PDF valide mais sans pattern de période → champs à `null` (pas d'erreur)

- [ ] **Task 6 — Vérifier l'isolation** (AC: #4)
  - [ ] Lancer `grep -rn "from 'unpdf'" .` (ou équivalent) en excluant `node_modules/` et `_bmad-output/`
  - [ ] Vérifier que la seule occurrence est dans `server/services/pdf-extractor.ts`

- [ ] **Task 7 — Sanity check final**
  - [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [ ] Commit unique

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

_(à remplir)_

### Debug Log References

_(à remplir — patterns regex effectivement validés sur le PDF Boursorama réel)_

### Completion Notes List

_(à remplir — version d'`unpdf` utilisée, format Boursorama observé, valeurs exactes du PDF de test)_

### File List

_(à remplir)_
