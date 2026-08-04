import { test, expect } from '@playwright/test'

/**
 * E2E page forecast (Story 7.6). Aucune dépendance LLM : les singletons seedés au bootstrap
 * suffisent (forecast possiblement vide/positif). Vérifie le rendu graphe + carte dividende et
 * le changement d'horizon (nombre de barres = nombre de mois).
 */
test.describe('Forecast — page, graphe, carte dividende', () => {
  test('affichage + changement d\'horizon', async ({ page }) => {
    await page.goto('/forecast')
    await expect(page.getByRole('heading', { name: 'Forecast', exact: true })).toBeVisible()

    // Carte dividende visible.
    await expect(page.getByText('Dividende à voter')).toBeVisible()
    await expect(page.getByTestId('dividend-net')).toBeVisible()

    // Graphe (SVG) rendu avec 12 barres par défaut.
    const bars = page.locator('.fc-chart__bar')
    await expect(bars).toHaveCount(12)

    // Horizon 24 → 24 barres.
    await page.getByRole('button', { name: '24 mois' }).click()
    await expect(bars).toHaveCount(24)

    // Horizon 6 → 6 barres.
    await page.getByRole('button', { name: '6 mois' }).click()
    await expect(bars).toHaveCount(6)
  })

  test('override d\'une catégorie variable : créer puis retirer (FR44)', async ({ page }) => {
    await page.goto('/forecast')
    await expect(page.getByRole('heading', { name: 'Forecast', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Ajuster une catégorie' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: /Ajuster une catégorie/ })).toBeVisible()

    // Premier mois du forecast + première catégorie variable + montant.
    const monthValue = await dialog.getByLabel('Mois').locator('option').nth(1).getAttribute('value')
    await dialog.getByLabel('Mois').selectOption(monthValue!)
    await dialog.getByLabel('Catégorie').selectOption({ index: 1 })
    await dialog.getByLabel('Montant (€)').fill('123')
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()

    // L'override apparaît dans la liste (mois-catégorie), puis on le retire.
    const row = dialog.locator('[data-testid^="override-"]').first()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: /Supprimer l'override/ }).click()
    await expect(dialog.locator('[data-testid^="override-"]')).toHaveCount(0)
  })
})
