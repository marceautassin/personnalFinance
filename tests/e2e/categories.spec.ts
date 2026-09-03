import { test, expect, type Page } from '@playwright/test'

/**
 * E2E gestion des catégories (Story 5.6).
 *
 * Aucune dépendance LLM ni PDF. Ajoute une catégorie, la renomme en inline, la supprime,
 * puis vérifie que la catégorie système `divers` ne peut pas être supprimée (bouton désactivé).
 * Idempotent : nettoie toute ligne `carburant*` résiduelle au démarrage et supprime la
 * catégorie de test en fin de parcours.
 */

/** Supprime toutes les lignes dont le code commence par `carburant` (résidus de runs précédents). */
async function cleanupCarburant(page: Page) {
  const rows = page.locator('[data-testid^="cat-row-carburant"]')
  // Boucle : supprimer une par une (le DOM se recompose après chaque suppression).
  for (let guard = 0; guard < 10; guard++) {
    const count = await rows.count()
    if (count === 0) return
    const del = rows.first().getByRole('button', { name: /Supprimer/ })
    if (!(await del.isEnabled())) return // référencée → on ne peut pas nettoyer, on abandonne
    await del.click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(rows).toHaveCount(count - 1)
  }
}

test.describe('Catégories — CRUD + protection système', () => {
  test('ajouter, renommer, supprimer ; divers non supprimable', async ({ page }) => {
    await page.goto('/categories')
    await expect(page.getByRole('heading', { name: 'Catégories' })).toBeVisible()
    await cleanupCarburant(page)

    // Ajout d'une catégorie variable « Carburant » → code garanti `carburant`.
    await page.getByLabel('Libellé').fill('Carburant')
    await page.getByLabel('Type').selectOption('true')
    await page.getByRole('button', { name: 'Ajouter' }).click()
    const row = page.getByTestId('cat-row-carburant')
    await expect(row).toBeVisible()

    // Renommage inline « Carburant » → « Essence ». On compte les PATCH : `@keyup.enter` et
    // `@blur` étaient montés tous deux sur l'input et en envoyaient DEUX pour une seule
    // validation (revue 2026-08-04). `fill()` ne dit rien du focus : on ouvre l'édition puis
    // on tape au clavier, ce qui exerce aussi le focus posé par `startEdit` (revue 2026-09-04).
    let patchCount = 0
    await page.route('**/api/categories/**', (route) => {
      if (route.request().method() === 'PATCH') patchCount++
      return route.continue()
    })

    await row.getByRole('button', { name: 'Carburant', exact: true }).click()
    const editInput = page.getByLabel('Renommer Carburant')
    await expect(editInput).toBeFocused()
    await page.keyboard.type('Essence')
    await expect(editInput).toHaveValue('Essence')
    await page.keyboard.press('Enter')
    await expect(row.getByRole('button', { name: 'Essence', exact: true })).toBeVisible()
    expect(patchCount).toBe(1)

    // Escape abandonne le renommage et rend le focus au bouton-libellé.
    await row.getByRole('button', { name: 'Essence', exact: true }).click()
    await page.keyboard.type('Abandonné')
    await page.keyboard.press('Escape')
    const labelButton = row.getByRole('button', { name: 'Essence', exact: true })
    await expect(labelButton).toBeVisible()
    await expect(labelButton).toBeFocused()
    expect(patchCount).toBe(1)

    // Partir sur « Supprimer » AU CLAVIER pendant une édition abandonne le renommage au lieu
    // de le persister : `@mousedown` ne couvrait que la souris (revue 2026-08-04).
    await labelButton.click()
    await page.keyboard.type('Jamais persisté')
    await page.keyboard.press('Tab')
    await expect(row.getByRole('button', { name: 'Supprimer Essence' })).toBeFocused()
    await expect(row.getByRole('button', { name: 'Essence', exact: true })).toBeVisible()
    expect(patchCount).toBe(1)
    await page.unroute('**/api/categories/**')

    // Persistance après reload.
    await page.reload()
    await expect(page.getByTestId('cat-row-carburant').getByRole('button', { name: 'Essence', exact: true })).toBeVisible()

    // La catégorie système `divers` ne peut pas être supprimée (bouton désactivé + tooltip).
    const diversDelete = page.getByTestId('cat-row-divers').getByRole('button', { name: /Supprimer/ })
    await expect(diversDelete).toBeDisabled()
    await expect(diversDelete).toHaveAttribute('title', /système/i)

    // Suppression de la catégorie de test (referenceCount 0) via ConfirmDialog.
    await page.getByTestId('cat-row-carburant').getByRole('button', { name: 'Supprimer Essence' }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(page.getByTestId('cat-row-carburant')).toBeHidden()
  })
})
