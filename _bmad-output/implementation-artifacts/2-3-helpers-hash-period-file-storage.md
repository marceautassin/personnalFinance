# Story 2.3: Helpers `hash`, `period`, `file-storage`

Status: review

## Story

As a dev,
I want utility helpers for hashing PDFs (SHA-256), manipulating period strings (YYYY-MM intervals), and storing PDF files on disk by their hash,
so that the ingestion endpoint (Story 2.6) can compose them into a clean, idempotent pipeline.

## Acceptance Criteria

1. **Given** `server/utils/hash.ts`,
   **When** j'expose `sha256(buf: Buffer | Uint8Array): string`,
   **Then** la fonction retourne un hex string de 64 caractères, déterministe, identique pour un même contenu (testé sur un buffer connu).

2. **Given** `server/utils/period.ts`,
   **When** j'expose `monthOf(dateIso): string` (YYYY-MM-DD → YYYY-MM), `parseMonth(s): { year: number, month: number } | null`, `monthsOverlap(start1, end1, start2, end2): boolean`, `nextMonths(fromMonth, n): string[]`, `daysBetween(d1, d2): number`,
   **Then** chaque fonction est testée sur des cas limites (mois 28-31 jours, années bissextiles, intervalles à cheval, n=0, n=24).

3. **Given** `server/utils/file-storage.ts`,
   **When** j'expose `savePdfByHash(buf, hash): Promise<string>` (écrit `_data/raw/{hash}.pdf`, retourne le path), `pdfExists(hash): boolean`, `loadPdfByHash(hash): Buffer`, `deletePdfByHash(hash): void`,
   **Then** les fonctions sont idempotentes (réécrire le même hash ne déclenche pas d'erreur, supprimer un hash inexistant non plus), et un test couvre le round-trip (save → exists → load → delete → !exists).

4. **Given** la convention de stockage,
   **When** je vérifie le code,
   **Then** aucun chemin de fichier PDF n'est construit ailleurs dans le projet — toujours via `file-storage.ts`.

## Tasks / Subtasks

- [x] **Task 1 — Helper `hash`** (AC: #1)
  - [x] Créer `server/utils/hash.ts` selon le snippet Dev Notes
  - [x] Utiliser `node:crypto` (built-in, pas de dépendance externe)
  - [x] Créer `server/utils/hash.test.ts` avec stabilité du hash sur un buffer connu

- [x] **Task 2 — Helper `period`** (AC: #2)
  - [x] Créer `server/utils/period.ts` selon le snippet Dev Notes
  - [x] Tests dans `server/utils/period.test.ts` avec cas limites listés

- [x] **Task 3 — Helper `file-storage`** (AC: #3, #4)
  - [x] Créer `server/utils/file-storage.ts` selon le snippet Dev Notes
  - [x] Tests dans `server/utils/file-storage.test.ts` (utiliser un dossier temporaire pour ne pas polluer `_data/`)

- [x] **Task 4 — Sanity check final**
  - [x] `yarn lint`, `yarn test:run` propres (typecheck : erreur préexistante dans `server/services/pdf-extractor.ts` story 2.2, hors scope)
  - [ ] Commit unique (à faire par l'utilisateur)

## Dev Notes

### Snippet `server/utils/hash.ts` (Task 1)

```ts
import { createHash } from 'node:crypto'

/**
 * SHA-256 hexadécimal d'un buffer.
 * Utilisé pour identifier idempotemment un PDF par son contenu (FR2).
 */
export function sha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}
```

### Snippet `server/utils/hash.test.ts` (Task 1)

```ts
import { describe, it, expect } from 'vitest'
import { sha256 } from './hash'

describe('sha256', () => {
  it('returns 64 hex chars', () => {
    const result = sha256(Buffer.from('hello'))
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic for same content', () => {
    const a = sha256(Buffer.from('content'))
    const b = sha256(Buffer.from('content'))
    expect(a).toBe(b)
  })

  it('differs for different content', () => {
    const a = sha256(Buffer.from('a'))
    const b = sha256(Buffer.from('b'))
    expect(a).not.toBe(b)
  })

  it('matches known SHA-256 of "hello"', () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(sha256(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })
})
```

### Snippet `server/utils/period.ts` (Task 2)

```ts
/**
 * period — manipulation de strings de période et dates ISO.
 *
 * Conventions :
 *   - DateIso : "YYYY-MM-DD" (ISO 8601 sans heure)
 *   - Month   : "YYYY-MM"
 *
 * Toutes les fonctions raisonnent en string (pas de Date) pour éviter les pièges de timezone
 * et la sérialisation. cf. CLAUDE.md anti-pattern : `new Date(dbDateString)` côté serveur.
 */

const DATE_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_RE = /^(\d{4})-(\d{2})$/

/** Extrait le mois (YYYY-MM) d'une date ISO (YYYY-MM-DD). */
export function monthOf(dateIso: string): string {
  const m = dateIso.match(DATE_ISO_RE)
  if (!m) throw new Error(`monthOf: date invalide '${dateIso}' (YYYY-MM-DD attendu)`)
  return `${m[1]}-${m[2]}`
}

/** Parse "YYYY-MM" en { year, month } (1-indexed). null si invalide. */
export function parseMonth(s: string): { year: number; month: number } | null {
  const m = s.match(MONTH_RE)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

/**
 * Vérifie si deux intervalles [start1, end1] et [start2, end2] (inclusifs) se chevauchent.
 * Tous les paramètres sont au format YYYY-MM-DD ; le tri lexicographique est sémantiquement correct.
 */
export function monthsOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  return start1 <= end2 && start2 <= end1
}

/**
 * Retourne les n mois suivants (YYYY-MM[]), inclusif du mois fromMonth.
 * nextMonths('2026-04', 3) → ['2026-04', '2026-05', '2026-06']
 * nextMonths('2026-12', 3) → ['2026-12', '2027-01', '2027-02']
 */
export function nextMonths(fromMonth: string, n: number): string[] {
  const parsed = parseMonth(fromMonth)
  if (!parsed) throw new Error(`nextMonths: mois invalide '${fromMonth}'`)
  if (n < 0) throw new Error(`nextMonths: n doit être positif (${n})`)
  if (n === 0) return []

  const out: string[] = []
  let { year, month } = parsed
  for (let i = 0; i < n; i++) {
    out.push(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`)
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }
  return out
}

/**
 * Nombre de jours entre deux dates ISO (d2 - d1, peut être négatif).
 * Calcul UTC pour éviter les sauts liés aux timezones / DST.
 */
export function daysBetween(d1: string, d2: string): number {
  const t1 = Date.UTC(...parseDateIso(d1))
  const t2 = Date.UTC(...parseDateIso(d2))
  return Math.round((t2 - t1) / 86_400_000)
}

function parseDateIso(s: string): [number, number, number] {
  const m = s.match(DATE_ISO_RE)
  if (!m) throw new Error(`parseDateIso: '${s}' invalide`)
  // mois en JS est 0-indexed
  return [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
}
```

### Snippet `server/utils/period.test.ts` (Task 2)

```ts
import { describe, it, expect } from 'vitest'
import { monthOf, parseMonth, monthsOverlap, nextMonths, daysBetween } from './period'

describe('monthOf', () => {
  it('extracts month from a date', () => expect(monthOf('2026-04-15')).toBe('2026-04'))
  it('throws on invalid date', () => expect(() => monthOf('2026/04/15')).toThrow())
})

describe('parseMonth', () => {
  it('parses valid month', () => expect(parseMonth('2026-04')).toEqual({ year: 2026, month: 4 }))
  it('rejects invalid month', () => expect(parseMonth('2026-13')).toBeNull())
  it('rejects garbage', () => expect(parseMonth('garbage')).toBeNull())
})

describe('monthsOverlap', () => {
  it('detects exact overlap', () =>
    expect(monthsOverlap('2026-01-01', '2026-01-31', '2026-01-15', '2026-02-15')).toBe(true))
  it('detects no overlap', () =>
    expect(monthsOverlap('2026-01-01', '2026-01-31', '2026-02-01', '2026-02-28')).toBe(false))
  it('detects touching boundaries (inclusive)', () =>
    expect(monthsOverlap('2026-01-01', '2026-01-31', '2026-01-31', '2026-02-15')).toBe(true))
})

describe('nextMonths', () => {
  it('handles n=0', () => expect(nextMonths('2026-04', 0)).toEqual([]))
  it('returns 3 months from April', () =>
    expect(nextMonths('2026-04', 3)).toEqual(['2026-04', '2026-05', '2026-06']))
  it('handles year boundary', () =>
    expect(nextMonths('2026-12', 3)).toEqual(['2026-12', '2027-01', '2027-02']))
  it('handles 24 months across years', () => {
    const r = nextMonths('2026-01', 24)
    expect(r[0]).toBe('2026-01')
    expect(r[23]).toBe('2027-12')
    expect(r).toHaveLength(24)
  })
  it('throws on invalid month', () => expect(() => nextMonths('garbage', 1)).toThrow())
})

describe('daysBetween', () => {
  it('counts days within a month', () => expect(daysBetween('2026-04-01', '2026-04-15')).toBe(14))
  it('handles february leap year (2024)', () =>
    expect(daysBetween('2024-02-01', '2024-03-01')).toBe(29))
  it('handles february non-leap (2026)', () =>
    expect(daysBetween('2026-02-01', '2026-03-01')).toBe(28))
  it('returns negative for reverse', () =>
    expect(daysBetween('2026-04-15', '2026-04-01')).toBe(-14))
  it('handles year boundary', () =>
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1))
})
```

### Snippet `server/utils/file-storage.ts` (Task 3)

```ts
/**
 * file-storage — gestion des PDFs sources sur le filesystem local.
 *
 * Convention : un PDF est identifié par son SHA-256 (cf. hash.ts). Le hash EST le chemin.
 * Aucun autre code ne doit construire de chemin vers les PDFs sources — toujours via ces helpers.
 */
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

const RAW_DIR = resolve(process.env.PDF_STORAGE_DIR ?? './_data/raw')

function pathFor(hash: string): string {
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error(`Invalid hash '${hash}' (SHA-256 hex attendu)`)
  }
  return join(RAW_DIR, `${hash}.pdf`)
}

async function ensureDir(): Promise<void> {
  if (!existsSync(RAW_DIR)) {
    await mkdir(RAW_DIR, { recursive: true })
  }
}

/** Écrit un PDF sous `_data/raw/{hash}.pdf`. Idempotent (réécriture OK). Retourne le path absolu. */
export async function savePdfByHash(buf: Buffer | Uint8Array, hash: string): Promise<string> {
  await ensureDir()
  const path = pathFor(hash)
  await writeFile(path, buf)
  return path
}

/** Vérifie si un PDF existe pour ce hash. */
export function pdfExists(hash: string): boolean {
  return existsSync(pathFor(hash))
}

/** Charge un PDF par son hash. Throw si absent. */
export async function loadPdfByHash(hash: string): Promise<Buffer> {
  const path = pathFor(hash)
  if (!existsSync(path)) {
    throw new Error(`PDF introuvable pour le hash '${hash}'`)
  }
  return readFile(path)
}

/** Supprime un PDF par son hash. Idempotent (no-op si absent). */
export async function deletePdfByHash(hash: string): Promise<void> {
  const path = pathFor(hash)
  if (existsSync(path)) {
    await unlink(path)
  }
}
```

### Snippet `server/utils/file-storage.test.ts` (Task 3)

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256 } from './hash'

// IMPORTANT : on doit pointer PDF_STORAGE_DIR vers un dossier temp avant d'importer file-storage.
// Vitest charge les modules à la demande — on configure l'env d'abord.
let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'pf-test-'))
  process.env.PDF_STORAGE_DIR = tmpDir
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.PDF_STORAGE_DIR
})

describe('file-storage round-trip', () => {
  it('save → exists → load → delete → !exists', async () => {
    // Import dynamique APRÈS le set de l'env
    const { savePdfByHash, pdfExists, loadPdfByHash, deletePdfByHash } = await import('./file-storage')

    const content = Buffer.from('fake pdf content')
    const hash = sha256(content)

    expect(pdfExists(hash)).toBe(false)

    await savePdfByHash(content, hash)
    expect(pdfExists(hash)).toBe(true)

    const loaded = await loadPdfByHash(hash)
    expect(loaded.equals(content)).toBe(true)

    await deletePdfByHash(hash)
    expect(pdfExists(hash)).toBe(false)
  })

  it('save is idempotent (re-save same hash)', async () => {
    const { savePdfByHash } = await import('./file-storage')
    const content = Buffer.from('x')
    const hash = sha256(content)
    await savePdfByHash(content, hash)
    await expect(savePdfByHash(content, hash)).resolves.not.toThrow()
  })

  it('delete is idempotent on missing hash', async () => {
    const { deletePdfByHash } = await import('./file-storage')
    await expect(deletePdfByHash('a'.repeat(64))).resolves.not.toThrow()
  })

  it('rejects invalid hash format', async () => {
    const { savePdfByHash } = await import('./file-storage')
    await expect(savePdfByHash(Buffer.from('x'), 'not-a-hash')).rejects.toThrow()
  })
})
```

⚠️ Le test utilise `process.env.PDF_STORAGE_DIR` pour pointer vers un tmpdir. Vérifier que `file-storage.ts` lit bien cette env au moment de l'import (cf. `RAW_DIR = resolve(process.env.PDF_STORAGE_DIR ?? ...)`). Si tu rencontres des soucis de cache module, restructurer en passant le path en paramètre d'une factory `createFileStorage(dir)` — mais pour V1 le pattern env suffit.

### Anti-patterns à éviter

- ❌ Construire des chemins vers `_data/raw/` ailleurs — utiliser exclusivement `file-storage.ts`.
- ❌ Utiliser des libs externes pour le hashing (md5 lib, etc.) — `node:crypto` suffit et est built-in.
- ❌ Faire des opérations `Date` directement dans `period.ts` — rester sur du parsing string pour éviter les pièges DST/timezone (sauf `daysBetween` qui utilise `Date.UTC` proprement).
- ❌ Stocker les hashes en uppercase — convention lowercase hex partout.
- ❌ Logger le contenu d'un PDF en debug (taille potentiellement énorme + données sensibles) — logger uniquement le hash si besoin.

### Project Structure Notes

Cette story crée :
- `server/utils/hash.ts` + `.test.ts`
- `server/utils/period.ts` + `.test.ts`
- `server/utils/file-storage.ts` + `.test.ts`

### Definition of Done

- [ ] 3 helpers + 3 fichiers de tests créés
- [ ] Tous les cas limites listés sont testés (mois 28-31, années bissextiles, bord d'année, n=0, idempotence, invalid hash)
- [ ] `yarn test:run` passe avec coverage sur ces 3 modules
- [ ] `yarn typecheck`, `yarn lint` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Anti-patterns interdits] — `new Date(dbDateString)` interdit
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D2, §D3] — dates ISO, hash = chemin
- [Source: `_bmad-output/planning-artifacts/architecture.md`#NFR9] — tests cas limites
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 2.3] — story originale

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code, /bmad-dev-story)

