import { test, expect, type Page } from '@playwright/test'

/**
 * E2E du référentiel à deux niveaux (epic 12).
 *
 * Aucune dépendance LLM ni PDF. Crée un poste, le renomme en inline, change sa nature, le
 * supprime ; vérifie qu'un poste et une rubrique système résistent à la suppression.
 *
 * Chaque assertion de focus ci-dessous correspond à un défaut réellement constaté à la recette
 * du 2026-09-04 — aucun n'avait été vu par les tests unitaires. Elles sont conservées telles
 * quelles au passage à deux niveaux : c'est la même mécanique d'édition inline, désormais
 * partagée par les rubriques et les postes (`useInlineRename`).
 */

const GROUP = 'divers'
const ITEM_LABEL = 'Essai E2E'
const ITEM_CODE = 'divers-essai-e2e'

/** Supprime les postes d'essai résiduels d'un run précédent. */
async function cleanupItem(page: Page) {
  const rows = page.locator(`[data-testid^="cat-row-${ITEM_CODE}"]`)
  for (let guard = 0; guard < 10; guard++) {
    const count = await rows.count()
    if (count === 0) return
    await rows.first().getByRole('button', { name: /Supprimer/ }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(rows).toHaveCount(count - 1)
  }
}

test.describe('Référentiel — rubriques, postes et natures', () => {
  test('créer, renommer, réorienter et supprimer un poste', async ({ page }) => {
    await page.goto('/categories')
    await expect(page.getByRole('heading', { name: 'Catégories' })).toBeVisible()
    await cleanupItem(page)

    const groupSection = page.getByTestId(`cat-group-${GROUP}`)

    // Création du poste sous la rubrique Divers.
    await groupSection.getByLabel('Libellé').fill(ITEM_LABEL)
    await groupSection.getByRole('button', { name: 'Ajouter le poste' }).click()
    const row = page.getByTestId(`cat-row-${ITEM_CODE}`)
    await expect(row).toBeVisible()

    // Renommage inline. On compte les PATCH : `@keyup.enter` et `@blur` étaient montés tous
    // deux sur le champ et en envoyaient DEUX pour une seule validation (revue 2026-08-04).
    // `fill()` ne dit rien du focus : on ouvre l'édition puis on tape au clavier, ce qui
    // exerce aussi le focus posé par `startEdit` (revue 2026-09-04).
    let patchCount = 0
    await page.route('**/api/categories/**', (route) => {
      if (route.request().method() === 'PATCH') patchCount++
      return route.continue()
    })

    await row.getByRole('button', { name: ITEM_LABEL, exact: true }).click()
    const editInput = page.getByLabel(`Renommer ${ITEM_LABEL}`)
    await expect(editInput).toBeFocused()
    await page.keyboard.type('Essai renommé')
    await page.keyboard.press('Enter')
    await expect(row.getByRole('button', { name: 'Essai renommé', exact: true })).toBeVisible()
    expect(patchCount).toBe(1)

    // Le focus revient sur le bouton-libellé APRÈS le refetch. Il retombait sur `<body>` :
    // pendant la sauvegarde, `savingCode` passait ce bouton en `disabled`, et désactiver un
    // élément focalisé lui retire le focus (recette du 2026-09-04, NFR19).
    await expect(row.getByRole('button', { name: 'Essai renommé', exact: true })).toBeFocused()

    // Escape abandonne le renommage et rend le focus au bouton-libellé.
    await row.getByRole('button', { name: 'Essai renommé', exact: true }).click()
    await page.keyboard.type('Abandonné')
    await page.keyboard.press('Escape')
    const labelButton = row.getByRole('button', { name: 'Essai renommé', exact: true })
    await expect(labelButton).toBeVisible()
    await expect(labelButton).toBeFocused()
    expect(patchCount).toBe(1)
    await page.unroute('**/api/categories/**')

    /**
     * Validation par SORTIE DE CHAMP : l'écran doit refléter la base.
     *
     * Ce chemin renvoyait le `PATCH` sans jamais déclencher le refetch — l'écran gardait
     * l'ancien libellé pendant que la base portait le nouveau, et l'utilisateur croyait son
     * renommage abandonné (recette du 2026-09-04). On compare l'affichage à ce que l'API
     * renvoie vraiment, pas à une valeur attendue en dur : c'est la DIVERGENCE qu'on traque.
     */
    await labelButton.click()
    await page.keyboard.type('Essai sortie')
    await page.getByRole('heading', { name: 'Catégories' }).click()
    await expect(row.getByRole('button', { name: 'Essai sortie', exact: true })).toBeVisible()

    const libelleServeur = await page.evaluate(async (code) => {
      const groups = await fetch('/api/categories').then(r => r.json())
      return groups
        .flatMap((g: { items: { code: string, label: string }[] }) => g.items)
        .find((i: { code: string }) => i.code === code)?.label
    }, ITEM_CODE)
    const libelleAffiche = await row.locator('.cat-list__label').textContent()
    expect(libelleAffiche?.trim()).toBe(libelleServeur)

    // La nature est modifiable depuis la liste : c'est ce qui corrige un poste entier mal
    // orienté sans reclasser ses transactions une à une.
    const natureSelect = row.getByLabel('Nature de Essai sortie')
    await expect(natureSelect).toHaveValue('expense')
    await natureSelect.selectOption('internal_transfer')
    await page.reload()
    await expect(
      page.getByTestId(`cat-row-${ITEM_CODE}`).getByLabel('Nature de Essai sortie'),
    ).toHaveValue('internal_transfer')

    // Suppression du poste d'essai (aucune transaction) via ConfirmDialog.
    await page.getByTestId(`cat-row-${ITEM_CODE}`).getByRole('button', { name: /Supprimer/ }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(page.getByTestId(`cat-row-${ITEM_CODE}`)).toHaveCount(0)
  })

  test('le poste de repli et la rubrique système résistent à la suppression', async ({ page }) => {
    await page.goto('/categories')

    /**
     * `aria-disabled` et non `disabled` : un bouton désactivé sort du parcours clavier, et
     * c'est lui qui porte la RAISON du blocage dans son nom accessible (NFR18-NFR20). Il doit
     * donc rester focalisable tout en refusant l'action.
     */
    const itemDelete = page
      .getByTestId('cat-row-divers-non-categorise')
      .getByRole('button', { name: /Supprimer/ })
    await expect(itemDelete).toHaveAttribute('aria-disabled', 'true')
    await expect(itemDelete).toHaveAccessibleName(/système/i)
    await itemDelete.focus()
    await expect(itemDelete).toBeFocused()
    // Activation AU CLAVIER, sur le bouton focalisé : c'est le chemin que `disabled` rendait
    // impossible et que `aria-disabled` préserve. Playwright refuse `click()` sur un élément
    // `aria-disabled` (« element is not enabled ») — `press('Enter')` n'applique pas ce
    // contrôle d'actionnabilité et exerce donc réellement le garde-fou côté composant.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Supprimer', exact: true })).toHaveCount(0)

    // Ciblage par nom accessible complet : la section contient aussi le bouton Supprimer de
    // chacun de ses postes, et un `/Supprimer/` large en attrapait quatre.
    const groupDelete = page
      .getByTestId('cat-group-internes')
      .getByRole('button', { name: 'Supprimer Mouvements internes' })
    await expect(groupDelete).toHaveAttribute('aria-disabled', 'true')
    await expect(groupDelete).toHaveAccessibleName(/système/i)
  })

  /**
   * Story 12-3 — le CRUD des RUBRIQUES. Ce parcours n'était couvert qu'au niveau handler,
   * alors qu'il est le seul à exercer `groupRename.editLabel.value` dans un `v-model` de
   * template : le compilateur ne déballe pas les refs imbriquées dans un objet, et la
   * construction casserait sans bruit si `useInlineRename` renvoyait un `reactive()`
   * (revue du 2026-09-05).
   */
  test('créer, renommer et supprimer une rubrique', async ({ page }) => {
    await page.goto('/categories')

    await page.getByRole('heading', { name: 'Catégories' }).click()
    const addGroupForm = page.locator('form').filter({ hasText: 'Ajouter une rubrique' })
    await addGroupForm.getByLabel('Libellé').fill('Rubrique E2E')
    await addGroupForm.getByRole('button', { name: 'Ajouter la rubrique' }).click()

    const section = page.getByTestId('cat-group-rubrique-e2e')
    await expect(section).toBeVisible()
    await expect(section).toContainText('0 poste(s)')

    // Renommage inline de la rubrique, au clavier — le champ doit être focalisé d'emblée.
    await section.getByRole('button', { name: 'Rubrique E2E', exact: true }).click()
    const editInput = page.getByLabel('Renommer Rubrique E2E')
    await expect(editInput).toBeFocused()
    await expect(editInput).toHaveValue('Rubrique E2E')
    await page.keyboard.type('Rubrique renommée')
    await page.keyboard.press('Enter')
    await expect(section.getByRole('button', { name: 'Rubrique renommée', exact: true })).toBeVisible()
    await expect(section.getByRole('button', { name: 'Rubrique renommée', exact: true })).toBeFocused()

    // Une rubrique peuplée refuse la suppression, avec le nombre de postes dans le nom accessible.
    await section.getByLabel('Libellé').fill('Poste bloquant')
    await section.getByRole('button', { name: 'Ajouter le poste' }).click()
    await expect(section).toContainText('1 poste(s)')
    const del = section.getByRole('button', { name: /^Supprimer Rubrique renommée/ })
    await expect(del).toHaveAttribute('aria-disabled', 'true')
    await expect(del).toHaveAccessibleName(/1 poste/)

    // Vidée, elle redevient supprimable.
    await section.getByRole('button', { name: 'Supprimer Poste bloquant' }).click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(section).toContainText('0 poste(s)')
    await expect(del).toHaveAttribute('aria-disabled', 'false')
    await del.click()
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(page.getByTestId('cat-group-rubrique-e2e')).toHaveCount(0)
  })

  test('un même libellé de poste existe sous deux rubriques (FR19)', async ({ page }) => {
    await page.goto('/categories')

    const restaurantRows = page.locator('[data-testid^="cat-row-"]', { hasText: 'Restaurant' })
    await expect(page.getByTestId('cat-row-alimentation-restaurant')).toBeVisible()
    await expect(page.getByTestId('cat-row-voyages-restaurant')).toBeVisible()
    expect(await restaurantRows.count()).toBeGreaterThanOrEqual(2)
  })
})
