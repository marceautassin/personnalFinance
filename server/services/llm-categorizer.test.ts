import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as AnthropicSdk from '@anthropic-ai/sdk'
import {
  categorizeStatement,
  LlmExtractionError,
  LlmUnavailableError,
  _resetClientForTesting,
} from './llm-categorizer'
import { DEFAULT_CATEGORIES } from '~~/shared/constants/default-categories'

// `vi.hoisted` permet de référencer mockCreate depuis la factory `vi.mock` (elle aussi hoistée).
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => {
  class MockAPIError extends Error {
    public readonly status: number | undefined
    constructor(status: number | undefined, message: string) {
      super(message)
      this.status = status
      this.name = 'APIError'
    }
  }
  class MockAPIConnectionError extends MockAPIError {
    constructor(opts: { message?: string }) {
      super(undefined, opts.message ?? 'connection error')
      this.name = 'APIConnectionError'
    }
  }
  class MockAPIConnectionTimeoutError extends MockAPIConnectionError {
    constructor(opts: { message?: string } = {}) {
      super({ message: opts.message ?? 'timeout' })
      this.name = 'APIConnectionTimeoutError'
    }
  }
  class MockAnthropic {
    public messages = { create: mockCreate }
  }
  return {
    default: MockAnthropic,
    APIError: MockAPIError,
    APIConnectionError: MockAPIConnectionError,
    APIConnectionTimeoutError: MockAPIConnectionTimeoutError,
  }
})

const { APIError, APIConnectionError, APIConnectionTimeoutError } = AnthropicSdk

beforeEach(() => {
  mockCreate.mockReset()
  _resetClientForTesting()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('categorizeStatement', () => {
  it('happy path — returns valid transactions', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'submit_transactions',
          input: {
            transactions: [
              {
                transactionDate: '2026-04-15',
                label: 'FNAC PARIS 09',
                amountCents: -8990,
                categoryCode: 'shopping',
              },
            ],
          },
        },
      ],
    })

    const result = await categorizeStatement('rawText', DEFAULT_CATEGORIES)
    expect(result).toHaveLength(1)
    expect(result[0]?.amountCents).toBe(-8990)
    expect(result[0]?.categoryCode).toBe('shopping')
  })

  it('returns empty array when LLM extracts nothing', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', name: 'submit_transactions', input: { transactions: [] } }],
    })
    const result = await categorizeStatement('rawText', DEFAULT_CATEGORIES)
    expect(result).toEqual([])
  })

  it('throws LlmExtractionError on invalid schema', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'submit_transactions',
          input: {
            transactions: [
              { transactionDate: 'invalid', label: 'x', amountCents: 'bad', categoryCode: 'shopping' },
            ],
          },
        },
      ],
    })

    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it('throws LlmExtractionError on unknown category', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          name: 'submit_transactions',
          input: {
            transactions: [{
              transactionDate: '2026-04-15',
              label: 'X',
              amountCents: -100,
              categoryCode: 'invented_category',
            }],
          },
        },
      ],
    })

    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toThrow(/unknown categoryCode/i)
  })

  it('throws LlmExtractionError when no tool_use block in response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'oops' }],
    })
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it('throws LlmUnavailableError on 5xx APIError', async () => {
    mockCreate.mockRejectedValueOnce(new (APIError as unknown as new (s: number, m: string) => Error)(503, 'Service Unavailable'))
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('throws LlmExtractionError on 4xx APIError', async () => {
    mockCreate.mockRejectedValueOnce(new (APIError as unknown as new (s: number, m: string) => Error)(400, 'Bad Request'))
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it('throws LlmUnavailableError on connection error', async () => {
    mockCreate.mockRejectedValueOnce(new (APIConnectionError as unknown as new (o: { message?: string }) => Error)({ message: 'Network down' }))
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('throws LlmUnavailableError on connection timeout', async () => {
    mockCreate.mockRejectedValueOnce(new (APIConnectionTimeoutError as unknown as new () => Error)())
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('throws on missing API key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    _resetClientForTesting()
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })
})
