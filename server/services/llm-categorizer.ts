/**
 * llm-categorizer — SEUL POINT D'ENTRÉE vers le SDK du fournisseur LLM (NFR16).
 *
 * Fournisseur : **Mistral**, modèle `zai-glm-5` par défaut, surchargeable par `MISTRAL_CATEGORIZER_MODEL`, inférence en **Europe** (D20, NFR7).
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
  BANK_STATEMENT_PROMPT_VERSION,
  buildBankStatementSystemPrompt,
  buildBankStatementUserMessage,
  LABELS_CATEGORIZATION_SYSTEM_PROMPT,
  buildLabelsUserMessage,
  type LlmCategoryItem,
} from '~~/shared/constants/bank-statement-llm-prompt'
import { FALLBACK_ITEM_CODE } from '~~/shared/constants/default-referential'
import type { Bank } from '~~/shared/types/bank'

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

/**
 * Défaut de CONFIGURATION, pas panne du fournisseur (story 17.5).
 *
 * Un 401 ou un 403 était jusqu'ici classé « fournisseur indisponible » : message trompeur pour
 * une clé absente ou invalide, et surtout motif de relance alors que retenter est vain. Sous-
 * classe de `LlmUnavailableError` pour que la traduction HTTP de l'orchestrateur reste
 * inchangée ; c'est la logique de relance qui la distingue.
 */
export class LlmConfigError extends LlmUnavailableError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
    this.name = 'LlmConfigError'
  }
}

/**
 * Modèle de catégorisation, lu depuis `MISTRAL_CATEGORIZER_MODEL` (NFR34), `zai-glm-5` sinon.
 *
 * ⚠️ `zai-glm-5` est un ALIAS de Mistral, pas une version figée : il pointe sur la dernière
 * GLM-5 (5.3 au 2026-09-26) et suivra les suivantes sans que ce code change. Choix de
 * l'utilisateur du 2026-09-26. Conséquence : une montée de version peut arriver sans commit,
 * et tout changement de modèle impose de re-mesurer le taux de correction (jalon, NFR34).
 * Figer une version exacte (`zai-glm-5-3`) se fait par la variable, sans toucher au code.
 *
 * Lu à chaque appel et non à l'import : une variable vide retombe sur la valeur par défaut
 * plutôt que d'envoyer un modèle vide au fournisseur.
 */
const DEFAULT_CATEGORIZER_MODEL = 'zai-glm-5'

export function categorizerModel(): string {
  return process.env.MISTRAL_CATEGORIZER_MODEL?.trim() || DEFAULT_CATEGORIZER_MODEL
}

const REQUEST_TIMEOUT_MS = 120_000
const MAX_TOKENS = 32_000

/**
 * Une seule relance sur non-conformité (AR17) : au-delà, le problème n'est pas passager.
 *
 * ⚠️ Combiné à la relance sur défaillance passagère, le pire cas est de **quatre** appels
 * facturés pour un relevé : deux tentatives de conformité, chacune pouvant retenter une fois
 * sur incident réseau. C'est borné et assumé (revue du 2026-09-06).
 */
const MAX_ATTEMPTS = 2

/**
 * Attente avant la relance d'une défaillance passagère (story 17.5).
 * Réglable pour que la suite de tests n'attende pas réellement (`LLM_RETRY_DELAY_MS=0`).
 */
const TRANSIENT_RETRY_DELAY_MS = (() => {
  const configured = Number(process.env.LLM_RETRY_DELAY_MS)
  // Une valeur non numérique donnerait `setTimeout(NaN)`, c'est-à-dire une relance immédiate :
  // le contraire du temporisateur qu'on croit avoir posé (revue du 2026-09-06).
  return Number.isFinite(configured) && configured >= 0 ? configured : 1_000
})()

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
  return status >= 500 || status === 429 || status === 408
}

/** 401/403 : la clé est absente, invalide ou sans droit. Relancer n'y changera rien. */
function isConfigStatus(status: number): boolean {
  return status === 401 || status === 403
}

/** Extrait le statut HTTP d'une `SDKError`, dont le message porte `Status <code>`. */
function statusOf(err: SDKError): number {
  return err.statusCode ?? Number(/Status (\d{3})/u.exec(err.message)?.[1] ?? 0)
}

