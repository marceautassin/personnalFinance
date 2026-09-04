import { z } from 'zod'
import { DateIsoSchema } from './transaction.schema'
import { REPAYMENT_MODES } from '~~/shared/types/repayment-mode'

/** Nom du créancier — non vide, borné. */
const CreditorSchema = z.string().trim().min(1, 'Créancier requis').max(80, 'Créancier trop long (max 80)')

/**
 * Solde dû initial en cents, **signé** (story 6.5, D16) : `> 0` = je dois, `< 0` = on me doit.
 *
 * Était contraint ≥ 0, ce qui rendait une **créance** inexprimable et donc FR68 (« solde net
 * créance/dette ») impossible à satisfaire — alors que FR66 prescrit de s'appuyer sur ce
 * modèle pour le compte-courant conjoint (revue du 2026-09-04).
 */
const SignedBalanceCentsSchema = z
  .number()
  .int('Montant en cents entier attendu')
  .refine(n => Math.abs(n) <= 1e11, 'Montant hors bornes')

/** Mensualité en cents strictement positive (une mensualité à 0 n'a pas de sens). */
const PositiveCentsSchema = z
  .number()
  .int('Montant en cents entier attendu')
  .positive('La mensualité doit être strictement positive')
  .max(1e11, 'Montant hors bornes')

const RepaymentModeSchema = z.enum(REPAYMENT_MODES)

/**
 * Valide la cohérence mode ↔ champs :
 *  - `monthly`  → `monthlyAmountCents` requis, `lumpSumDate` interdit
 *  - `lump_sum` → `lumpSumDate` requis, `monthlyAmountCents` interdit
 *  - `free`     → les deux interdits
 * `superRefine` pour émettre plusieurs issues ciblées (path sur le champ fautif).
 */
function refineModeFields(
  d: { repaymentMode: string, monthlyAmountCents?: number | null, lumpSumDate?: string | null },
  ctx: z.RefinementCtx,
) {
  const hasMonthly = d.monthlyAmountCents != null
  const hasLump = d.lumpSumDate != null

  if (d.repaymentMode === 'monthly' && !hasMonthly)
    ctx.addIssue({ code: 'custom', path: ['monthlyAmountCents'], message: 'Mensualité requise en mode mensualité fixe' })
  if (d.repaymentMode === 'lump_sum' && !hasLump)
    ctx.addIssue({ code: 'custom', path: ['lumpSumDate'], message: 'Date requise en mode montant unique' })

  if (d.repaymentMode !== 'monthly' && hasMonthly)
    ctx.addIssue({ code: 'custom', path: ['monthlyAmountCents'], message: 'Mensualité non applicable à ce mode' })
  if (d.repaymentMode !== 'lump_sum' && hasLump)
    ctx.addIssue({ code: 'custom', path: ['lumpSumDate'], message: 'Date non applicable à ce mode' })
}

/** Dette en lecture (sortie d'API) — inclut `id`, `createdAt` et le solde courant calculé. */
export const DebtSchema = z.object({
  id: z.number().int().positive(),
  creditor: CreditorSchema,
  initialBalanceCents: SignedBalanceCentsSchema,
  repaymentMode: RepaymentModeSchema,
  monthlyAmountCents: PositiveCentsSchema.nullable(),
  lumpSumDate: DateIsoSchema.nullable(),
  currentBalanceCents: z.number().int(),
  /**
   * Nombre de transactions marquées comme remboursement de cette dette. Exposé pour que l'UI
   * puisse CHIFFRER l'avertissement avant suppression (story 6.7) plutôt que d'annoncer
   * vaguement une action « définitive ».
   */
  linkedTransactionCount: z.number().int().min(0),
  createdAt: z.number().int(),
})

/** Body de création (`POST`) — sans `id`/`createdAt`/`currentBalanceCents`. */
export const NewDebtSchema = z
  .object({
    creditor: CreditorSchema,
    initialBalanceCents: SignedBalanceCentsSchema,
    repaymentMode: RepaymentModeSchema,
    monthlyAmountCents: PositiveCentsSchema.nullable().optional(),
    lumpSumDate: DateIsoSchema.nullable().optional(),
  })
  .strict()
  .superRefine(refineModeFields)

/**
 * Body de remplacement (`PUT`) — replace complet, `id`/`createdAt` immuables. `.strict()`
 * rejette tout champ inconnu. Mêmes champs et validation croisée que la création (permet le
 * changement de mode, FR30).
 */
export const DebtPutSchema = NewDebtSchema

export type Debt = z.infer<typeof DebtSchema>
export type NewDebt = z.infer<typeof NewDebtSchema>
export type DebtPut = z.infer<typeof DebtPutSchema>
