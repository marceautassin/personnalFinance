import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  categorizeStatement,
  categorizeLabels,
  LlmExtractionError,
  LlmUnavailableError,
  LlmConfigError,
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
    const out = await categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')
    expect(out).toEqual([TX])
  })

  it('accepte un relevé sans aucune transaction', async () => {
    mockComplete.mockResolvedValueOnce(reply({ transactions: [] }))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).resolves.toEqual([])
  })

  it('appelle le modèle GLM en inférence Mistral, à température 0', async () => {
    mockComplete.mockResolvedValueOnce(reply({ transactions: [] }))
    await categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')
    expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
      model: 'zai-glm-5-2',
      temperature: 0,
    }))
  })

  it('lit le modèle depuis MISTRAL_CATEGORIZER_MODEL (NFR34)', async () => {
    process.env.MISTRAL_CATEGORIZER_MODEL = 'zai-glm-5-3'
    try {
      mockComplete.mockResolvedValueOnce(reply({ transactions: [] }))
      await categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')
      expect(mockComplete).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'zai-glm-5-3' }))
    }
    finally {
      delete process.env.MISTRAL_CATEGORIZER_MODEL
    }
  })

  it('retombe sur le modèle par défaut si la variable est vide', async () => {
    process.env.MISTRAL_CATEGORIZER_MODEL = '  '
    try {
      mockComplete.mockResolvedValueOnce(reply({ transactions: [] }))
      await categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')
      expect(mockComplete).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'zai-glm-5-2' }))
    }
    finally {
      delete process.env.MISTRAL_CATEGORIZER_MODEL
    }
  })

  it('déclare un schéma de sortie strict au fournisseur', async () => {
    mockComplete.mockResolvedValueOnce(reply({ transactions: [] }))
    await categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')
    const arg = mockComplete.mock.calls[0]![0] as {
      responseFormat: { type: string, jsonSchema: { strict: boolean } }
    }
    expect(arg.responseFormat.type).toBe('json_schema')
    expect(arg.responseFormat.jsonSchema.strict).toBe(true)
  })

  it('nomme le poste de repli dans le message envoyé', async () => {
    mockComplete.mockResolvedValueOnce(reply({ transactions: [] }))
    await categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')
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

    const out = await categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')
    expect(out).toEqual([TX])
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('renvoie au modèle le MOTIF du rejet, pas une simple répétition', async () => {
    mockComplete
      .mockResolvedValueOnce(reply({ transactions: [{ ...TX, categoryItemCode: 'AUTRES_DEPENSES' }] }))
      .mockResolvedValueOnce(reply({ transactions: [TX] }))

    await categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')
    const retry = mockComplete.mock.calls[1]![0] as { messages: { content: string }[] }
    const lastMessage = retry.messages.at(-1)!.content
    expect(lastMessage).toContain('AUTRES_DEPENSES')
    expect(lastMessage).toContain('rejetée')
  })

  it('échoue après DEUX tentatives : la relance est bornée', async () => {
    mockComplete.mockResolvedValue(reply({ transactions: [{ ...TX, categoryItemCode: 'inventé' }] }))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toBeInstanceOf(LlmExtractionError)
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('rejette une réponse non conforme au schéma', async () => {
    mockComplete.mockResolvedValue(reply({ transactions: [{ label: 'incomplet' }] }))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it('rejette un contenu qui n\'est pas du JSON', async () => {
    mockComplete.mockResolvedValue({ choices: [{ finishReason: 'stop', message: { content: 'désolé !' } }] })
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toThrow(/non parsable/i)
  })

  /**
   * Une extraction partielle entrerait en base et échouerait ensuite la réconciliation sans
   * qu'on sache pourquoi. Mieux vaut refuser le relevé.
   */
  it('rejette une réponse tronquée par la limite de tokens', async () => {
    mockComplete.mockResolvedValue(reply({ transactions: [TX] }, 'length'))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toThrow(/tronquée/i)
  })

  it('rejette une réponse sans choix', async () => {
    mockComplete.mockResolvedValue({ choices: [] })
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toThrow(/sans choix/i)
  })

  it('rejette un contenu vide', async () => {
    mockComplete.mockResolvedValue({ choices: [{ finishReason: 'stop', message: { content: '   ' } }] })
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toThrow(/vide/i)
  })
})

describe('categorizeStatement — indisponibilité du fournisseur (NFR17)', () => {
  it.each([500, 502, 429, 408, 401, 403])('traite le statut %i en indisponibilité', async (status) => {
    mockComplete.mockRejectedValue(new errors.SDKError(status, 'boom'))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('traite un 400 en erreur d\'extraction, pas en indisponibilité', async () => {
    mockComplete.mockRejectedValue(new errors.SDKError(400, 'bad request'))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it.each([
    ['ConnectionError', () => new errors.ConnectionError()],
    ['RequestTimeoutError', () => new errors.RequestTimeoutError()],
    ['RequestAbortedError', () => new errors.RequestAbortedError()],
  ])('traite %s en indisponibilité', async (_name, build) => {
    mockComplete.mockRejectedValue(build())
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  /**
   * Story 17.5 — la relance couvre désormais les défaillances PASSAGÈRES.
   *
   * Décision inversée le 2026-09-06. L'audit a constaté que la relance annoncée par AR17 ne
   * couvrait qu'un seul des trois modes d'échec : la non-conformité de schéma. Un timeout ou
   * un 503 faisait perdre un dépôt de vingt-quatre fichiers pour un incident réseau.
   */
  it('relance UNE fois sur indisponibilité passagère', async () => {
    mockComplete.mockRejectedValue(new errors.SDKError(503, 'down'))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toBeInstanceOf(LlmUnavailableError)
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('aboutit si la relance passe', async () => {
    mockComplete
      .mockRejectedValueOnce(new errors.SDKError(503, 'down'))
      .mockResolvedValueOnce(reply({ transactions: [TX] }))
    const result = await categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')
    expect(result).toEqual([TX])
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it.each([401, 403])('ne relance PAS sur un défaut de configuration (%i)', async (status) => {
    mockComplete.mockRejectedValue(new errors.SDKError(status, 'forbidden'))
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toBeInstanceOf(LlmConfigError)
    expect(mockComplete).toHaveBeenCalledTimes(1)
  })

  it('relance sur une réponse illisible, mais PAS sur une troncature', async () => {
    mockComplete.mockResolvedValue({ choices: [{ message: { content: 'pas du json' } }] })
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toBeInstanceOf(LlmExtractionError)
    expect(mockComplete).toHaveBeenCalledTimes(2)

    mockComplete.mockClear()
    mockComplete.mockResolvedValue({ choices: [{ finishReason: 'length', message: { content: '{' } }] })
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toThrow(/tronqu/i)
    expect(mockComplete).toHaveBeenCalledTimes(1)
  })

  it('laisse remonter une erreur inattendue telle quelle', async () => {
    const oops = new Error('inattendu')
    mockComplete.mockRejectedValue(oops)
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toBe(oops)
  })
})

describe('categorizeStatement — garde-fous d\'entrée', () => {
  it('refuse un texte vide', async () => {
    await expect(categorizeStatement('', AVAILABLE_ITEMS, 'boursorama')).rejects.toBeInstanceOf(LlmExtractionError)
    await expect(categorizeStatement('   \n  ', AVAILABLE_ITEMS, 'boursorama')).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it('refuse une taxonomie vide', async () => {
    await expect(categorizeStatement('relevé', [], 'boursorama')).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it('exige la clé d\'API dans l\'environnement (NFR8)', async () => {
    delete process.env.MISTRAL_API_KEY
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toThrow(/MISTRAL_API_KEY/)
    process.env.MISTRAL_API_KEY = ''
    _resetClientForTesting()
    await expect(categorizeStatement('relevé', AVAILABLE_ITEMS, 'boursorama')).rejects.toThrow(/MISTRAL_API_KEY/)
  })
})

/**
 * categorizeLabels — story 28.4, D44. Le code fait l'extraction (export Excel) ; le modèle ne
 * fait QUE la catégorisation, sur un libellé accompagné de son sens `[DÉBIT]`/`[CRÉDIT]`,
 * jamais d'un montant.
 */
describe('categorizeLabels — cas nominal', () => {
  it('retourne les codes alignés par index avec les libellés', async () => {
    mockComplete.mockResolvedValueOnce(reply({
      labels: [
        { index: 0, categoryItemCode: 'alimentation-courses' },
        { index: 1, categoryItemCode: 'internes-virement-epargne' },
      ],
    }))
    const out = await categorizeLabels(
      [
        { label: 'CARTE CARREFOUR', direction: 'debit' },
        { label: 'VIR EPARGNE', direction: 'debit' },
      ],
      AVAILABLE_ITEMS,
    )
    expect(out).toEqual(['alimentation-courses', 'internes-virement-epargne'])
  })

  it('liste vide → [] SANS appel au fournisseur', async () => {
    const out = await categorizeLabels([], AVAILABLE_ITEMS)
    expect(out).toEqual([])
    expect(mockComplete).not.toHaveBeenCalled()
  })

  it('transmet le sens [DÉBIT]/[CRÉDIT] de chaque libellé, jamais de montant', async () => {
    mockComplete.mockResolvedValueOnce(reply({ labels: [{ index: 0, categoryItemCode: 'alimentation-courses' }] }))
    await categorizeLabels([{ label: 'CARTE CARREFOUR', direction: 'debit' }], AVAILABLE_ITEMS)
    const arg = mockComplete.mock.calls[0]![0] as { messages: { content: string }[] }
    const userMessage = arg.messages[1]!.content
    expect(userMessage).toContain('[DÉBIT]')
    expect(userMessage).toContain('CARTE CARREFOUR')
    expect(userMessage).not.toMatch(/\d+[.,]\d{2}\s*€/)
  })
})

describe('categorizeLabels — conformité vérifiée (AR17)', () => {
  it('relance quand un index est manquant, puis réussit', async () => {
    mockComplete
      .mockResolvedValueOnce(reply({ labels: [] }))
      .mockResolvedValueOnce(reply({ labels: [{ index: 0, categoryItemCode: 'alimentation-courses' }] }))
    const out = await categorizeLabels([{ label: 'A', direction: 'debit' }], AVAILABLE_ITEMS)
    expect(out).toEqual(['alimentation-courses'])
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('relance quand un index est dupliqué, puis échoue après deux tentatives', async () => {
    mockComplete.mockResolvedValue(reply({
      labels: [
        { index: 0, categoryItemCode: 'alimentation-courses' },
        { index: 0, categoryItemCode: 'alimentation-restaurant' },
      ],
    }))
    await expect(categorizeLabels([{ label: 'A', direction: 'debit' }], AVAILABLE_ITEMS))
      .rejects.toBeInstanceOf(LlmExtractionError)
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('relance sur un code de poste inconnu', async () => {
    mockComplete
      .mockResolvedValueOnce(reply({ labels: [{ index: 0, categoryItemCode: 'INVENTE' }] }))
      .mockResolvedValueOnce(reply({ labels: [{ index: 0, categoryItemCode: 'alimentation-courses' }] }))
    const out = await categorizeLabels([{ label: 'A', direction: 'debit' }], AVAILABLE_ITEMS)
    expect(out).toEqual(['alimentation-courses'])
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })

  it('refuse une taxonomie vide', async () => {
    await expect(categorizeLabels([{ label: 'A', direction: 'debit' }], [])).rejects.toBeInstanceOf(LlmExtractionError)
  })

  it('relance sur défaillance passagère, comme categorizeStatement', async () => {
    mockComplete
      .mockRejectedValueOnce(new errors.SDKError(503, 'down'))
      .mockResolvedValueOnce(reply({ labels: [{ index: 0, categoryItemCode: 'alimentation-courses' }] }))
    const out = await categorizeLabels([{ label: 'A', direction: 'debit' }], AVAILABLE_ITEMS)
    expect(out).toEqual(['alimentation-courses'])
    expect(mockComplete).toHaveBeenCalledTimes(2)
  })
})

/**
 * Correctif du 2026-09-26 — découpage en lots (story 28.4). Un export réel de 186 libellés
 * distincts envoyés en un seul appel a fait déborder MAX_TOKENS côté réponse et rejeter
 * l'extraction comme tronquée. `categorizeLabels` découpe désormais en lots de
 * `LABELS_BATCH_SIZE` (40), appelés séquentiellement, chacun passant par la même boucle de
 * conformité/relance.
 */
describe('categorizeLabels — découpage en lots (correctif 2026-09-26)', () => {
  /** Construit N libellés distincts, tous alignés sur un même code de poste valide. */
  function makeLabels(n: number): { label: string, direction: 'debit' | 'credit' }[] {
    return Array.from({ length: n }, (_, i) => ({ label: `LIBELLE ${i}`, direction: 'debit' as const }))
  }

  /** Réponse conforme pour un lot : chaque libellé reçoit `code`, index local 0..n-1. */
  function batchReply(n: number, code = 'alimentation-courses') {
    return reply({ labels: Array.from({ length: n }, (_, i) => ({ index: i, categoryItemCode: code })) })
  }

  it('découpe 90 libellés en 3 lots (40 + 40 + 10) et reconstitue ordre et index d\'origine', async () => {
    const labels = makeLabels(90)
    mockComplete
      .mockResolvedValueOnce(batchReply(40, 'alimentation-courses'))
      .mockResolvedValueOnce(batchReply(40, 'alimentation-restaurant'))
      .mockResolvedValueOnce(batchReply(10, 'internes-virement-epargne'))

    const out = await categorizeLabels(labels, AVAILABLE_ITEMS)

    expect(mockComplete).toHaveBeenCalledTimes(3)
    expect(out).toHaveLength(90)
    expect(out.slice(0, 40)).toEqual(Array(40).fill('alimentation-courses'))
    expect(out.slice(40, 80)).toEqual(Array(40).fill('alimentation-restaurant'))
    expect(out.slice(80, 90)).toEqual(Array(10).fill('internes-virement-epargne'))
  })

  it('le dernier lot incomplet contient exactement le reliquat', async () => {
    const labels = makeLabels(45)
    mockComplete
      .mockResolvedValueOnce(batchReply(40))
      .mockResolvedValueOnce(batchReply(5))

    await categorizeLabels(labels, AVAILABLE_ITEMS)

    const secondBatchMessage = (mockComplete.mock.calls[1]![0] as { messages: { content: string }[] }).messages[1]!.content
    expect(secondBatchMessage).toContain('LIBELLE 40')
    expect(secondBatchMessage).not.toContain('LIBELLE 45')
  })

  it('un lot non conforme fait échouer l\'ensemble — pas de résultat partiel', async () => {
    const labels = makeLabels(45)
    mockComplete
      .mockResolvedValueOnce(batchReply(40))
      // Deuxième lot : réponse non conforme, y compris après la relance (MAX_ATTEMPTS = 2).
      .mockResolvedValue(reply({ labels: [{ index: 0, categoryItemCode: 'INVENTE' }] }))

    await expect(categorizeLabels(labels, AVAILABLE_ITEMS)).rejects.toBeInstanceOf(LlmExtractionError)
    // 1 appel pour le premier lot conforme + 2 (essai + relance) pour le second en échec.
    expect(mockComplete).toHaveBeenCalledTimes(3)
  })

  it('0 libellé → aucun appel au fournisseur', async () => {
    const out = await categorizeLabels([], AVAILABLE_ITEMS)
    expect(out).toEqual([])
    expect(mockComplete).not.toHaveBeenCalled()
  })

  it('un lot pile égal à la taille de lot ne produit qu\'un seul appel', async () => {
    const labels = makeLabels(40)
    mockComplete.mockResolvedValueOnce(batchReply(40))
    const out = await categorizeLabels(labels, AVAILABLE_ITEMS)
    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect(out).toHaveLength(40)
  })
})
