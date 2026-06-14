import { test, expect, type Page } from '@playwright/test'

/**
 * E2E modèle de revenus (Story 5.3).
 *
 * Aucune dépendance LLM ni PDF : le CRUD du singleton revenus est autonome.
 * Le test écrit l'ARE puis recharge pour prouver la persistance, et remet le champ à 0
 * en fin de parcours → il s'auto-nettoie et ne pollue pas l'état persistant.
 */
test.describe('Revenus — persistance ARE', () => {
  function arePanel(page: Page) {
    return page.locator('.rev-panel', {
      has: page.getByRole('heading', { name: /Allocation chômage/i }),
    })
  }

  test('saisit ARE + date de fin, recharge, vérifie la persistance', async ({ page }) => {
    await page.goto('/revenus')
    await expect(page.getByRole('heading', { name: /Revenus récurrents/i })).toBeVisible()

    // Badge FR22 « Non imposable » présent sur le panneau défraiements.
    await expect(page.getByText('Non imposable')).toBeVisible()

    const are = arePanel(page)
    await expect(are).toBeVisible()

    await are.getByLabel('Montant mensuel (€)').fill('1100')
    await are.getByLabel('Fin des droits (optionnelle)').fill('2026-12-31')
    await are.getByRole('button', { name: 'Enregistrer' }).click()

    // Recharge : la valeur doit avoir persisté côté serveur.
    await page.waitForLoadState('networkidle')
    await page.reload()

    const areAfter = arePanel(page)
    await expect(areAfter.getByLabel('Montant mensuel (€)')).toHaveValue('1100')
    await expect(areAfter.getByLabel('Fin des droits (optionnelle)')).toHaveValue('2026-12-31')

    // Nettoyage : remet l'ARE à 0 et efface la date pour ne pas polluer la DB dev.
    await areAfter.getByLabel('Montant mensuel (€)').fill('')
    await areAfter.getByLabel('Fin des droits (optionnelle)').fill('')
    await areAfter.getByRole('button', { name: 'Enregistrer' }).click()
    await page.waitForLoadState('networkidle')
    await page.reload()
    await expect(arePanel(page).getByLabel('Montant mensuel (€)')).toHaveValue('')
  })
})
