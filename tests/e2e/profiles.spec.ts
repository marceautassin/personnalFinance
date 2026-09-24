import { test, expect } from '@playwright/test'

/**
 * E2E des profils (story 27.3, FR73, FR74, NFR35).
 *
 * Un seul scénario bout en bout : créer, basculer, vérifier le nom dans la barre à deux
 * largeurs, vérifier le référentiel propre, revenir sur `marceau`. Le cloisonnement des
 * données ENTRE profils (AC 6) est couvert côté unitaire (orchestrateur, story 27.2) ; ici on
 * vérifie l'expérience à l'écran.
 *
 * **Le profil « Test B » créé ici SURVIT au test.** Toutes les specs E2E partagent une seule
 * base SQLite pour tout le run (`playwright.config.ts`). Renommer ou supprimer un profil est
 * hors périmètre au PRD (Dev Notes de la story) : aucun endpoint applicatif ne permet de le
 * retirer. Une tentative de nettoyage via une CONNEXION SQLITE SÉPARÉE (`better-sqlite3` ouvert
 * directement sur le fichier de la base E2E, dans un `afterAll`) a été essayée puis retirée
 * (revue de la story 27.3, BLOQUANT 1) : cette connexion ne voyait pas les écritures du serveur
 * au moment du nettoyage (sondé : `profiles` n'y contenait déjà plus « Test B » avant même le
 * `DELETE`), donnait l'illusion d'un nettoyage qui n'avait jamais lieu. Plutôt que de
 * contourner la base par un chemin que le serveur ne emprunte pas, les specs qui DÉPENDENT
 * d'un profil précis épinglent désormais leur propre cookie `pf_profile` au lieu de compter
 * sur le repli implicite « exactement un profil » (voir `tests/e2e/rules.spec.ts`).
 */
test.describe('Profils', () => {
  test('créer un profil, l\'utiliser, revenir sur marceau', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/profils')
    await expect(page.getByRole('heading', { name: 'Profils' })).toBeVisible()

    await page.getByLabel('Nom').fill('Test B')
    await page.getByLabel('Banque par défaut').selectOption('boursorama')
    await page.getByRole('button', { name: 'Créer le profil' }).click()

    const row = page.getByRole('row', { name: /Test B/ })
    await expect(row).toBeVisible()

    // Bascule : recharge entièrement l'application (D38).
    await row.getByRole('button', { name: 'Utiliser le profil Test B' }).click()
    await page.waitForURL('**/analyse')

    // Nom visible dans la barre, à 1280 px comme sous 1200 px (AC 4).
    await expect(page.getByRole('link', { name: /Profil : Test B/ })).toBeVisible()
    await page.setViewportSize({ width: 1000, height: 900 })
    await expect(page.getByRole('link', { name: /Profil : Test B/ })).toBeVisible()

    // Référentiel propre (AC 6) : le nouveau profil voit le référentiel initial.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/categories')
    await expect(page.getByText('Alimentation')).toBeVisible()

    // Vocabulaire neutre (NFR35) : jamais de mot de connexion ou de sécurité.
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.toLowerCase()).not.toMatch(/connexion|connecté|se connecter/)

    // Retour sur marceau.
    await page.goto('/profils')
    await page.getByRole('button', { name: 'Utiliser le profil marceau' }).click()
    await page.waitForURL('**/analyse')
    await expect(page.getByRole('link', { name: /Profil : marceau/ })).toBeVisible()
  })
})