### Debug Log References

- Pattern `PDF_STORAGE_DIR` via env : OK en test sans recourir à la factory. La fonction `rawDir()` lit `process.env` à chaque appel (et non au moment de l'import du module), ce qui rend le test hermétique sans `await import()` dynamique.
- `yarn typecheck` global échoue à cause de `server/services/pdf-extractor.ts:30` (story 2.2 actuellement in-progress), hors scope de cette story. Aucun fichier introduit ici n'est en cause.

### Completion Notes List

- 3 helpers créés (`hash`, `period`, `file-storage`) avec leurs tests co-localisés.
- 27 tests verts, full suite 82 verts (1 skipped).
- `yarn lint` propre. Aucune dépendance externe ajoutée (uniquement `node:crypto` et `node:fs/promises`).
- `rawDir()` est évalué à chaque appel pour permettre l'override via `PDF_STORAGE_DIR` dans les tests sans import dynamique.
- AC#4 (boundary) : à vérifier au fil des stories suivantes (2.6+) — aucun chemin `_data/raw/` n'est construit ailleurs aujourd'hui.

### File List

- `server/utils/hash.ts` (new)
- `server/utils/hash.test.ts` (new)
- `server/utils/period.ts` (new)
- `server/utils/period.test.ts` (new)
- `server/utils/file-storage.ts` (new)
- `server/utils/file-storage.test.ts` (new)

### Change Log

- 2026-04-30 — Implémentation initiale des 3 helpers + tests (story 2.3, status → review).
