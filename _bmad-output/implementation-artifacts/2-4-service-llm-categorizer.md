# Story 2.4: Service `llm-categorizer` (Claude API + structured outputs)

Status: done

## Story

As a dev,
I want a single isolated service that turns raw bank statement text into validated, typed transactions via Claude API with structured outputs,
so that the ingestion endpoint (Story 2.6) gets clean data and the rest of the codebase never touches `@anthropic-ai/sdk` directly (NFR12, NFR16).

## Acceptance Criteria

1. **Given** `shared/constants/bank-statement-llm-prompt.ts` qui contient le prompt système figé V1 (instructions de catégorisation),
   **And** `shared/schemas/transaction.schema.ts` qui expose `ExtractedTransactionSchema` (Story 2.1),
   **When** je crée `server/services/llm-categorizer.ts` exposant `categorizeStatement(rawText: string, availableCategories: ReadonlyArray<DefaultCategory>): Promise<ExtractedTransaction[]>`,
   **Then** le service appelle Claude avec un schéma de sortie strict, valide la réponse via Zod, et retourne le tableau de transactions.

2. **Given** la sortie LLM ne valide pas le schéma Zod attendu (champs manquants, types invalides, catégorie hors liste),
   **When** `categorizeStatement` reçoit cette réponse,
   **Then** le service lève une erreur normalisée → mappable en `domainError(ApiErrorCode.LlmExtractionFailed, { reason })` côté endpoint.

3. **Given** l'API Claude est indisponible (timeout, 5xx, erreur réseau),
   **When** `categorizeStatement` est appelé,
   **Then** le service distingue cette erreur et la propage avec un marqueur clair → mappable en `domainError(ApiErrorCode.LlmUnavailable, ...)`.

4. **Given** la clé API n'est pas configurée (`process.env.ANTHROPIC_API_KEY` absente ou vide),
   **When** le service est importé/initialisé,
   **Then** une erreur explicite est levée au premier appel : `Missing ANTHROPIC_API_KEY in environment`.

5. **Given** la confidentialité (NFR6),
   **When** je vérifie le code,
   **Then** le service envoie à Claude **uniquement** le `rawText` du relevé (qui contient déjà date/libellé/montant) — aucun enrichissement avec nom complet, IBAN, adresse, métadonnées de la machine.

6. **Given** la convention NFR12 (boundary imperméable),
   **When** je grep le code,
   **Then** aucun `import` direct de `@anthropic-ai/sdk` n'existe en dehors de `llm-categorizer.ts`.

7. **Given** des tests `server/services/llm-categorizer.test.ts`,
   **When** je lance la suite,
   **Then** elle couvre : (a) cas heureux avec sortie valide mockée, (b) sortie invalide → erreur extraction, (c) erreur réseau → erreur unavailable, (d) clé API manquante → erreur explicite.

## Tasks / Subtasks