/** Un appel au fournisseur, sans logique de relance. Traduit les erreurs SDK en erreurs domaine. */
async function callProvider(
  messages: { role: 'system' | 'user', content: string }[],
  schema: object,
  schemaName: string,
): Promise<unknown> {
  const client = getClient()
  let response
  try {
    response = await client.chat.complete({
      model: categorizerModel(),
      temperature: 0,
      maxTokens: MAX_TOKENS,
      messages,
      responseFormat: {
        type: 'json_schema',
        jsonSchema: { name: schemaName, schemaDefinition: schema, strict: true },
      },
    })
  }
  catch (err) {
    if (err instanceof ConnectionError || err instanceof RequestTimeoutError || err instanceof RequestAbortedError) {
      throw new LlmUnavailableError('Fournisseur LLM injoignable', err)
    }
    if (err instanceof SDKError) {
      const status = statusOf(err)
      if (isConfigStatus(status)) {
        throw new LlmConfigError(
          `Accès au fournisseur LLM refusé (${status}) — vérifier MISTRAL_API_KEY`,
          err,
        )
      }
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
    throw new TransientExtractionError('Réponse du fournisseur vide ou non textuelle')
  }

  try {
    return JSON.parse(content)
  }
  catch (err) {
    throw new TransientExtractionError('Réponse du fournisseur non parsable en JSON', err)
  }
}

/**
 * Réponse illisible — vide ou JSON invalide. Contrairement à une troncature, rien ne dit que
 * le défaut se reproduira : c'est un motif de relance (story 17.5).
 */
class TransientExtractionError extends LlmExtractionError {}

/**
 * Un appel, avec UNE relance sur défaillance passagère (story 17.5).
 *
 * L'audit du 2026-09-06 a constaté que la relance annoncée par AR17 ne couvrait qu'un seul des
 * trois modes d'échec : la non-conformité de schéma. Un timeout, un 5xx, un 429 ou un JSON
 * illisible remontaient dès la première tentative — et faisaient perdre un dépôt de vingt-quatre
 * fichiers pour un incident réseau.
 *
 * Ne sont PAS relancés : le défaut de configuration (401/403, retenter est vain) et la réponse
 * tronquée (déterministe à température 0 — la même requête produira la même troncature).
 */
async function callProviderWithRetry(
  messages: { role: 'system' | 'user', content: string }[],
  schema: object,
  schemaName: string,
): Promise<unknown> {
  try {
    return await callProvider(messages, schema, schemaName)
  }
  catch (err) {
    const transient = (err instanceof LlmUnavailableError && !(err instanceof LlmConfigError))
      || err instanceof TransientExtractionError
    if (!transient) throw err
    await new Promise(resolve => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS))
    return callProvider(messages, schema, schemaName)
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
 * Boucle générique de conformité (AR17, story 28.4) : un appel, puis UNE relance si le modèle
 * n'a pas respecté le schéma ou une contrainte de validation métier — extraite de
 * `categorizeStatement` pour être partagée avec `categorizeLabels`, SANS dupliquer la logique
 * de relance ni le message de rejet renvoyé au modèle. `categorizeStatement` garde exactement
 * son comportement et sa suite de tests (Dev Notes de la story).
 */
async function categorizeWithConformity<T>(opts: {
  schemaName: string
  systemPrompt: string
  userMessage: string
  schema: object
  fallbackCode: string
  validate: (payload: unknown) => { ok: true, value: T } | { ok: false, reason: string }
}): Promise<T> {
  const baseMessages = [
    { role: 'system' as const, content: opts.systemPrompt },
    { role: 'user' as const, content: opts.userMessage },
  ]

  let lastReason = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages = attempt === 1
      ? baseMessages
      : [
          ...baseMessages,
          {
            role: 'user' as const,
            content: `Ta réponse précédente a été rejetée : ${lastReason}. Recommence en respectant strictement le schéma et en n'utilisant que des codes de poste de la liste. Si aucun ne convient, utilise ${opts.fallbackCode}.`,
          },
        ]

    const payload = await callProviderWithRetry(messages, opts.schema, opts.schemaName)
    const result = opts.validate(payload)
    if (result.ok) return result.value
    lastReason = result.reason
  }

  throw new LlmExtractionError(
    `Réponse non conforme après ${MAX_ATTEMPTS} tentatives : ${lastReason}`,
  )
}

/**
 * Extrait et catégorise les transactions d'un relevé.
 *
 * @param rawText Texte brut extrait du PDF (`pdf-extractor`)
 * @param availableCategories Postes autorisés, lus depuis `category_items` (D17)
 * @param bank Banque du relevé (D41) — sélectionne le paragraphe de prompt propre à la banque
 * @throws LlmUnavailableError si le fournisseur est injoignable ou en erreur opérationnelle
 * @throws LlmExtractionError si la réponse reste non conforme après la relance
 */
export async function categorizeStatement(
  rawText: string,
  availableCategories: ReadonlyArray<LlmCategoryItem>,
  bank: Bank,
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

  return categorizeWithConformity({
    schemaName: 'bank_statement_transactions',
    systemPrompt: buildBankStatementSystemPrompt(bank),
    userMessage: buildBankStatementUserMessage(rawText, availableCategories, fallbackCode),
    schema: buildOutputSchema(availableCategories),
    fallbackCode,
    validate: payload => (
      (r => (r.ok ? { ok: true, value: r.transactions } : r))(validate(payload, validCodes))
    ),
  })
}

const LabelsResponseSchema = z.object({
  labels: z.array(z.object({
    index: z.number().int().nonnegative(),
    categoryItemCode: z.string().min(1),
  })),
})

/** Schéma JSON déclaré au fournisseur pour `categorizeLabels` — un code par index, rien d'autre. */
function buildLabelsOutputSchema(availableCategories: ReadonlyArray<LlmCategoryItem>) {
  return {
    type: 'object',
    properties: {
      labels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'Index du libellé dans la liste reçue' },
            categoryItemCode: {
              type: 'string',
              description: 'Code de poste strict — DOIT être l\'une des valeurs listées',
              enum: availableCategories.map(c => c.code),
            },
          },
          required: ['index', 'categoryItemCode'],
          additionalProperties: false,
        },
      },
    },
    required: ['labels'],
    additionalProperties: false,
  }
}

