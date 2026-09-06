import { test, expect } from '@playwright/test'

/**
 * E2E des règles de classement (FR40, à amender au PRD).
 *
 * Aucune dépendance LLM ni PDF : la page se suffit à elle-même. Le comportement d'ÉCRASEMENT
 * à l'ingestion est couvert par les tests unitaires de `rule-matcher`, qui n'ont pas besoin
 * d'un vrai relevé pour l'exercer.
 */
const PATTERN = 'MOTIF E2E'

test.describe('Règles de classement', () => {
  test('créer une règle, la voir listée, la supprimer', async ({ page }) => {
    await page.goto('/regles')
    await expect(page.getByRole('heading', { name: 'Règles de classement' })).toBeVisible()
    await expect(page.getByText('Aucune règle')).toBeVisible()

    await page.getByLabel('Si le libellé contient').fill(PATTERN)
    await page.getByLabel('Ranger dans').selectOption('alimentation-courses')
    await page.getByRole('button', { name: 'Ajouter la règle' }).click()

    // Le motif est stocké normalisé : c'est la forme que le moteur compare, et l'afficher
    // brut laisserait croire que la casse compte.
    const row = page.getByRole('row', { name: /motif e2e/i })
    await expect(row).toBeVisible()
    await expect(row).toContainText('motif e2e')
    await expect(row).toContainText('Alimentation · Courses')

    // Aucune transaction en base ne contient ce motif. La colonne « Historique » distingue ce
    // cas de « à jour » : une règle qui n'attrape rien n'est pas une règle en ordre (18.9).
    await expect(row).toContainText('aucune ligne couverte')

    await page.reload()
    await expect(page.getByRole('row', { name: /motif e2e/i })).toBeVisible()

    await page.getByRole('button', { name: `Supprimer la règle motif e2e` }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(page.getByText('Aucune règle')).toBeVisible()
  })

  test('refuse un motif déjà utilisé, quelle qu\'en soit la casse', async ({ page }) => {
    await page.goto('/regles')
    await page.getByLabel('Si le libellé contient').fill('Doublon')
    await page.getByLabel('Ranger dans').selectOption('alimentation-courses')
    await page.getByRole('button', { name: 'Ajouter la règle' }).click()
    await expect(page.getByRole('row', { name: /doublon/i })).toBeVisible()

    await page.getByLabel('Si le libellé contient').fill('DOUBLON')
    await page.getByLabel('Ranger dans').selectOption('alimentation-restaurant')
    await page.getByRole('button', { name: 'Ajouter la règle' }).click()
    await expect(page.getByRole('alert')).toContainText(/existe déjà/i)

    await page.getByRole('button', { name: 'Supprimer la règle doublon' }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  })

  test('refuse un motif trop court sans appeler le serveur', async ({ page }) => {
    await page.goto('/regles')
    await page.getByLabel('Si le libellé contient').fill('a')
    await page.getByLabel('Ranger dans').selectOption('alimentation-courses')
    await page.getByRole('button', { name: 'Ajouter la règle' }).click()
    await expect(page.getByRole('alert')).toContainText(/2 caractères/i)
  })
})
