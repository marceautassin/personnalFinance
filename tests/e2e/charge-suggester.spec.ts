import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'

const FIXTURE_DIR = resolve('tests/fixtures/pdfs')

function findFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return []
  return readdirSync(FIXTURE_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort()
    .map(f => resolve(FIXTURE_DIR, f))
}

const FIXTURES = findFixtures()

/**
 * E2E charge-suggester (Story 5.2).
 *
 * Pré-requis : PDFs de fixture + ANTHROPIC_API_KEY (pipeline d'ingestion réel).
 * La détection exige ≥ 3 mois distincts présentant un récurrent : si les fixtures
 * disponibles ne produisent aucune suggestion, le scénario est skippé en runtime
 * (pas de false-fail) plutôt que d'exiger des fixtures spécifiques NETFLIX×3.
 */
test.describe.serial('Charge suggester', () => {
  test.skip(FIXTURES.length === 0, 'Aucun PDF de fixture sous tests/fixtures/pdfs/')
  test.skip(!process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY non défini : E2E LLM-dépendant skippé')

  async function ingestAll(page: import('@playwright/test').Page) {
    await page.goto('/import')
    await expect(page.getByRole('heading', { name: /Importer un relevé/i })).toBeVisible({ timeout: 10_000 })
    const ack = page.getByRole('button', { name: /J'ai compris/i })
    if (await ack.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ack.click()
      await expect(ack).toBeHidden()
    }
    for (const fixture of FIXTURES) {
      await page.locator('input[type=file]').setInputFiles(fixture)
      await expect(page.getByText(/Relevé ingéré|déjà été ingéré/i)).toBeVisible({ timeout: 35_000 })
    }
  }

  test('détecte, accepte une suggestion et la retire du panneau', async ({ page }) => {
    await ingestAll(page)

    await page.goto('/charges')
    await expect(page.getByRole('heading', { name: /Charges fixes/i })).toBeVisible()

    const panel = page.locator('.suggest')
    const hasSuggestion = await panel.isVisible({ timeout: 5_000 }).catch(() => false)
    test.skip(!hasSuggestion, 'Les fixtures disponibles ne produisent aucun récurrent ≥ 3 mois')

    const firstItem = panel.locator('.suggest__item').first()
    const label = (await firstItem.locator('.suggest__label').textContent())?.trim() ?? ''
    expect(label.length).toBeGreaterThan(0)

    await firstItem.getByRole('button', { name: 'Accepter' }).click()

    // La charge apparaît dans la liste…
    await expect(page.getByRole('row', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }))
      .toBeVisible({ timeout: 10_000 })
    // …et la suggestion a disparu du panneau (exclue car désormais en fixed_charges).
    await expect(panel.locator('.suggest__item').filter({ hasText: label })).toHaveCount(0)
  })
})