- [x] **Task 1 — Définir le prompt LLM figé V1** (AC: #1)
  - [x] Créer `shared/constants/bank-statement-llm-prompt.ts` selon le snippet Dev Notes
  - [x] Le prompt est une constante exportée, versionnée par commit (jamais modifié à chaud)

- [x] **Task 2 — Implémenter `categorizeStatement`** (AC: #1, #2, #3, #4, #5)
  - [x] Créer `server/services/llm-categorizer.ts` selon le snippet Dev Notes
  - [x] Initialisation lazy du client Anthropic (instancié au premier appel, pas à l'import — facilite les tests)
  - [x] Validation Zod stricte de la sortie via `z.array(ExtractedTransactionSchema).parse(...)`
  - [x] Validation supplémentaire : chaque `categoryCode` doit être dans `availableCategories` (sinon → erreur `category_not_in_available_set`)
  - [x] Distinguer erreur réseau/API vs erreur de validation via try/catch + classes d'erreur custom

- [x] **Task 3 — Tests avec mocks** (AC: #7)
  - [x] Créer `server/services/llm-categorizer.test.ts`
  - [x] Mocker `@anthropic-ai/sdk` (via `vi.mock`) pour les 4 cas : succès, sortie invalide, erreur réseau, clé manquante
  - [x] Pas d'appel réseau réel en test (NFR12 + perf de la suite)

- [x] **Task 4 — Vérifier l'isolation** (AC: #6)
  - [x] `grep -rn "from '@anthropic-ai/sdk'" .` (excluant `node_modules`, `_bmad-output`)
  - [x] Une seule occurrence prod attendue : dans `server/services/llm-categorizer.ts` (le fichier de test mock le SDK et n'est pas du code de production)

- [x] **Task 5 — Sanity check final**
  - [x] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
  - [ ] Commit unique (à faire par l'utilisateur)

## Dev Notes

### Snippet `shared/constants/bank-statement-llm-prompt.ts` (Task 1)

```ts
/**
 * Prompt système figé V1 pour la catégorisation des transactions Boursorama.
 *
 * VERSIONING : ce prompt est une constante. Pour le modifier, créer une nouvelle
 * version (v2) et basculer explicitement — pas de hot-update. La cohérence des
 * catégorisations passées dépend de la stabilité du prompt.
 *
 * NFR6 : ne JAMAIS injecter de données personnelles ici (nom, IBAN, adresse).
 * Le rawText du relevé contient déjà ce qui est nécessaire pour le LLM.
 */
export const BANK_STATEMENT_PROMPT_VERSION = 1

export const BANK_STATEMENT_SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction et la catégorisation de transactions bancaires françaises à partir de relevés Boursorama.

Tu reçois en entrée le texte brut d'un relevé de compte (issu d'une extraction PDF, donc parfois mal formaté). Tu dois en extraire TOUTES les transactions et retourner un JSON strictement conforme au schéma fourni.

RÈGLES CRITIQUES :

1. **Exhaustivité** : extraire TOUTES les opérations, sans en omettre. Si une ligne te semble ambiguë, l'inclure quand même avec catégorie "divers".

2. **Signe du montant** :
   - SORTIES (achats, prélèvements, virements émis, frais bancaires) → montant NÉGATIF
   - ENTRÉES (virements reçus, ARE/Pôle Emploi, salaire, remboursements) → montant POSITIF
   - Tu détermines le signe à partir du contexte (colonne "Débit"/"Crédit" du relevé, ou indicateurs textuels).

3. **Format des montants** : tu retournes les montants en CENTIMES (entiers signés). Exemple : 12,34 € → 1234. -12,34 € → -1234. JAMAIS de décimal.

4. **Format des dates** : YYYY-MM-DD. Convertir depuis JJ/MM/AAAA.

5. **Catégories** : utilise STRICTEMENT un des codes fournis dans la liste \`available_categories\`. Si tu hésites, utilise "divers".

6. **Libellé (\`label\`)** : conserve le libellé brut du relevé (raccourci raisonnablement à 100 caractères max), ne paraphrase pas. Conserve les références utiles (numéro de carte tronqué, ville, date d'opération si différente de la date de débit, etc.).

7. **Pas d'invention** : si tu ne trouves pas un montant, une date, ou un libellé clair pour une ligne, NE PAS l'inclure. Mieux vaut omettre qu'inventer.

8. **Pas d'enrichissement** : ne pas ajouter de TVA, ne pas calculer de soldes, ne pas regrouper plusieurs lignes en une seule. Une ligne du relevé = une transaction.

Si le texte ne contient aucune transaction identifiable, retourne un tableau vide \`[]\`.`

/**
 * Construit le user message à partir du rawText et des catégories disponibles.
 * Garde la structure simple et le tokens count maîtrisé.
 */
export function buildBankStatementUserMessage(
  rawText: string,
  availableCategories: ReadonlyArray<{ code: string; label: string; isVariable: boolean }>,
): string {
  const categoriesList = availableCategories
    .map((c) => `- ${c.code}: ${c.label}`)
    .join('\n')

  return `Voici les catégories disponibles (utiliser STRICTEMENT le code, pas le label) :

${categoriesList}

Voici le texte brut du relevé bancaire à parser. Extrait toutes les transactions au format JSON strict (un tableau d'objets).

---DEBUT RELEVE---
${rawText}
---FIN RELEVE---`
}
```

### Snippet `server/services/llm-categorizer.ts` (Task 2)

```ts
/**
 * llm-categorizer — SEUL POINT D'ENTRÉE vers `@anthropic-ai/sdk` (NFR12, NFR16).
 *
 * Toute autre tentative d'utilisation directe du SDK Anthropic ailleurs dans le code
 * est un anti-pattern documenté dans CLAUDE.md.
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import {
  ExtractedTransactionSchema,
  type ExtractedTransaction,
} from '~/shared/schemas/transaction.schema'
import {
  BANK_STATEMENT_SYSTEM_PROMPT,
  BANK_STATEMENT_PROMPT_VERSION,
  buildBankStatementUserMessage,
} from '~/shared/constants/bank-statement-llm-prompt'
import type { DefaultCategory } from '~/shared/constants/default-categories'

/**
 * Erreurs domaine spécifiques à ce service.
 * L'endpoint orchestrateur (Story 2.6) les wrap en createError() avec les codes ApiErrorCode.
 */
export class LlmExtractionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'LlmExtractionError'
  }
}

export class LlmUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
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
 * JSON schema décrivant la sortie attendue, utilisé en structured output.
 * Aligné avec ExtractedTransactionSchema (Zod). Si tu modifies l'un, modifier l'autre.
 */
const OUTPUT_JSON_SCHEMA = {
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
} as const

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

  let responseText: string
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: BANK_STATEMENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      // Structured outputs via tool_use ou response_format selon la version SDK.
      // Pour rester portable, on demande du JSON strict via une tool définition.
      tools: [
        {
          name: 'submit_transactions',
          description: 'Soumet la liste des transactions extraites du relevé.',
          // @ts-expect-error — input_schema accepté par l'API (vérifier types SDK)
          input_schema: OUTPUT_JSON_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_transactions' },
    })

    // Récupérer le tool_use de la réponse
    const toolUse = response.content.find((c) => c.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new LlmExtractionError(
        'No tool_use in Claude response',
        response.content,
      )
    }
    responseText = JSON.stringify(toolUse.input)
  } catch (err) {
    if (err instanceof LlmExtractionError) throw err
    // Anthropic SDK errors : APIError, APIConnectionError, etc.
    if (err instanceof Anthropic.APIError) {
      // 4xx → considéré comme un problème de notre côté, log et propage en extraction error
      if (err.status >= 400 && err.status < 500) {
        throw new LlmExtractionError(`Claude API client error (${err.status}): ${err.message}`, err)
      }
      // 5xx → service indisponible côté Anthropic
      throw new LlmUnavailableError(`Claude API server error (${err.status}): ${err.message}`, err)
    }
    if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.APIConnectionTimeoutError) {
      throw new LlmUnavailableError('Claude API unreachable', err)
    }
    // Erreur inconnue : on remonte
    throw err
  }

  // Parsing JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(responseText)
  } catch (err) {
    throw new LlmExtractionError(`Invalid JSON in Claude response: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Validation Zod
  const validated = ResponseSchema.safeParse(parsed)
  if (!validated.success) {
    throw new LlmExtractionError(
      `Claude response schema validation failed: ${validated.error.message}`,
      validated.error,
    )
  }

  // Validation supplémentaire : toutes les catégories doivent être dans availableCategories
  const validCodes = new Set(availableCategories.map((c) => c.code))
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
```

### Snippet `server/services/llm-categorizer.test.ts` (Task 3)

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock complet du SDK Anthropic AVANT l'import du service
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class MockAnthropic {
    messages = { create: mockCreate }
    constructor(_opts: unknown) {}
    static APIError = class extends Error {
      constructor(public status: number, message: string) {
        super(message)
        this.name = 'APIError'
      }
    }
    static APIConnectionError = class extends Error {
      constructor(message: string) { super(message); this.name = 'APIConnectionError' }
    }
    static APIConnectionTimeoutError = class extends Error {
      constructor(message: string) { super(message); this.name = 'APIConnectionTimeoutError' }
    }
  }
  return { default: MockAnthropic }
})

// Import APRÈS le mock
import {
  categorizeStatement,
  LlmExtractionError,
  LlmUnavailableError,
  _resetClientForTesting,
} from './llm-categorizer'
import { DEFAULT_CATEGORIES } from '~/shared/constants/default-categories'

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
  })

  it('throws LlmExtractionError on invalid schema', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          input: {
            transactions: [{ transactionDate: 'invalid', label: 'x', amountCents: 'bad', categoryCode: 'shopping' }],
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

  it('throws LlmUnavailableError on 5xx', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    mockCreate.mockRejectedValueOnce(new Anthropic.APIError(503, 'Service Unavailable'))
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('throws LlmUnavailableError on connection error', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    mockCreate.mockRejectedValueOnce(new Anthropic.APIConnectionError('Network down'))
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('throws on missing API key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    _resetClientForTesting()
    await expect(categorizeStatement('rawText', DEFAULT_CATEGORIES)).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })
})
```

### Notes sur le modèle Claude

- **Modèle V1 recommandé** : `claude-sonnet-4-6` (rapport qualité/prix optimal pour de l'extraction structurée).
- Si la latence dépasse les 30s NFR1, considérer `claude-haiku-4-5` (plus rapide mais moins fiable sur des relevés ambigus).
- À documenter dans Completion Notes : modèle effectivement utilisé + observations sur la latence et la qualité.

### Considération de coût

Un PDF mensuel ≈ 50-200 transactions ≈ ~3000-8000 tokens en input (rawText + catégories), ~1500-4000 tokens en output. Avec Sonnet 4.6 fin 2026, ça reste modeste (de l'ordre de quelques centimes par PDF). Aucun cache à mettre en V1 — la dédup par hash du PDF (Story 2.6) garantit déjà qu'un PDF n'est jamais catégorisé deux fois.

### Anti-patterns à éviter

- ❌ Importer `@anthropic-ai/sdk` ailleurs — viole NFR12.
- ❌ Mettre la clé API en argument du constructeur ou en config — toujours via `process.env.ANTHROPIC_API_KEY`.
- ❌ Faire un appel réseau réel dans les tests — toujours mocker `@anthropic-ai/sdk`.
- ❌ Ignorer le `tool_choice: { type: 'tool', ... }` et compter sur le format JSON via prompt — le tool_use est plus fiable.
- ❌ Loguer le `rawText` ou la réponse complète en console (potentiellement sensible) — logger uniquement le hash du relevé, le nombre de transactions extraites, la durée.

### Project Structure Notes

Cette story crée :
- `shared/constants/bank-statement-llm-prompt.ts`
- `server/services/llm-categorizer.ts`
- `server/services/llm-categorizer.test.ts`

### Definition of Done

- [ ] Prompt système figé V1 dans `shared/constants/`
- [ ] `categorizeStatement` exposée avec interface stable (`Promise<ExtractedTransaction[]>`)
- [ ] Validation Zod stricte + validation `categoryCode ∈ availableCategories`
- [ ] 2 classes d'erreur distinctes (`LlmExtractionError` vs `LlmUnavailableError`)
- [ ] Initialisation lazy + reset hook pour tests
- [ ] 6 tests unitaires couvrant les cas principaux
- [ ] Aucun import `@anthropic-ai/sdk` ailleurs (vérifié par grep)
- [ ] `yarn typecheck`, `yarn lint`, `yarn test:run` propres
- [ ] Commit unique

### References

- [Source: `CLAUDE.md`#Stack verrouillée] — `@anthropic-ai/sdk`
- [Source: `CLAUDE.md`#Sécurité] — clé API en .env, jamais loguée
- [Source: `CLAUDE.md`#Invariants critiques §Boundaries imperméables] — SDK Anthropic via service unique
- [Source: `_bmad-output/planning-artifacts/architecture.md`#Core Architectural Decisions §D5] — REST + structured outputs
- [Source: `_bmad-output/planning-artifacts/architecture.md`#NFR6, §NFR12, §NFR14] — payload limité, single integration, structured outputs
- [Source: `_bmad-output/planning-artifacts/epics.md`#Story 2.4] — story originale
- [Previous stories: `1-3` (Cents pas utilisé directement ici), `1-4` (DEFAULT_CATEGORIES type), `2-1` (ExtractedTransactionSchema)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- SDK Anthropic `^0.91.1` — les classes d'erreur (`APIError`, `APIConnectionError`, `APIConnectionTimeoutError`) sont exposées en **named exports** depuis `@anthropic-ai/sdk` (pas en propriétés statiques de la classe `Anthropic`). Le snippet Dev Notes utilisait `Anthropic.APIError` ; corrigé en imports nommés.
- `Anthropic.Messages.Tool.InputSchema` exige `type: 'object'` littéral et un `required: string[]` mutable → typer la constante du schéma avec ce type (et non `as const`) sinon la signature de `messages.create()` rejette le `tools[0].input_schema`.
- Pour les classes d'erreur custom étendant `Error`, le paramètre property `cause` doit être déclaré avec `public override readonly cause` car il existe déjà sur `Error` en TS récent (TS4115).
- `vi.mock('@anthropic-ai/sdk', factory)` est hoisté → les références dans la factory à des variables externes nécessitent `vi.hoisted()`. Les classes mock (APIError etc.) doivent être déclarées **dans** la factory, pas en haut du fichier.

### Completion Notes List

- Modèle Claude V1 retenu : `claude-sonnet-4-6` (rapport qualité/prix sur extraction structurée). À mesurer sur un vrai PDF Boursorama lors de Story 2.6 (latence + qualité catégorisation).
- 10 tests couvrent : (a) happy path, (b) array vide, (c) schéma invalide, (d) catégorie inconnue, (e) absence de tool_use, (f) erreur 5xx → unavailable, (g) erreur 4xx → extraction failed, (h) connection error → unavailable, (i) timeout → unavailable, (j) clé API manquante.
- AC #6 (isolation NFR12) : seul `server/services/llm-categorizer.ts` importe `@anthropic-ai/sdk` en code de production. Le fichier de test `server/services/llm-categorizer.test.ts` importe la lib uniquement pour récupérer le mock retourné par `vi.mock` — il ne consomme pas le SDK réel.
- AC #4 (clé API) : le check est exécuté à l'instanciation lazy (`getClient()`, premier appel à `categorizeStatement`), pas à l'import du module — pour ne pas bloquer Nitro au boot et faciliter les tests.
- Le prompt système et le user message envoient uniquement `rawText` + liste des catégories disponibles (code+label). Aucun PII ajouté côté service (NFR6 / AC #5).

### File List

- `shared/constants/bank-statement-llm-prompt.ts` (nouveau)
- `server/services/llm-categorizer.ts` (nouveau)
- `server/services/llm-categorizer.test.ts` (nouveau)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié — story 2.4 → review)
- `_bmad-output/implementation-artifacts/2-4-service-llm-categorizer.md` (modifié — Dev Agent Record + Status)

### Change Log

- 2026-04-30 — Implémentation Story 2.4 : prompt figé V1, service `categorizeStatement` isolé NFR12 avec deux classes d'erreur distinctes (`LlmExtractionError`/`LlmUnavailableError`), 10 tests unitaires mockés. Status → review.
