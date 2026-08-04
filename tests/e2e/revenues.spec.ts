import { test, expect, type Page } from '@playwright/test'

/**
 * E2E modèle de revenus (Story 5.3).
 *
 * Aucune dépendance LLM ni PDF : le CRUD du singleton revenus est autonome.
 * Le test constate l'état initial à zéro (AC#10), écrit l'ARE puis recharge pour prouver la
 * persistance, et remet le champ à 0 en fin de parcours → il s'auto-nettoie et ne pollue pas
 * l'état persistant.
 *
 * La date de fin de droits est calculée relativement à l'exécution : l'invariant ARE refuse
 * une date échue, une date en dur finirait par faire rougir le test (revue 2026-08-04).
 */
test.describe('Revenus — persistance ARE', () => {
  const DATE_LABEL = 'Fin des droits (requise si montant > 0)'

  function arePanel(page: Page) {
    return page.locator('.rev-panel', {
      has: page.getByRole('heading', { name: /Allocation chômage/i }),
    })
  }

  function futureDate(): string {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 15))
      .toISOString()
      .slice(0, 10)
  }

  test('saisit ARE + date de fin, recharge, vérifie la persistance', async ({ page }) => {
    const endDate = futureDate()

    await page.goto('/revenus')
    await expect(page.getByRole('heading', { name: /Revenus récurrents/i })).toBeVisible()

    // Badge FR22 « Non imposable » présent sur le panneau défraiements.
    await expect(page.getByText('Non imposable')).toBeVisible()

    const are = arePanel(page)
    await expect(are).toBeVisible()

    // AC#10 — état initial : tous les champs à zéro avant toute saisie.
    await expect(are.getByLabel('Montant mensuel (€)')).toHaveValue('')
    await expect(are.getByLabel(DATE_LABEL)).toHaveValue('')
    await expect(page.getByLabel('Montant mensuel (€)')).toHaveCount(3)

    await are.getByLabel('Montant mensuel (€)').fill('1100')
    await are.getByLabel(DATE_LABEL).fill(endDate)
    await are.getByRole('button', { name: 'Enregistrer' }).click()

    // Recharge : la valeur doit avoir persisté côté serveur.
    await page.waitForLoadState('networkidle')
    await page.reload()

    const areAfter = arePanel(page)
    await expect(areAfter.getByLabel('Montant mensuel (€)')).toHaveValue('1100')
    await expect(areAfter.getByLabel(DATE_LABEL)).toHaveValue(endDate)

    // Nettoyage : remet l'ARE à 0 et efface la date pour ne pas polluer la DB dev.
    await areAfter.getByLabel('Montant mensuel (€)').fill('')
    await areAfter.getByLabel(DATE_LABEL).fill('')
    await areAfter.getByRole('button', { name: 'Enregistrer' }).click()
    await page.waitForLoadState('networkidle')
    await page.reload()
    await expect(arePanel(page).getByLabel('Montant mensuel (€)')).toHaveValue('')
  })

  /**
   * Validation purement cliente : aucune écriture, donc aucune assertion sur l'état persisté
   * — les specs partagent la DB de dev et tournent en parallèle (une assertion globale ici
   * lirait l'état écrit par le parcours ci-dessus).
   */
  test('refuse un montant ARE sans date de fin, avec un message ciblé', async ({ page }) => {
    await page.goto('/revenus')
    const are = arePanel(page)

    await are.getByLabel('Montant mensuel (€)').fill('1100')
    await are.getByLabel(DATE_LABEL).fill('')
    await are.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(are.getByRole('alert')).toContainText(/date de fin de droits/i)
  })
})
