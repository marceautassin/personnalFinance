/**
 * Formatage des dates pour l'affichage.
 *
 * `2026-08-03` est un format de STOCKAGE — comparable lexicographiquement, insensible aux
 * fuseaux (D2). Il n'a rien à faire à l'écran d'un utilisateur français.
 *
 * Les dates sont découpées à la main plutôt que passées à `new Date(iso)` : ce constructeur
 * interprète une date ISO nue en UTC, ce qui décale l'affichage d'un jour à l'ouest de
 * Greenwich — un piège que `CLAUDE.md` liste en anti-pattern.
 */
const SHORT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })

function toLocalDate(dateIso: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/** `2026-08-03` → `03/08/2026`. */
export function formatDate(dateIso: string): string {
  return SHORT.format(toLocalDate(dateIso))
}

/** `2026-08-03` → `03 août`. */
export function formatDayMonth(dateIso: string): string {
  return DAY_MONTH.format(toLocalDate(dateIso))
}

/** `2026-08-01`, `2026-08-31` → `01/08/2026 → 31/08/2026`. */
export function formatRange(fromIso: string, toIso: string): string {
  return `${formatDate(fromIso)} → ${formatDate(toIso)}`
}
