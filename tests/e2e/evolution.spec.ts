import { test, expect } from '@playwright/test'

/**
 * E2E de la page d'évolution (FR31, FR34).
 *
 * Base E2E vide : ce sont donc le découpage, la navigation, le sélecteur de cible et la
 * séparation des portées qui sont vérifiés. Les calculs sont couverts par les tests unitaires
 * d'`analysis-engine` et de l'endpoint, qui n'ont besoin d'aucune base peuplée.
 *
 * **Refonte du 2026-09-07 :** le paramètre est la PÉRIODE regardée, plus la dernière tranche
 * d'une fenêtre glissante. `?p=2026` donne les douze mois de 2026.
 */
test.describe('Évolution', () => {
  test('découpe l\'année regardée en ses douze mois', async ({ page }) => {
    await page.goto('/evolution?p=2026')
    await expect(page.getByRole('heading', { name: 'Évolution', exact: true })).toBeVisible()

    // Un mois sans mouvement vaut zéro, il n'est pas omis : une série trouée se lirait comme
    // une accélération.
    await expect(page.locator('[data-testid^="evo-row-"]')).toHaveCount(12)
    await expect(page.getByTestId('evo-row-2026-01')).toBeVisible()
    await expect(page.getByTestId('evo-row-2026-12')).toBeVisible()
  })

  test('découpe un trimestre en ses trois mois', async ({ page }) => {
    await page.goto('/evolution?p=2026-T3')
    await expect(page.locator('[data-testid^="evo-row-"]')).toHaveCount(3)
    await expect(page.getByTestId('evo-row-2026-07')).toBeVisible()
  })

  /**
   * Le tableau n'est pas un doublon du graphique : les SVG sont en `aria-hidden`, et c'est
   * lui qui porte les valeurs pour le clavier et le lecteur d'écran.
   */
  test('porte les valeurs dans un tableau accessible, pas seulement dans le graphique', async ({ page }) => {
    await page.goto('/evolution?p=2026')
    const table = page.getByRole('table').first()
    await expect(table).toBeVisible()
    for (const header of ['Période', 'Recettes', 'Dépenses', 'Résultat', 'Patrimoine cumulé']) {
      await expect(table.getByRole('columnheader', { name: header })).toBeVisible()
    }
  })

  test('navigue entre les périodes et reflète la sélection dans l\'URL', async ({ page }) => {
    await page.goto('/evolution?p=2026')
    await page.getByRole('button', { name: 'Période précédente' }).click()
    await expect(page.getByTestId('evo-row-2025-01')).toBeVisible()
    await expect(page).toHaveURL(/p=2025/)
  })

  test('change de vue sans quitter la date', async ({ page }) => {
    await page.goto('/evolution?p=2026')
    await page.getByLabel('Vue').selectOption('quarter')
    await expect(page).toHaveURL(/p=2026-T1/)
    await expect(page.locator('[data-testid^="evo-row-"]')).toHaveCount(3)
  })

  test('couvre tout l\'historique quand on le demande', async ({ page }) => {
    await page.goto('/evolution?p=2026')
    await page.getByLabel('Vue').selectOption('all')
    await expect(page).toHaveURL(/p=all/)
  })

  /** FR31 — suivre UNE rubrique ou UN poste, ce qu'une courbe de résultat global ne dit pas. */
  test('suit une rubrique choisie et le dit dans l\'URL', async ({ page }) => {
    await page.goto('/evolution?p=2026')
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
    await expect(page.getByText('Patrimoine cumulé')).toHaveCount(0)
  })

  /**
   * L'évolution regarde une PÉRIODE découpée en mois : depuis un mois d'analyse, on ouvre son
   * ANNÉE — un mois y ferait un point unique (refonte du 2026-09-07).
   */
  test('renvoie vers l\'évolution sur l\'année de la période', async ({ page }) => {
    await page.goto('/analyse?p=2026-03&g=month')
    await page.getByRole('link', { name: /Voir l'évolution/ }).click()
    await expect(page).toHaveURL(/\/evolution\?p=2026/)
  })
})
