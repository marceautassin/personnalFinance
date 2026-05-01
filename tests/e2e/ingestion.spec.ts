import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'

const FIXTURE_DIR = resolve('tests/fixtures/pdfs')

function findFirstFixture(): string | null {
  if (!existsSync(FIXTURE_DIR)) return null
  const pdf = readdirSync(FIXTURE_DIR).find(f => f.toLowerCase().endsWith('.pdf'))
  return pdf ? resolve(FIXTURE_DIR, pdf) : null
}

const FIXTURE = findFirstFixture()

test.describe('Ingestion d\'un relevé PDF', () => {
  test.skip(!FIXTURE, 'Aucun PDF de fixture sous tests/fixtures/pdfs/')
  test.skip(!process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY non défini : E2E LLM-dépendant skippé')

  test('drop PDF → succès → navigation transactions', async ({ page }) => {
    await page.goto('/import')

    // Attendre que la page soit interactive (h2 visible) avant de chercher le disclaimer.
    await expect(page.getByRole('heading', { name: /Importer un relevé/i })).toBeVisible({ timeout: 10_000 })

    // Acquitter le disclaimer modal s'il s'affiche (première visite).
    // Le disclaimer est rendu après hydratation ; on lui laisse 5s, sinon on suppose qu'il a déjà été acquitté.
    const ack = page.getByRole('button', { name: /J'ai compris/i })
    if (await ack.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ack.click()
      await expect(ack).toBeHidden()
    }

    // Upload via input file (le drop natif est validé manuellement)
    await page.locator('input[type=file]').setInputFiles(FIXTURE!)

    // Attendre le succès — NFR1 (≤ 30 s) + marge
    await expect(page.getByText(/Relevé ingéré/i)).toBeVisible({ timeout: 35_000 })

    // Naviguer vers la liste des transactions du mois
    await page.getByRole('link', { name: /Voir les transactions/i }).click()
    await expect(page).toHaveURL(/\/transactions\/\d{4}-\d{2}/)
  })
})
