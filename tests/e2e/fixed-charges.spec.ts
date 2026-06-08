import { test, expect } from '@playwright/test'

/**
 * E2E charges fixes (Story 5.1).
 *
 * Aucune dépendance LLM ni PDF de fixture : le CRUD charges est autonome.
 * Le test crée puis supprime sa charge → il s'auto-nettoie et ne pollue pas l'état persistant.
 */
test.describe('Charges fixes — CRUD UI', () => {
  const LABEL = 'Loyer E2E'

  test('ajoute une charge mensuelle, la liste, puis la supprime', async ({ page }) => {
    await page.goto('/charges')
    await expect(page.getByRole('heading', { name: /Charges fixes/i })).toBeVisible()

    // Ouvrir le formulaire (bouton d'ajout en header OU CTA état vide).
    await page.getByRole('button', { name: /Ajouter une charge|Déclarer ma première charge/i }).first().click()

    const form = page.locator('.charge-form')
    await expect(form).toBeVisible()

    await form.getByLabel('Libellé').fill(LABEL)
    await form.getByLabel('Montant (€)').fill('1200')
    await form.getByLabel('Catégorie').selectOption('logement')
    await form.getByLabel('Fréquence').selectOption('monthly')
    await form.getByLabel('Date de début').fill('2026-01-01')

    await form.getByRole('button', { name: 'Ajouter' }).click()

    // La charge apparaît dans la liste.
    const row = page.getByRole('row', { name: new RegExp(LABEL) })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row.getByText('Mensuelle')).toBeVisible()

    // Supprimer via le ConfirmDialog.
    await row.getByRole('button', { name: 'Supprimer' }).click()
    const dialog = page.locator('dialog.confirm')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Supprimer' }).click()

    // La charge disparaît.
    await expect(page.getByRole('row', { name: new RegExp(LABEL) })).toBeHidden()
  })
})
