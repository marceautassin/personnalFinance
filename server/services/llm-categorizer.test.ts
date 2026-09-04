import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  categorizeStatement,
  LlmExtractionError,
  LlmUnavailableError,
  _resetClientForTesting,
} from './llm-categorizer'
import { DEFAULT_REFERENTIAL, FALLBACK_ITEM_CODE } from '~~/shared/constants/default-referential'

/**
 * Taxonomie telle qu'elle arrive au service : la liste plate des postes, chacun porteur de sa
 * rubrique et de sa nature. Le service ne manipule pas la hiérarchie — il la transmet au
 * prompt, qui la met en forme.
 */
const AVAILABLE_ITEMS = DEFAULT_REFERENTIAL.flatMap(g =>
  g.items.map(i => ({
    code: i.code,
    label: i.label,
    nature: i.nature,
    groupCode: g.code,
    groupLabel: g.label,
  })),
)

// `vi.hoisted` permet de référencer le mock depuis la factory `vi.mock`, elle aussi hoistée.
const { mockComplete } = vi.hoisted(() => ({ mockComplete: vi.fn() }))

vi.mock('@mistralai/mistralai', () => {
  class MockMistral {
    public chat = { complete: mockComplete }
  }
  return { Mistral: MockMistral }
})

vi.mock('@mistralai/mistralai/models/errors', () => {
  class MockMistralError extends Error {}
  class MockSDKError extends MockMistralError {
    constructor(public readonly statusCode: number, message: string) {
      super(`${message}: Status ${statusCode}`)
      this.name = 'SDKError'
    }
  }
  class MockConnectionError extends MockMistralError {
    constructor(message = 'connection error') {
      super(message)
      this.name = 'ConnectionError'
    }
  }
  class MockRequestTimeoutError extends MockMistralError {
    constructor(message = 'timeout') {
      super(message)
      this.name = 'RequestTimeoutError'
    }
  }
  class MockRequestAbortedError extends MockMistralError {
    constructor(message = 'aborted') {
      super(message)
      this.name = 'RequestAbortedError'
    }
  }
  return {
    SDKError: MockSDKError,
    ConnectionError: MockConnectionError,
    RequestTimeoutError: MockRequestTimeoutError,
    RequestAbortedError: MockRequestAbortedError,
  }
})

/**
 * Le module d'erreurs est remplacé par les classes du `vi.mock` ci-dessus, dont les
 * constructeurs sont plus simples que ceux du SDK réel (`SDKError(status, message)` plutôt
 * qu'un `httpMeta` complet). On retype l'import en conséquence : sans ça, TypeScript valide
 * les appels contre la signature RÉELLE, que le test ne verra jamais à l'exécution.
 */
const errors = (await import('@mistralai/mistralai/models/errors')) as unknown as {
  SDKError: new (status: number, message: string) => Error
  ConnectionError: new () => Error
  RequestTimeoutError: new () => Error
  RequestAbortedError: new () => Error
}

const TX = {
  transactionDate: '2026-04-05',
  label: 'CARTE 04/04 CARREFOUR',
  amountCents: -4237,
  categoryItemCode: 'alimentation-courses',
}

/** Réponse conforme du fournisseur : `content` est une CHAÎNE JSON, pas un objet. */
function reply(payload: unknown, finishReason = 'stop') {
  return { choices: [{ finishReason, message: { content: JSON.stringify(payload) } }] }
}

beforeEach(() => {
  process.env.MISTRAL_API_KEY = 'test-key'
  mockComplete.mockReset()
  _resetClientForTesting()
})

afterEach(() => vi.clearAllMocks())

describe('categorizeStatement — cas nominal', () => {
  it('retourne les transactions validées', async () => {
    mockComplete.mockResolvedValueOnce(reply({ transactions: [TX] }))
    const out = await categorizeStatement('relevé', AVAILABLE_ITEMS)
    expect(out).toEqual([TX])
  })

  it('accepte un relevé sans aucune transaction', async () => {
    mockComplete.mockResolvedValueOnce(reply({ transactions: [] }))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).resolves.toEqual([])
  })

  it('appelle le modèle GLM en inférence Mistral, à température 0', async () => {
    mockComplete.mockResolvedValueOnce(reply({ transactions: [] }))
    await categorizeStatement('relevé', AVAILABLE_ITEMS)
    expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
      model: 'zai-glm-5-2',
      temperature: 0,
    }))
  })

  it('déclare un schéma de sortie strict au fournisseur', async () => {
    mockComplete.mockResolvedValueOnce(reply({ transactions: [] }))
    await categorizeStatement('relevé', AVAILABLE_ITEMS)
    const arg = mockComplete.mock.calls[0]![0] as {
      responseFormat: { type: string, jsonSchema: { strict: boolean } }
    }
    expect(arg.responseFormat.type).toBe('json_schema')
    expect(arg.responseFormat.jsonSchema.strict).toBe(true)
  })

  it('nomme le poste de repli dans le message envoyé', async () => {
    mockComplete.mockResolvedValueOnce(reply({ transactions: [] }))
    await categorizeStatement('relevé', AVAILABLE_ITEMS)
    const arg = mockComplete.mock.calls[0]![0] as { messages: { content: string }[] }
    expect(arg.messages[1]!.content).toContain(FALLBACK_ITEM_CODE)
  })
})

