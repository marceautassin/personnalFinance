import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  mockCreate.mockReset()
  _resetClientForTesting()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  }
  else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY
  }
  _resetClientForTesting()
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

  it('throws on whitespace-only API key', async () => {
    process.env.ANTHROPIC_API_KEY = '   '
    _resetClientForTesting()
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })

  it('throws LlmExtractionError on empty rawText', async () => {
    await expect(categorizeStatement('', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmExtractionError)
    await expect(categorizeStatement('   \n  ', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmExtractionError)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('throws LlmExtractionError on empty availableCategories', async () => {
    await expect(categorizeStatement('rawText', [])).rejects.toBeInstanceOf(LlmExtractionError)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('throws LlmExtractionError when stop_reason is max_tokens (truncation)', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'max_tokens',
      content: [{ type: 'tool_use', name: 'submit_transactions', input: { transactions: [] } }],
    })
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toThrow(/truncated/i)
  })

  it('throws LlmExtractionError on multiple tool_use blocks', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: 'tool_use', name: 'submit_transactions', input: { transactions: [] } },
        { type: 'tool_use', name: 'submit_transactions', input: { transactions: [] } },
      ],
    })
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toThrow(/Multiple tool_use/)
  })

  it('throws LlmExtractionError when tool_use has wrong name', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', name: 'some_other_tool', input: { transactions: [] } }],
    })
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toThrow(/No tool_use block/)
  })

  it('throws LlmExtractionError when content is not an array', async () => {
    mockCreate.mockResolvedValueOnce({ content: null })
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toThrow(/not an array/)
  })

  it('throws LlmUnavailableError on 401 auth error', async () => {
    mockCreate.mockRejectedValueOnce(new (APIError as unknown as new (s: number, m: string) => Error)(401, 'Unauthorized'))
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('throws LlmUnavailableError on 429 rate limit', async () => {
    mockCreate.mockRejectedValueOnce(new (APIError as unknown as new (s: number, m: string) => Error)(429, 'Too Many Requests'))
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('rethrows non-APIError generic errors as-is (let Nitro 500)', async () => {
    const oops = new Error('unexpected boom')
    mockCreate.mockRejectedValueOnce(oops)
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBe(oops)
  })
})