/**
 * Valide la réponse de `categorizeLabels` : conformité au schéma, chaque index de `0..n-1`
 * présent EXACTEMENT une fois, chaque code réellement dans le référentiel fourni.
 */
function validateLabels(
  payload: unknown,
  validCodes: ReadonlySet<string>,
  count: number,
): { ok: true, codes: string[] } | { ok: false, reason: string } {
  const parsed = LabelsResponseSchema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, reason: `réponse non conforme au schéma : ${parsed.error.message}` }
  }
  const byIndex = new Map<number, string>()
  for (const l of parsed.data.labels) {
    if (byIndex.has(l.index)) {
      return { ok: false, reason: `l'index ${l.index} apparaît plusieurs fois dans la réponse` }
    }
    if (!validCodes.has(l.categoryItemCode)) {
      return {
        ok: false,
        reason: `le code de poste « ${l.categoryItemCode} » (index ${l.index}) n'existe pas dans le référentiel fourni`,
      }
    }
    byIndex.set(l.index, l.categoryItemCode)
  }
  const missing: number[] = []
  for (let i = 0; i < count; i++) {
    if (!byIndex.has(i)) missing.push(i)
  }
  if (missing.length > 0) {
    return { ok: false, reason: `index manquant(s) dans la réponse : ${missing.join(', ')}` }
  }
  return { ok: true, codes: Array.from({ length: count }, (_, i) => byIndex.get(i)!) }
}

/**
 * Catégorise une liste de libellés (story 28.4, D44) — AUCUN montant, AUCUNE date : le code
 * fait l'extraction (export Excel), le modèle ne fait QUE la catégorisation. Chaque libellé
 * part avec son sens `[DÉBIT]`/`[CRÉDIT]` (tranché le 2026-09-26), jamais avec son montant.
 *
 * @param labels Libellés à catégoriser, chacun avec son sens de mouvement, ALIGNÉS PAR INDEX
 *   avec le retour
 * @param availableCategories Postes autorisés, lus depuis `category_items` (D17)
 * @returns les codes de poste, alignés par index avec `labels` — liste vide → `[]` SANS appel
 * @throws LlmUnavailableError si le fournisseur est injoignable ou en erreur opérationnelle
 * @throws LlmExtractionError si la réponse reste non conforme après la relance
 */
export async function categorizeLabels(
  labels: ReadonlyArray<{ label: string, direction: 'debit' | 'credit' }>,
  availableCategories: ReadonlyArray<LlmCategoryItem>,
): Promise<string[]> {
  if (labels.length === 0) return []
  if (availableCategories.length === 0) {
    throw new LlmExtractionError('availableCategories is empty — cannot categorize')
  }

  const validCodes = new Set(availableCategories.map(c => c.code))
  const fallbackCode = validCodes.has(FALLBACK_ITEM_CODE)
    ? FALLBACK_ITEM_CODE
    : availableCategories[0]!.code

  return categorizeWithConformity({
    schemaName: 'label_categories',
    systemPrompt: LABELS_CATEGORIZATION_SYSTEM_PROMPT,
    userMessage: buildLabelsUserMessage(labels, availableCategories, fallbackCode),
    schema: buildLabelsOutputSchema(availableCategories),
    fallbackCode,
    validate: payload => (
      (r => (r.ok ? { ok: true, value: r.codes } : r))(validateLabels(payload, validCodes, labels.length))
    ),
  })
}

/** Exporte la version du prompt pour audit / debug. */
export { BANK_STATEMENT_PROMPT_VERSION }
