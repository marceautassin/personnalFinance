import { test, expect, type Page } from '@playwright/test'

/**
 * E2E gestion des dettes (Story 6.2). Aucune dépendance LLM ni PDF.
 * Ajoute une dette (mode mensualité), vérifie la card + solde, ajoute une avance (solde
 * incrémenté), puis supprime. Idempotent : nettoie les dettes « E2E Créancier » au démarrage.
 */
async function cleanup(page: Page) {
  for (let guard = 0; guard < 10; guard++) {
    const cards = page.locator('[data-testid^="debt-card-"]', { hasText: 'E2E Créancier' })
    const count = await cards.count()
    if (count === 0) return
    await cards.first().getByRole('button', { name: /Supprimer la dette/ }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(cards).toHaveCount(count - 1) // attend le retrait effectif avant de reboucler
  }
}

test.describe('Dettes — CRUD + avance', () => {
  test('ajouter une dette, ajouter une avance, supprimer', async ({ page }) => {
    await page.goto('/dettes')
    await expect(page.getByRole('heading', { name: 'Dettes' })).toBeVisible()
    await cleanup(page)

    // Ajout d'une dette mode mensualité : solde 1000 €, mensualité 100 €.
    await page.getByRole('button', { name: 'Ajouter une dette' }).click()
    await page.getByLabel('Créancier').fill('E2E Créancier')
    await page.getByLabel('Solde initial (€)').fill('1000')
    await page.getByLabel('Mode de remboursement').selectOption('monthly')
    await page.getByLabel('Mensualité (€)').fill('100')
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()

    const card = page.locator('[data-testid^="debt-card-"]', { hasText: 'E2E Créancier' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('1 000,00')

    // Avance de 250 € → solde attendu 1 250 €.
    await card.getByRole('button', { name: '+ Avance' }).click()
    await card.getByLabel('Avance reçue (€)').fill('250')
    await card.getByLabel('Date').fill('2026-02-01')
    await card.getByRole('button', { name: 'Enregistrer l\'avance' }).click()
    await expect(card).toContainText('1 250,00')

    // Suppression.
    await card.getByRole('button', { name: /Supprimer la dette/ }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(page.locator('[data-testid^="debt-card-"]', { hasText: 'E2E Créancier' })).toHaveCount(0)
  })
})
