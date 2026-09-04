/**
 * llm-categorizer — SEUL POINT D'ENTRÉE vers le SDK du fournisseur LLM (NFR16).
 *
 * Fournisseur : **Mistral**, modèle `zai-glm-5-2`, inférence en **Europe** (D20, NFR7).
 * Le changement de fournisseur du 2026-09-05 a tenu dans ce seul fichier : c'est le bénéfice
 * direct de la boundary posée en story 2.4, et la raison de ne jamais la percer.
 *
 * ⚠️ **Les sorties structurées de Mistral sont une INSTRUCTION, pas une contrainte au
 * décodage.** Vérifié sur la documentation puis par sonde le 2026-09-04 : face à des libellés
 * sans poste correspondant, le modèle a renvoyé un code absent du référentiel dans un JSON
 * pourtant conforme au schéma. La conformité vit donc ICI : validation Zod, vérification que
 * chaque code existe réellement, et relance bornée à un essai (AR17).
 *
 * Un schéma protège la FORME, jamais les VALEURS. Ce qui attrape un montant halluciné, c'est
 * la réconciliation contre le solde du relevé (NFR10) — elle est le filet, ceci est la ceinture.
 */
import { Mistral } from '@mistralai/mistralai'
import {
  SDKError,
  ConnectionError,
  RequestTimeoutError,
  RequestAbortedError,
} from '@mistralai/mistralai/models/errors'
import { z } from 'zod'
import {
  ExtractedTransactionSchema,
  type ExtractedTransaction,
} from '~~/shared/schemas/transaction.schema'
import {
  BANK_STATEMENT_SYSTEM_PROMPT,
  BANK_STATEMENT_PROMPT_VERSION,
  buildBankStatementUserMessage,
  type LlmCategoryItem,
} from '~~/shared/constants/bank-statement-llm-prompt'
import { FALLBACK_ITEM_CODE } from '~~/shared/constants/default-referential'

/**
 * Erreurs domaine de ce service. L'orchestrateur les traduit en `createError()` avec les
 * codes de `ApiErrorCode`.
 */
export class LlmExtractionError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message)
    this.name = 'LlmExtractionError'
  }
}

export class LlmUnavailableError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message)
    this.name = 'LlmUnavailableError'
  }
}

const MODEL = 'zai-glm-5-2'
const REQUEST_TIMEOUT_MS = 120_000
const MAX_TOKENS = 32_000

/** Une seule relance (AR17) : au-delà, le problème n'est pas passager et l'attente est vaine. */
const MAX_ATTEMPTS = 2

let _client: Mistral | null = null

function getClient(): Mistral {
  if (_client) return _client
  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Missing MISTRAL_API_KEY in environment')
  }
  // `serverURL` explicite sur l'inférence européenne : NFR7 est une promesse produit, pas un
  // défaut de configuration sur lequel on s'en remet au SDK.
  _client = new Mistral({ apiKey, serverURL: 'https://api.mistral.ai', timeoutMs: REQUEST_TIMEOUT_MS })
  return _client
}

/**
 * Reset le client — utilisé uniquement par les tests.
 * @internal
 */
export function _resetClientForTesting(): void {
  _client = null
}

/**
 * Schéma JSON déclaré au fournisseur. L'`enum` sur `categoryItemCode` est une indication
 * forte, jamais une garantie : la vérification qui compte est celle faite plus bas sur la
 * réponse reçue.
 */
function buildOutputSchema(availableCategories: ReadonlyArray<LlmCategoryItem>) {
  return {
    type: 'object',
    properties: {
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            transactionDate: {
              type: 'string',
              description: 'Date de l\'opération au format YYYY-MM-DD',
            },
            label: {
              type: 'string',
              description: 'Libellé brut du relevé, max 100 caractères',
            },
            amountCents: {
              type: 'integer',
              description: 'Montant en centimes signé (négatif pour les sorties)',
            },
            categoryItemCode: {
              type: 'string',
              description: 'Code de poste strict — DOIT être l\'une des valeurs listées',
              enum: availableCategories.map(c => c.code),
            },
          },
          required: ['transactionDate', 'label', 'amountCents', 'categoryItemCode'],
          additionalProperties: false,
        },
      },
    },
    required: ['transactions'],
    additionalProperties: false,
  }
}

const ResponseSchema = z.object({
  transactions: z.array(ExtractedTransactionSchema),
})

/**
 * Statuts HTTP qui traduisent une indisponibilité opérationnelle : l'utilisateur ne peut pas
 * les corriger côté donnée, il doit réessayer ou corriger sa configuration.
 */
function isUnavailableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408 || status === 401 || status === 403
}

/** Extrait le statut HTTP d'une `SDKError`, dont le message porte `Status <code>`. */
function statusOf(err: SDKError): number {
  return err.statusCode ?? Number(/Status (\d{3})/u.exec(err.message)?.[1] ?? 0)
}

