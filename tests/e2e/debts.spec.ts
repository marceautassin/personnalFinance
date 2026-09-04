import { test, expect, type Page } from '@playwright/test'

/**
 * E2E gestion des dettes (stories 6.2 puis 6.5). Aucune dépendance LLM ni PDF.
 * Ajoute une dette (mode mensualité), vérifie la card + solde, enregistre un mouvement d'avance
 * (solde incrémenté) PUIS un règlement signé qui bascule le solde en créance (D16), puis
 * supprime. Idempotent : nettoie les dettes « E2E Créancier » au démarrage.
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
    await card.getByRole('button', { name: '+ Mouvement' }).click()
    await card.getByLabel('Montant (€)').fill('250')
    await card.getByLabel('Date').fill('2026-02-01')
    await card.getByLabel('Nature').selectOption('advance')
    await card.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(card).toContainText('1 250,00')
    await expect(card).toContainText('Dette')

    // Règlement de 2 000 € → le solde bascule en CRÉANCE (−750 €). C'est le cœur de D16 :
    // ce cas était structurellement impossible avant la story 6.5.
    await card.getByRole('button', { name: '+ Mouvement' }).click()
    await card.getByLabel('Montant (€)').fill('2000')
    await card.getByLabel('Date').fill('2026-03-01')
    await card.getByLabel('Nature').selectOption('settlement')
    await card.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(card).toContainText('750,00')
    await expect(card).toContainText('Créance')

    // Suppression.
    await card.getByRole('button', { name: /Supprimer la dette/ }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(page.locator('[data-testid^="debt-card-"]', { hasText: 'E2E Créancier' })).toHaveCount(0)
  })
})
