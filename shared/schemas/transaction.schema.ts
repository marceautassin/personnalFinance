import { z } from 'zod'

/**
 * Date ISO YYYY-MM-DD avec validation sémantique (rejette 2026-02-30, 2026-13-01, etc.).
 */
export const DateIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD attendu)')
  .refine((s) => {
    const parts = s.split('-')
    const y = Number(parts[0])
    const m = Number(parts[1])
    const d = Number(parts[2])
    const dt = new Date(Date.UTC(y, m - 1, d))
    return (
      dt.getUTCFullYear() === y
      && dt.getUTCMonth() === m - 1
      && dt.getUTCDate() === d
    )
  }, 'Date inexistante (jour/mois invalide)')

/** Libellé non-vide après trim (rejette `"   "`), plafonné à 200 caractères pour éviter les payloads abusifs. */
export const LabelSchema = z.string().trim().min(1, 'Libellé requis').max(200, 'Libellé trop long (max 200 caractères)')

/** Hash SHA-256 hex lowercase (canonique : `crypto.digest('hex')` produit du lowercase). */
export const HashSha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Hash SHA-256 attendu (lowercase hex)')

export const TransactionSchema = z.object({
  id: z.number().int().positive(),
  statementHash: HashSha256Schema,
  transactionDate: DateIsoSchema,
  label: LabelSchema,
  amountCents: z.number().int(),
  categoryItemCode: z.string().min(1),
  isManual: z.boolean(),
  createdAt: z.number().int(),
})

export const NewTransactionSchema = z.object({
  statementHash: HashSha256Schema,
  transactionDate: DateIsoSchema,
  label: LabelSchema,
  amountCents: z.number().int(),
  categoryItemCode: z.string().min(1),
  isManual: z.boolean().default(false),
})

/**
 * Transaction en sortie de catégorisation LLM, avant association au statement (Story 2.6).
 */
export const ExtractedTransactionSchema = z.object({
  transactionDate: DateIsoSchema,
  label: LabelSchema,
  amountCents: z.number().int(),
  categoryItemCode: z.string().min(1),
})

/**
 * Query string de `GET /api/transactions?month=YYYY-MM`.
 */
/**
 * Deux façons de demander des transactions, exclusives l'une de l'autre :
 *
 *  - `month=YYYY-MM` — la vue mensuelle historique ;
 *  - `from`/`to` (+ `item` OU `group` optionnel) — la DESCENTE depuis un agrégat (AR8, NFR2).
 *
 * La descente est ce qui rend NFR2 satisfaisable sans précalcul : l'arbre d'analyse ne
 * transporte aucune ligne, il porte de quoi construire cette requête.
 *
 * `group` a été ajouté le 2026-09-06 pour la trajectoire d'une rubrique : la suivre sur douze
 * tranches sans pouvoir en ouvrir une seule laissait un graphique qu'on ne pouvait pas
 * vérifier. Les deux filtres sont exclusifs — cumuler un poste et une rubrique n'aurait qu'un
 * sens : le poste, si tant est qu'il appartienne à la rubrique. Autant le refuser.
 */
export const TransactionListQuerySchema = z.union([
  z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format mois attendu: YYYY-MM'),
  }).strict(),
  z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu: YYYY-MM-DD'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu: YYYY-MM-DD'),
    item: z.string().trim().min(1).optional(),
    group: z.string().trim().min(1).optional(),
  }).strict()
    .refine(q => q.from <= q.to, { message: 'from doit précéder to', path: ['from'] })
    .refine(q => !(q.item && q.group), {
      message: 'item et group sont exclusifs',
      path: ['group'],
    }),
])

/**
 * Body du `PATCH /api/transactions/[id]`.
 * Tous les champs sont optionnels mais au moins un doit être fourni.
 */
export const TransactionPatchSchema = z
  .object({
    categoryItemCode: z.string().trim().min(1).optional(),
  })
  .refine(
    data => data.categoryItemCode !== undefined,
    { message: 'Au moins un champ doit être fourni' },
  )

export type Transaction = z.infer<typeof TransactionSchema>
export type NewTransaction = z.infer<typeof NewTransactionSchema>
export type ExtractedTransaction = z.infer<typeof ExtractedTransactionSchema>
export type TransactionListQuery = z.infer<typeof TransactionListQuerySchema>

/**
 * Requête mensuelle seule, pour les endpoints qui n'acceptent QUE cette forme (le dashboard).
 * Les faire dépendre de l'union les obligerait à écarter une branche qu'ils ne servent pas.
 */
export const MonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format mois attendu: YYYY-MM'),
})
export type TransactionPatch = z.infer<typeof TransactionPatchSchema>
