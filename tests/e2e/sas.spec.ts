import { test, expect } from '@playwright/test'

/**
 * E2E config SAS + capacité dividendable (Story 5.4).
 *
 * Aucune dépendance LLM ni PDF. Vérifie le recalcul live de la card (avant save) puis la
 * persistance après reload. Remet les champs aux valeurs par défaut en fin de parcours
 * → auto-nettoyage de la DB dev.
 *
 * Les boutons « Enregistrer » sont ciblés via `data-testid` de formulaire : la page en
 * expose deux (config fiscale, clôture d'exercice) et un `.first()` faisait dépendre le
 * test de leur ordre de rendu (revue 2026-08-04).
 */
test.describe('SAS — config + capacité dividendable', () => {
  test('recalcul live de la capacité, save, reload, persistance', async ({ page }) => {
    await page.goto('/sas')
    await expect(page.getByRole('heading', { name: /SAS — données fiscales/i })).toBeVisible()

    await page.getByLabel('CA prévisionnel (€)').fill('100000')
    await page.getByLabel('Charges prévisionnelles (€)').fill('60000')
    await page.getByLabel('Report à nouveau (€)').fill('20000')
    await page.getByLabel('Taux IS (%)').fill('15')

    // Recalcul live AVANT enregistrement : 40 000 € profit, 6 000 € IS, capacité 54 000 €.
    await expect(page.getByTestId('dividend-capacity')).toHaveText(/54\s000,00/)

    await page.getByTestId('sas-config-form').getByRole('button', { name: 'Enregistrer' }).click()
    await page.waitForLoadState('networkidle')
    await page.reload()

    // Persistance des champs + recalcul de la card depuis l'état persistant.
    await expect(page.getByLabel('CA prévisionnel (€)')).toHaveValue('100000')
    await expect(page.getByLabel('Charges prévisionnelles (€)')).toHaveValue('60000')
    await expect(page.getByLabel('Report à nouveau (€)')).toHaveValue('20000')
    await expect(page.getByLabel('Taux IS (%)')).toHaveValue('15')
    await expect(page.getByTestId('dividend-capacity')).toHaveText(/54\s000,00/)

    // Nettoyage : remet les valeurs par défaut (0 / 0 / 0 / 15 %).
    await page.getByLabel('CA prévisionnel (€)').fill('')
    await page.getByLabel('Charges prévisionnelles (€)').fill('')
    await page.getByLabel('Report à nouveau (€)').fill('')
    await page.getByLabel('Taux IS (%)').fill('15')
    await page.getByTestId('sas-config-form').getByRole('button', { name: 'Enregistrer' }).click()
    await page.waitForLoadState('networkidle')
    await page.reload()
    await expect(page.getByLabel('CA prévisionnel (€)')).toHaveValue('')
  })
})