/**
 * Le cœur de D20 : un JSON conforme au schéma peut porter des valeurs fausses. La conformité
 * est vérifiée ici, jamais présumée acquise du fournisseur.
 */
describe('categorizeStatement — conformité vérifiée côté application (NFR14, AR17)', () => {
  it('relance UNE fois quand le modèle renvoie un code hors référentiel, puis réussit', async () => {
    mockComplete
      .mockResolvedValueOnce(reply({ transactions: [{ ...TX, categoryItemCode: 'AUTRES_DEPENSES' }] }))
      .mockResolvedValueOnce(reply({ transactions: [TX] }))

    const out = await categorizeStatement('relevé', AVAILABLE_ITEMS)
    expect(out).toEqual([TX])
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('renvoie au modèle le MOTIF du rejet, pas une simple répétition', async () => {
    mockComplete
      .mockResolvedValueOnce(reply({ transactions: [{ ...TX, categoryItemCode: 'AUTRES_DEPENSES' }] }))
      .mockResolvedValueOnce(reply({ transactions: [TX] }))

    await categorizeStatement('relevé', AVAILABLE_ITEMS)
    const retry = mockComplete.mock.calls[1]![0] as { messages: { content: string }[] }
    const lastMessage = retry.messages.at(-1)!.content
    expect(lastMessage).toContain('AUTRES_DEPENSES')
    expect(lastMessage).toContain('rejetée')
  })

  it('échoue après DEUX tentatives : la relance est bornée', async () => {
    mockComplete.mockResolvedValue(reply({ transactions: [{ ...TX, categoryItemCode: 'inventé' }] }))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toBeInstanceOf(LlmExtractionError)
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('rejette une réponse non conforme au schéma', async () => {
    mockComplete.mockResolvedValue(reply({ transactions: [{ label: 'incomplet' }] }))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it('rejette un contenu qui n\'est pas du JSON', async () => {
    mockComplete.mockResolvedValue({ choices: [{ finishReason: 'stop', message: { content: 'désolé !' } }] })
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toThrow(/non parsable/i)
  })

  /**
   * Une extraction partielle entrerait en base et échouerait ensuite la réconciliation sans
   * qu'on sache pourquoi. Mieux vaut refuser le relevé.
   */
  it('rejette une réponse tronquée par la limite de tokens', async () => {
    mockComplete.mockResolvedValue(reply({ transactions: [TX] }, 'length'))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toThrow(/tronquée/i)
  })

  it('rejette une réponse sans choix', async () => {
    mockComplete.mockResolvedValue({ choices: [] })
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toThrow(/sans choix/i)
  })

  it('rejette un contenu vide', async () => {
    mockComplete.mockResolvedValue({ choices: [{ finishReason: 'stop', message: { content: '   ' } }] })
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toThrow(/vide/i)
  })
})

describe('categorizeStatement — indisponibilité du fournisseur (NFR17)', () => {
  it.each([500, 502, 429, 408, 401, 403])('traite le statut %i en indisponibilité', async (status) => {
    mockComplete.mockRejectedValue(new errors.SDKError(status, 'boom'))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('traite un 400 en erreur d\'extraction, pas en indisponibilité', async () => {
    mockComplete.mockRejectedValue(new errors.SDKError(400, 'bad request'))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it.each([
    ['ConnectionError', () => new errors.ConnectionError()],
    ['RequestTimeoutError', () => new errors.RequestTimeoutError()],
    ['RequestAbortedError', () => new errors.RequestAbortedError()],
  ])('traite %s en indisponibilité', async (_name, build) => {
    mockComplete.mockRejectedValue(build())
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('ne relance PAS sur indisponibilité — le retry ne réparerait rien ici', async () => {
    mockComplete.mockRejectedValue(new errors.SDKError(503, 'down'))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toBeInstanceOf(LlmUnavailableError)
    expect(mockComplete).toHaveBeenCalledTimes(1)
  })

  it('laisse remonter une erreur inattendue telle quelle', async () => {
    const oops = new Error('inattendu')
    mockComplete.mockRejectedValue(oops)
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toBe(oops)
  })
})

describe('categorizeStatement — garde-fous d\'entrée', () => {
  it('refuse un texte vide', async () => {
    await expect(categorizeStatement('', AVAILABLE_ITEMS)).rejects.toBeInstanceOf(LlmExtractionError)
    await expect(categorizeStatement('   \n  ', AVAILABLE_ITEMS)).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it('refuse une taxonomie vide', async () => {
    await expect(categorizeStatement('relevé', [])).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it('exige la clé d\'API dans l\'environnement (NFR8)', async () => {
    delete process.env.MISTRAL_API_KEY
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toThrow(/MISTRAL_API_KEY/)
    process.env.MISTRAL_API_KEY = ''
    _resetClientForTesting()
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS)).rejects.toThrow(/MISTRAL_API_KEY/)
  })
})
