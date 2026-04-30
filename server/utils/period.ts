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

/** Extrait le mois (YYYY-MM) d'une date ISO (YYYY-MM-DD). Throw si date calendrier invalide. */
export function monthOf(dateIso: string): string {
  const [y, mIdx] = parseDateIso(dateIso)
  return `${String(y).padStart(4, '0')}-${String(mIdx + 1).padStart(2, '0')}`
}

/** Parse "YYYY-MM" en { year, month } (1-indexed). null si invalide. */
export function parseMonth(s: string): { year: number, month: number } | null {
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
  parseDateIso(start1)
  parseDateIso(end1)
  parseDateIso(start2)
  parseDateIso(end2)
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
  if (!Number.isInteger(n)) throw new Error(`nextMonths: n doit être un entier (${n})`)
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
  const [y1, m1, d1d] = parseDateIso(d1)
  const [y2, m2, d2d] = parseDateIso(d2)
  const t1 = Date.UTC(y1, m1, d1d)
  const t2 = Date.UTC(y2, m2, d2d)
  return Math.round((t2 - t1) / 86_400_000)
}

function parseDateIso(s: string): [number, number, number] {
  const m = s.match(DATE_ISO_RE)
  if (!m) throw new Error(`parseDateIso: '${s}' invalide (YYYY-MM-DD attendu)`)
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  // Calendar validation : Date.UTC roule silencieusement (2026-02-31 → 2026-03-03).
  // On vérifie le round-trip pour rejeter les dates impossibles.
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (
    utc.getUTCFullYear() !== year
    || utc.getUTCMonth() !== month - 1
    || utc.getUTCDate() !== day
  ) {
    throw new Error(`parseDateIso: '${s}' n'est pas une date calendrier valide`)
  }
  // mois en JS est 0-indexed
  return [year, month - 1, day]
}
