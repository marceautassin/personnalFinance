import { test, expect } from '@playwright/test'

/**
 * E2E réglages d'imposition des dividendes (Story 5.5).
 *
 * Aucune dépendance LLM ni PDF. Vérifie les valeurs par défaut (30 %, flat tax), la mutation
 * (17 %, barème progressif), puis la persistance après reload. Remet les valeurs par défaut
 * en fin de parcours → auto-nettoyage de la DB dev.
 */
test.describe('Paramètres — imposition des dividendes', () => {
  test('valeurs par défaut, modification, save, reload, persistance', async ({ page }) => {
    await page.goto('/parametres')
    await expect(page.getByRole('heading', { name: /Paramètres — fiscalité/i })).toBeVisible()

    // Valeurs par défaut post-seed : 30 %, flat tax.
    await expect(page.getByLabel('Taux d\'imposition (%)')).toHaveValue('30')
    await expect(page.getByLabel('Mode d\'imposition')).toHaveValue('flat_tax')

    // Modification : 17 %, barème progressif.
    await page.getByLabel('Taux d\'imposition (%)').fill('17')
    await page.getByLabel('Mode d\'imposition').selectOption('progressive')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await page.waitForLoadState('networkidle')
    await page.reload()

    // Persistance après reload.
    await expect(page.getByLabel('Taux d\'imposition (%)')).toHaveValue('17')
    await expect(page.getByLabel('Mode d\'imposition')).toHaveValue('progressive')

    // Nettoyage : remet les valeurs par défaut (30 %, flat tax).
    await page.getByLabel('Taux d\'imposition (%)').fill('30')
    await page.getByLabel('Mode d\'imposition').selectOption('flat_tax')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await page.waitForLoadState('networkidle')
    await page.reload()
    await expect(page.getByLabel('Taux d\'imposition (%)')).toHaveValue('30')
  })
})
