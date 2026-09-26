import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

/**
 * E2E de l'import d'export Excel Crédit Mutuel (story 28.4, FR82 à FR84, D44).
 *
 * Cookie `pf_profile=1` posé explicitement (comme `rules.spec.ts`, `import-bank.spec.ts`) : la
 * base E2E est partagée par toute la suite, et d'autres specs y laissent un second profil qui
 * fait disparaître le repli « exactement un profil » (D38).
 */
const FIXTURE_PATH = resolve('tests/fixtures/statements/credit-mutuel-export.xlsx')
const FIXTURE = existsSync(FIXTURE_PATH) ? readFileSync(FIXTURE_PATH) : null

test.describe('Import d\'un export Excel Crédit Mutuel', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string
    await page.context().addCookies([{ name: 'pf_profile', value: '1', url: baseURL }])
  })

  test('la zone de dépôt accepte un .xlsx (pas de rejet client)', async ({ page }) => {
    test.skip(!FIXTURE, 'Fixture credit-mutuel-export.xlsx absente — GENERATE_FIXTURE=1 yarn test:run generate-synthetic-export')

    await page.goto('/import')
    await expect(page.getByRole('heading', { name: /Importer/i })).toBeVisible()

    await page.setInputFiles('input[type=file]', {
      name: 'credit-mutuel-export.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: FIXTURE!,
    })

    // Aucun message de rejet côté client ("n'est ni un PDF ni un export Excel") : le fichier
    // est parti en file d'ingestion, quel que soit son sort ensuite côté serveur.
    await expect(page.getByText(/n'est ni un PDF ni un export Excel/i)).not.toBeVisible()
  })

  test('un export déposé sous Boursorama → bank_mismatch affiché, rien dans la liste (AC 8)', async ({ page }) => {
    test.skip(!FIXTURE, 'Fixture credit-mutuel-export.xlsx absente — GENERATE_FIXTURE=1 yarn test:run generate-synthetic-export')

    await page.goto('/import')
    await page.getByLabel('Banque').selectOption('boursorama')
    await page.setInputFiles('input[type=file]', {
      name: 'credit-mutuel-export.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: FIXTURE!,
    })

    await expect(page.getByText(/ne correspond pas à la banque sélectionnée|semble être un relevé Crédit Mutuel/i))
      .toBeVisible({ timeout: 15_000 })

    // Rien n'a été ingéré : la file d'ingestion signale un échec, jamais un succès pour ce fichier.
    await expect(page.getByTestId('queue-item-credit-mutuel-export.xlsx').getByText('Échec')).toBeVisible()
  })

  test('POST /api/statements refuse un .xls (ancien format) explicitement', async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string
    // En-tête OLE2/CFBF (D0 CF 11 E0), reconnu comme .xls sans être un classeur lisible.
    const fakeXls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00, 0x00, 0x00])
    const response = await page.request.post(`${baseURL}/api/statements`, {
      multipart: {
        file: { name: 'vieux-format.xls', mimeType: 'application/vnd.ms-excel', buffer: fakeXls },
      },
    })
    expect(response.status()).toBe(400)
    const json = await response.json()
    expect(json.statusMessage ?? json.data?.statusMessage).toBe('validation_failed')
  })

  test('POST /api/statements refuse un fichier sans octets magiques reconnus', async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string
    const response = await page.request.post(`${baseURL}/api/statements`, {
      multipart: {
        file: { name: 'rien.txt', mimeType: 'text/plain', buffer: Buffer.from('ceci n\'est ni un PDF ni un xlsx') },
      },
    })
    expect(response.status()).toBe(400)
    const json = await response.json()
    expect(json.statusMessage ?? json.data?.statusMessage).toBe('validation_failed')
  })

  test('import complet d\'un export → succès (E2E LLM-dépendant)', async ({ page }) => {
    test.skip(!FIXTURE, 'Fixture credit-mutuel-export.xlsx absente — GENERATE_FIXTURE=1 yarn test:run generate-synthetic-export')
    test.skip(!process.env.MISTRAL_API_KEY, 'MISTRAL_API_KEY non défini : E2E LLM-dépendant skippé')

    await page.goto('/import')
    await page.setInputFiles('input[type=file]', {
      name: 'credit-mutuel-export.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: FIXTURE!,
    })

    await expect(page.getByText(/Non vérifié/i)).toBeVisible({ timeout: 35_000 })
  })
})
