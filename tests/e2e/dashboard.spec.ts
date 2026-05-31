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

/**
 * E2E dashboard mensuel (Story 4.3).
 *
 * Pré-requis : PDF de fixture + ANTHROPIC_API_KEY (pipeline d'ingestion réel), même setup que
 * `reconciliation.spec.ts`. Exécuté en série sur une base fraîche (le cas "état vide" suppose
 * qu'aucun relevé n'a encore été ingéré — cf. Task 7 : wipe `_data` avant le run).
 */
test.describe.serial('Dashboard mensuel', () => {
  test.skip(!FIXTURE, 'Aucun PDF de fixture sous tests/fixtures/pdfs/')
  test.skip(!process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY non défini : E2E LLM-dépendant skippé')

  async function ingestFixture(page: import('@playwright/test').Page) {
    await page.goto('/import')
    await expect(page.getByRole('heading', { name: /Importer un relevé/i })).toBeVisible({ timeout: 10_000 })

    const ack = page.getByRole('button', { name: /J'ai compris/i })
    if (await ack.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ack.click()
      await expect(ack).toBeHidden()
    }

    await page.locator('input[type=file]').setInputFiles(FIXTURE!)
    await expect(page.getByText(/Relevé ingéré/i)).toBeVisible({ timeout: 35_000 })
  }

  // Cas (b) — aucun statement (avant ingestion) → état vide + lien vers /import.
  test('affiche l\'état vide avec CTA import quand aucun relevé n\'est ingéré', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Tableau de bord/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Aucun relevé importé/i })).toBeVisible()
    const cta = page.locator('a[href="/import"]')
    await expect(cta).toBeVisible()
    await cta.click()
    await expect(page).toHaveURL(/\/import/)
  })

  // Cas (a) — un PDF ingéré → BalanceSummary visible + MonthlyNarrative rendu.
  test('affiche le solde et la narration après ingestion d\'un relevé', async ({ page }) => {
    await ingestFixture(page)

    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Tableau de bord/i })).toBeVisible()
    // BalanceSummary rendu — assertions scopées au composant pour éviter une collision
    // strict-mode avec le texte des phrases narratives (« Tes revenus… »).
    const balance = page.locator('.balance')
    await expect(balance).toBeVisible({ timeout: 10_000 })
    await expect(balance.getByText(/Solde fin de mois/i)).toBeVisible()
    await expect(balance.getByText(/Revenus/i)).toBeVisible()
    await expect(balance.getByText(/Dépenses/i)).toBeVisible()
    // MonthlyNarrative rendu (liste de phrases OU fallback "aucun écart")
    await expect(page.locator('.narrative')).toBeVisible()
  })

  // Cas (c) — 2 mois ingérés → MonthSelector change l'URL et re-render.
  test('navigue entre les mois via MonthSelector et met à jour l\'URL', async ({ page }) => {
    await page.goto('/')
    const select = page.locator('.month-selector__select')
    await expect(select).toBeVisible({ timeout: 10_000 })

    const optionCount = await select.locator('option').count()
    test.skip(optionCount < 2, 'Moins de 2 mois ingérés : navigation inter-mois non testable avec cette fixture')

    const secondMonth = await select.locator('option').nth(1).getAttribute('value')
    await select.selectOption(secondMonth!)
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/)
    await expect(page.getByText(/Solde fin de mois/i)).toBeVisible()
  })
})
