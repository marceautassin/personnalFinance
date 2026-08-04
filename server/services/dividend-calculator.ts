import type { Cents } from '~~/shared/types/money'
import type { ForecastResult } from './forecast-engine'

/**
 * dividend-calculator — dividende NET/BRUT requis + marge vs capacité (FR48-50).
 *
 * Fonction PURE (aucun accès DB, aucun `Date.now()`, AUCUN taux fiscal en dur : le taux vient de
 * `tax_settings` via l'appelant) → 100% testable (NFR18). Étend `dividend-capacity` (5.4).
 */

export interface RequiredDividendOptions {
  /** Taux d'imposition dividende en pct × 100 (tax_settings, 3000 = 30 %). */
  dividendTaxRatePct: number
  /** Capacité dividendable BRUTE de la SAS (computeDividendCapacity, 5.4). */
  capacityGrossCents: Cents
}

export interface RequiredDividend {
  /** Dividende NET requis pour garder la trésorerie ≥ 0 sur l'horizon (FR48). */
  requiredNetCents: Cents
  /** Dividende BRUT correspondant (FR49). null si taux = 100 % et net > 0 (impossible). */
  requiredGrossCents: Cents | null
  capacityGrossCents: Cents
  /** capacité − brut requis (FR50). null si brut null. */
  marginCents: Cents | null
  /** Le brut requis tient dans la capacité (FR50). */
  fitsCapacity: boolean
}

/**
 * BRUT = ceil(net × 10000 / (10000 − taux)), en arithmétique entière exacte même au plafond.
 * `net × 10000` peut atteindre 1e16 (> MAX_SAFE_INTEGER ~9e15) : on décompose
 * `net = denom·q + r` pour garder chaque produit sous le seuil. Retourne null si dénominateur ≤ 0.
 */
function grossFromNet(netCents: number, dividendTaxRatePct: number): number | null {
  if (netCents === 0) return 0
  const denom = 10000 - dividendTaxRatePct
  if (denom <= 0) return null // taux ≥ 100 % : aucun net possible
  // ceil(net * 10000 / denom) sans overflow : net = denom·q + r ⇒ net·10000/denom = 10000·q + r·10000/denom.
  const q = Math.floor(netCents / denom)
  const r = netCents % denom
  return q * 10000 + Math.ceil((r * 10000) / denom)
}

/**
 * Calcule le dividende NET requis (comblement du creux de trésorerie), son BRUT (taux fiscal) et
 * la marge vs la capacité dividendable. Modèle v1 : injection disponible dès le départ.
 */
export function computeRequiredDividend(
  forecast: ForecastResult,
  opts: RequiredDividendOptions,
): RequiredDividend {
  const minBalance = forecast.months.reduce(
    (min, m) => Math.min(min, m.endingBalanceCents),
    forecast.startingTreasuryCents as number,
  )
  const requiredNetCents = Math.max(0, -minBalance) as Cents

  const gross = grossFromNet(requiredNetCents, opts.dividendTaxRatePct)
  const requiredGrossCents = gross === null ? null : (gross as Cents)

  const marginCents = requiredGrossCents === null
    ? null
    : ((opts.capacityGrossCents as number) - requiredGrossCents) as Cents
  const fitsCapacity = requiredGrossCents !== null && requiredGrossCents <= opts.capacityGrossCents

  return {
    requiredNetCents,
    requiredGrossCents,
    capacityGrossCents: opts.capacityGrossCents,
    marginCents,
    fitsCapacity,
  }
}
