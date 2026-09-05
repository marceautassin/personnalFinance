import { test, expect } from '@playwright/test'

/**
 * E2E de la page d'évolution (FR31, FR34).
 *
 * Base E2E vide : ce sont donc la fenêtre fixe, la navigation, le sélecteur de cible et la
 * séparation des portées qui sont vérifiés. Les calculs sont couverts par les tests unitaires
 * d'`analysis-engine` et de l'endpoint, qui n'ont besoin d'aucune base peuplée.
 */
test.describe('Évolution', () => {
  test('affiche douze tranches, quelles que soient les données', async ({ page }) => {
    await page.goto('/evolution?p=2026-08&g=month')
    await expect(page.getByRole('heading', { name: 'Évolution', exact: true })).toBeVisible()

    // La fenêtre est fixe : une tranche sans mouvement vaut zéro, elle n'est pas omise.
    await expect(page.locator('[data-testid^="evo-row-"]')).toHaveCount(12)
    await expect(page.getByTestId('evo-row-2026-08')).toBeVisible()
    await expect(page.getByTestId('evo-row-2025-09')).toBeVisible()
  })

  /**
   * Le tableau n'est pas un doublon du graphique : les SVG sont en `aria-hidden`, et c'est
   * lui qui porte les valeurs pour le clavier et le lecteur d'écran.
   */
  test('porte les valeurs dans un tableau accessible, pas seulement dans le graphique', async ({ page }) => {
    await page.goto('/evolution?p=2026-08&g=month')
    const table = page.getByRole('table').first()
    await expect(table).toBeVisible()
    for (const header of ['Période', 'Recettes', 'Dépenses', 'Résultat', 'Trésorerie cumulée']) {
      await expect(table.getByRole('columnheader', { name: header })).toBeVisible()
    }
  })

  test('navigue entre les tranches et reflète la sélection dans l\'URL', async ({ page }) => {
    await page.goto('/evolution?p=2026-08&g=month')
    await page.getByRole('button', { name: 'Tranche précédente' }).click()
    await expect(page.getByTestId('evo-row-2026-07')).toBeVisible()
    await expect(page).toHaveURL(/p=2026-07/)
  })

  test('change de pas sans quitter la date', async ({ page }) => {
    await page.goto('/evolution?p=2026-08&g=month')
    await page.getByLabel('Pas').selectOption('quarter')
    await expect(page).toHaveURL(/g=quarter/)
    await expect(page.getByTestId('evo-row-2026-T3')).toBeVisible()
  })

  /** FR31 — suivre UNE rubrique ou UN poste, ce qu'une courbe de résultat global ne dit pas. */
  test('suit une rubrique choisie et le dit dans l\'URL', async ({ page }) => {
    await page.goto('/evolution?p=2026-08&g=month')
    await expect(page.getByText('Choisis une rubrique ou un poste')).toBeVisible()

    await page.getByLabel('Cible').selectOption('group:alimentation')
    // Le deux-points n'est pas encodé par le routeur : on cible la valeur telle qu'elle sort.
    await expect(page).toHaveURL(/t=group[:%]/)
    await expect(page.getByText('Choisis une rubrique ou un poste')).toHaveCount(0)
  })
})

test.describe('Analyse — portée', () => {
  /**
   * La page mélangeait la période choisie et une fenêtre de douze tranches sous un sélecteur
   * unique : on choisissait « juillet 2026 » et deux blocs sur trois répondaient autre chose
   * (recette du 2026-09-05).
   */
  test('ne décrit que la période sélectionnée, et le dit', async ({ page }) => {
    await page.goto('/analyse?p=2026-03&g=month')
    // Le nom de la période est écrit deux fois — dans le sélecteur et dans cette phrase — donc
    // on cible la phrase, pas le libellé seul.
    await expect(page.getByText('Tout ce qui suit décrit')).toBeVisible()
    await expect(page.getByRole('paragraph').filter({ hasText: 'Tout ce qui suit décrit' }))
      .toContainText('mars 2026')
    await expect(page.getByRole('heading', { name: 'Évolution' })).toHaveCount(0)
    await expect(page.getByText('Trésorerie cumulée')).toHaveCount(0)
  })

  test('renvoie vers l\'évolution en conservant la période', async ({ page }) => {
    await page.goto('/analyse?p=2026-03&g=month')
    await page.getByRole('link', { name: /Voir l'évolution/ }).click()
    await expect(page).toHaveURL(/\/evolution\?p=2026-03/)
  })
})
