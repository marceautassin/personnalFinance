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
  /**
   * Auto-suffisance vis-à-vis des autres specs E2E (revue de la story 27.3, BLOQUANT 1) : la
   * base de test est partagée par TOUTE la suite (`playwright.config.ts`), et un profil créé
   * par `tests/e2e/profiles.spec.ts` (« Test B ») peut survivre à son propre run. Sans cookie
   * explicite, ces tests dépendaient implicitement du repli « exactement un profil » sans
   * cookie (D38) — qui disparaît dès qu'un second profil existe, et fait alors répondre
   * `400 profile_required` à `/api/categories`, laissant le `<select>` « Ranger dans » vide.
   * On épingle donc le profil `marceau` (id 1) explicitement, et on vérifie la résolution
   * AVANT de continuer : un échec ici se lirait sinon comme un défaut du formulaire, pas du
   * profil.
   */
  test.beforeEach(async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string
    await page.context().addCookies([{ name: 'pf_profile', value: '1', url: baseURL }])

    const response = await page.request.get(`${baseURL}/api/categories`)
    expect(response.status()).toBe(200)
  })

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
