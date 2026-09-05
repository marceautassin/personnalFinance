import { test, expect } from '@playwright/test'

/**
 * E2E de la page d'analyse (FR25, FR29-FR33).
 *
 * Tourne sur la base E2E, vide : ce sont donc les états vides, la navigation de période et la
 * synchronisation d'URL qui sont vérifiés ici. Les calculs eux-mêmes sont couverts par les
 * tests unitaires d'`analysis-engine`, qui n'ont besoin d'aucune base.
 */
test.describe('Analyse — période et états vides', () => {
  test('affiche les quatre indicateurs et des taux indéfinis sur une période vide', async ({ page }) => {
    await page.goto('/analyse?p=2026-03&g=month')
    await expect(page.getByRole('heading', { name: 'Analyse' })).toBeVisible()

    for (const label of ['Trésorerie de la période', 'Taux de dépense', 'Taux d\'épargne', 'Trésorerie cumulée']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    }

    // AR10 — un taux sans dénominateur s'affiche « — », jamais « 0 % » : un mois sans recette
    // n'a pas un taux d'épargne nul, il n'en a pas.
    const rates = page.locator('.indic__card', { hasText: 'Taux' }).locator('.indic__value')
    await expect(rates.first()).toHaveText('—')
    await expect(rates.nth(1)).toHaveText('—')
  })

  test('montre les trois natures, mouvements internes compris', async ({ page }) => {
    await page.goto('/analyse?p=2026-03&g=month')
    // FR30 — les mouvements internes sont consultables À PART : ils n'entrent dans aucun des
    // deux totaux, mais les cacher rendrait le solde bancaire incompréhensible.
    for (const title of ['Dépenses', 'Recettes', 'Mouvements internes']) {
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    }
  })

  test('navigue entre les périodes et reflète la sélection dans l\'URL', async ({ page }) => {
    await page.goto('/analyse?p=2026-03&g=month')
    await expect(page.getByText('mars 2026')).toBeVisible()

    await page.getByRole('button', { name: 'Période précédente' }).click()
    await expect(page.getByText('février 2026')).toBeVisible()
    await expect(page).toHaveURL(/p=2026-02/)

    await page.getByRole('button', { name: 'Période suivante' }).click()
    await expect(page.getByText('mars 2026')).toBeVisible()
  })

  /** Changer de granularité doit rester sur la même date, pas sauter au début de l'historique. */
  test('change de granularité en restant sur la même date', async ({ page }) => {
    await page.goto('/analyse?p=2026-03&g=month')
    await page.getByLabel('Granularité').selectOption('quarter')
    await expect(page.getByText('T1 2026')).toBeVisible()
    await expect(page).toHaveURL(/g=quarter/)

    await page.getByLabel('Granularité').selectOption('year')
    await expect(page.getByText('2026', { exact: true })).toBeVisible()
  })

  test('rouvre exactement la période portée par l\'URL', async ({ page }) => {
    await page.goto('/analyse?p=2025-T4&g=quarter')
    await expect(page.getByText('T4 2025')).toBeVisible()
  })
})
