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

let _client: Anthropic | null = null

/** Initialisation lazy du client. Vérifie la présence de la clé API. */
function getClient(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Missing ANTHROPIC_API_KEY in environment')
  }
  _client = new Anthropic({ apiKey })
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
 * JSON schema décrivant la sortie attendue, utilisé en structured output via tool_use.
 * Aligné avec ExtractedTransactionSchema (Zod). Si tu modifies l'un, modifier l'autre.
 */
const OUTPUT_JSON_SCHEMA: Anthropic.Messages.Tool.InputSchema = {
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
            description: 'Code de catégorie strict parmi available_categories',
            minLength: 1,
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

const ResponseSchema = z.object({
  transactions: z.array(ExtractedTransactionSchema),
})

/**
 * Catégorise les transactions d'un relevé via Claude API.
 *
 * @param rawText  Texte brut extrait du PDF (Story 2.2)
 * @param availableCategories Catégories autorisées (depuis category_definitions, Story 1.4)
 * @returns Liste de transactions structurées et validées
 * @throws LlmUnavailableError si l'API est indisponible (réseau / 5xx / timeout)
 * @throws LlmExtractionError si la réponse est invalide ou contient une catégorie inconnue
 */
export async function categorizeStatement(
  rawText: string,
  availableCategories: ReadonlyArray<DefaultCategory>,
): Promise<ExtractedTransaction[]> {
  const client = getClient()
  const userMessage = buildBankStatementUserMessage(rawText, availableCategories)

  let toolInput: unknown
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: BANK_STATEMENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      tools: [
        {
          name: 'submit_transactions',
          description: 'Soumet la liste des transactions extraites du relevé.',
          input_schema: OUTPUT_JSON_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_transactions' },
    })

    const toolUse = response.content.find(c => c.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new LlmExtractionError('No tool_use block in Claude response')
    }
    toolInput = toolUse.input
  }
  catch (err) {
    if (err instanceof LlmExtractionError) throw err
    if (err instanceof APIConnectionTimeoutError || err instanceof APIConnectionError) {
      throw new LlmUnavailableError('Claude API unreachable', err)
    }
    if (err instanceof APIError) {
      const status = err.status ?? 0
      if (status >= 500) {
        throw new LlmUnavailableError(`Claude API server error (${status}): ${err.message}`, err)
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
