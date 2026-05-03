/**
 * llm-categorizer — SEUL POINT D'ENTRÉE vers `@anthropic-ai/sdk` (NFR12, NFR16).
 *
 * Toute autre tentative d'utilisation directe du SDK Anthropic ailleurs dans le code
 * est un anti-pattern documenté dans CLAUDE.md.
 */
import Anthropic, {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
} from '@anthropic-ai/sdk'
import { z } from 'zod'
import {
  ExtractedTransactionSchema,
  type ExtractedTransaction,
} from '~~/shared/schemas/transaction.schema'
import {
  BANK_STATEMENT_SYSTEM_PROMPT,
  BANK_STATEMENT_PROMPT_VERSION,
  buildBankStatementUserMessage,
} from '~~/shared/constants/bank-statement-llm-prompt'
import type { DefaultCategory } from '~~/shared/constants/default-categories'

/**
 * Erreurs domaine spécifiques à ce service.
 * L'endpoint orchestrateur (Story 2.6) les wrap en createError() avec les codes ApiErrorCode.
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

const TOOL_NAME = 'submit_transactions'
const REQUEST_TIMEOUT_MS = 25_000

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Missing ANTHROPIC_API_KEY in environment')
  }
  _client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS })
  return _client
}

/**
 * Reset le client — utilisé uniquement par les tests.
 * @internal
 */
export function _resetClientForTesting(): void {
  _client = null
}

function buildOutputSchema(
  availableCategories: ReadonlyArray<DefaultCategory>,
): Anthropic.Messages.Tool.InputSchema {
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
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            },
            label: {
              type: 'string',
              description: 'Libellé brut du relevé, max 100 chars',
              minLength: 1,
              maxLength: 100,
            },
            amountCents: {
              type: 'integer',
              description: 'Montant en centimes signé (négatif pour sorties)',
            },
            categoryCode: {
              type: 'string',
              description: 'Code de catégorie strict — DOIT être l\'une des valeurs listées',
              enum: availableCategories.map(c => c.code),
            },
          },
          required: ['transactionDate', 'label', 'amountCents', 'categoryCode'],
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
 * Catégorise les transactions d'un relevé via Claude API.
 *
 * @param rawText  Texte brut extrait du PDF (Story 2.2)
 * @param availableCategories Catégories autorisées (depuis category_definitions, Story 1.4)
 * @returns Liste de transactions structurées et validées
 * @throws LlmUnavailableError si l'API est indisponible (réseau / 5xx / timeout / 429 / auth)
 * @throws LlmExtractionError si la réponse est invalide, tronquée, ou contient une catégorie inconnue
 */
export async function categorizeStatement(
  rawText: string,
  availableCategories: ReadonlyArray<DefaultCategory>,
): Promise<ExtractedTransaction[]> {
  if (!rawText || rawText.trim().length === 0) {
    throw new LlmExtractionError('rawText is empty')
  }
  if (availableCategories.length === 0) {
    throw new LlmExtractionError('availableCategories is empty — cannot categorize')
  }

  const client = getClient()
  const userMessage = buildBankStatementUserMessage(rawText, availableCategories)

  let toolInput: unknown
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      temperature: 0,
      system: BANK_STATEMENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      tools: [
        {
          name: TOOL_NAME,
          description: 'Soumet la liste des transactions extraites du relevé.',
          input_schema: buildOutputSchema(availableCategories),
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
    })

    if (response.stop_reason === 'max_tokens') {
      throw new LlmExtractionError(
        'Claude response truncated by max_tokens — partial extraction rejected',
      )
    }

    if (!Array.isArray(response.content)) {
      throw new LlmExtractionError('Claude response content is not an array')
    }

    const toolUses = response.content.filter(
      (c): c is Extract<typeof c, { type: 'tool_use' }> => c.type === 'tool_use' && c.name === TOOL_NAME,
    )
    if (toolUses.length === 0) {
      throw new LlmExtractionError(`No tool_use block named '${TOOL_NAME}' in Claude response`)
    }
    if (toolUses.length > 1) {
      throw new LlmExtractionError(`Multiple tool_use blocks named '${TOOL_NAME}' in Claude response`)
    }
    toolInput = toolUses[0]!.input
  }
  catch (err) {
    if (err instanceof LlmExtractionError) throw err
    if (err instanceof APIConnectionTimeoutError || err instanceof APIConnectionError) {
      throw new LlmUnavailableError('Claude API unreachable', err)
    }
    if (err instanceof APIError) {
      const status = err.status ?? 0
      // 5xx + 429 (rate limit) + 408 (timeout) + 401/403 (auth/permission) = indispo opérationnelle.
      // L'utilisateur ne peut pas la corriger côté donnée, doit retry ou fix sa config.
      if (status >= 500 || status === 429 || status === 408 || status === 401 || status === 403) {
        throw new LlmUnavailableError(`Claude API unavailable (${status}): ${err.message}`, err)
      }
      throw new LlmExtractionError(`Claude API client error (${status}): ${err.message}`, err)
    }
    throw err
  }

  const validated = ResponseSchema.safeParse(toolInput)
  if (!validated.success) {
    throw new LlmExtractionError(
      `Claude response schema validation failed: ${validated.error.message}`,
      validated.error,
    )
  }

  const validCodes = new Set(availableCategories.map(c => c.code))
  for (const tx of validated.data.transactions) {
    if (!validCodes.has(tx.categoryCode)) {
      throw new LlmExtractionError(
        `Claude returned unknown categoryCode '${tx.categoryCode}' for transaction '${tx.label}'`,
      )
    }
  }

  return validated.data.transactions
}

/** Exporte la version du prompt pour audit / debug. */
export { BANK_STATEMENT_PROMPT_VERSION }
