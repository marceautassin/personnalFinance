import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'

/**
 * E2E ingestion pilotée par une catégorie utilisateur (Story 5.6, AC#13).
 *
 * Confirme AC#10 : le `llm-categorizer` lit la taxonomie depuis la DB (pas DEFAULT_CATEGORIES).
 * Une catégorie créée via `/categories` doit être proposée dans le `CategoryEditor` (story 2.10)
 * après import d'un relevé. Auto-skip sans fixture PDF ou sans MISTRAL_API_KEY.
 */
const FIXTURE_DIR = resolve('tests/fixtures/pdfs')

function findFirstFixture(): string | null {
  if (!existsSync(FIXTURE_DIR)) return null
  const pdf = readdirSync(FIXTURE_DIR).find(f => f.toLowerCase().endsWith('.pdf'))
  return pdf ? resolve(FIXTURE_DIR, pdf) : null
}

const FIXTURE = findFirstFixture()

test.describe('Catégorie utilisateur → taxonomie LLM DB-driven', () => {
  test.skip(!FIXTURE, 'Aucun PDF de fixture sous tests/fixtures/pdfs/')
  test.skip(!process.env.MISTRAL_API_KEY, 'MISTRAL_API_KEY non défini : E2E LLM-dépendant skippé')

  test('créer une catégorie puis l\'ingestion la voit dans le CategoryEditor', async ({ page }) => {
    // Créer la catégorie « Carburant ».
    await page.goto('/categories')
    await page.getByLabel('Libellé').fill('Carburant')
    await page.getByLabel('Type').selectOption('true')
    await page.getByRole('button', { name: 'Ajouter' }).click()
    await expect(page.getByTestId('cat-row-carburant')).toBeVisible()

    // Ingérer un relevé.
    await page.goto('/import')
    await expect(page.getByRole('heading', { name: /Importer un relevé/i })).toBeVisible({ timeout: 10_000 })
    await page.locator('input[type=file]').setInputFiles(FIXTURE!)
    await expect(page.getByText(/Relevé ingéré/i)).toBeVisible({ timeout: 35_000 })
    await page.getByRole('link', { name: /Voir les transactions/i }).click()
    await expect(page).toHaveURL(/\/transactions\/\d{4}-\d{2}/)

    // Le CategoryEditor doit proposer « Carburant » (lu depuis la DB par le LLM).
    const anySelect = page.locator('select').first()
    await expect(anySelect.locator('option', { hasText: 'Carburant' })).toHaveCount(1)

    // Nettoyage : supprimer la catégorie de test (referenceCount 0 attendu).
    await page.goto('/categories')
    const del = page.getByTestId('cat-row-carburant').getByRole('button', { name: /Supprimer/ })
    if (await del.isEnabled()) {
      await del.click()
      await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    }
  })
})