/** Un appel au fournisseur, sans logique de relance. Traduit les erreurs SDK en erreurs domaine. */
async function callProvider(messages: { role: 'system' | 'user', content: string }[], schema: object): Promise<unknown> {
  const client = getClient()
  let response
  try {
    response = await client.chat.complete({
      model: MODEL,
      temperature: 0,
      maxTokens: MAX_TOKENS,
      messages,
      responseFormat: {
        type: 'json_schema',
        jsonSchema: { name: 'bank_statement_transactions', schemaDefinition: schema, strict: true },
      },
    })
  }
  catch (err) {
    if (err instanceof ConnectionError || err instanceof RequestTimeoutError || err instanceof RequestAbortedError) {
      throw new LlmUnavailableError('Fournisseur LLM injoignable', err)
    }
    if (err instanceof SDKError) {
      const status = statusOf(err)
      if (isUnavailableStatus(status)) {
        throw new LlmUnavailableError(`Fournisseur LLM indisponible (${status})`, err)
      }
      throw new LlmExtractionError(`Erreur client du fournisseur LLM (${status})`, err)
    }
    throw err
  }

  const choice = response.choices?.[0]
  if (!choice) throw new LlmExtractionError('Réponse du fournisseur sans choix')

  // Une réponse tronquée est une extraction PARTIELLE : l'accepter ferait entrer un relevé
  // amputé qui passerait ensuite la réconciliation en « non fiable » sans qu'on sache pourquoi.
  if (choice.finishReason === 'length') {
    throw new LlmExtractionError('Réponse tronquée par la limite de tokens — extraction partielle rejetée')
  }

  const content = choice.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new LlmExtractionError('Réponse du fournisseur vide ou non textuelle')
  }

  try {
    return JSON.parse(content)
  }
  catch (err) {
    throw new LlmExtractionError('Réponse du fournisseur non parsable en JSON', err)
  }
}

/**
 * Valide la réponse : conformité au schéma, puis existence réelle de chaque code de poste.
 *
 * Retourne les transactions, ou le motif du rejet — que l'appelant renvoie au modèle lors de
 * la relance, pour qu'il sache ce qu'il a raté plutôt que de retenter à l'identique.
 */
function validate(
  payload: unknown,
  validCodes: ReadonlySet<string>,
): { ok: true, transactions: ExtractedTransaction[] } | { ok: false, reason: string } {
  const parsed = ResponseSchema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, reason: `réponse non conforme au schéma : ${parsed.error.message}` }
  }
  for (const tx of parsed.data.transactions) {
    if (!validCodes.has(tx.categoryItemCode)) {
      return {
        ok: false,
        reason: `le code de poste « ${tx.categoryItemCode} » (transaction « ${tx.label} ») n'existe pas dans le référentiel fourni`,
      }
    }
  }
  return { ok: true, transactions: parsed.data.transactions }
}

/**
 * Extrait et catégorise les transactions d'un relevé.
 *
 * @param rawText Texte brut extrait du PDF (`pdf-extractor`)
 * @param availableCategories Postes autorisés, lus depuis `category_items` (D17)
 * @throws LlmUnavailableError si le fournisseur est injoignable ou en erreur opérationnelle
 * @throws LlmExtractionError si la réponse reste non conforme après la relance
 */
export async function categorizeStatement(
  rawText: string,
  availableCategories: ReadonlyArray<LlmCategoryItem>,
): Promise<ExtractedTransaction[]> {
  if (!rawText || rawText.trim().length === 0) {
    throw new LlmExtractionError('rawText is empty')
  }
  if (availableCategories.length === 0) {
    throw new LlmExtractionError('availableCategories is empty — cannot categorize')
  }

  const validCodes = new Set(availableCategories.map(c => c.code))

  // Le repli doit exister DANS la taxonomie envoyée : le nommer sans qu'il y figure
  // reviendrait à demander au modèle un code que la validation refuserait ensuite.
  const fallbackCode = validCodes.has(FALLBACK_ITEM_CODE)
    ? FALLBACK_ITEM_CODE
    : availableCategories[0]!.code

  const schema = buildOutputSchema(availableCategories)
  const baseMessages = [
    { role: 'system' as const, content: BANK_STATEMENT_SYSTEM_PROMPT },
    { role: 'user' as const, content: buildBankStatementUserMessage(rawText, availableCategories, fallbackCode) },
  ]

  let lastReason = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages = attempt === 1
      ? baseMessages
      : [
          ...baseMessages,
          {
            role: 'user' as const,
            content: `Ta réponse précédente a été rejetée : ${lastReason}. Recommence en respectant strictement le schéma et en n'utilisant que des codes de poste de la liste. Si aucun ne convient, utilise ${fallbackCode}.`,
          },
        ]

    const payload = await callProvider(messages, schema)
    const result = validate(payload, validCodes)
    if (result.ok) return result.transactions
    lastReason = result.reason
  }

  throw new LlmExtractionError(
    `Réponse non conforme après ${MAX_ATTEMPTS} tentatives : ${lastReason}`,
  )
}

/** Exporte la version du prompt pour audit / debug. */
export { BANK_STATEMENT_PROMPT_VERSION }
