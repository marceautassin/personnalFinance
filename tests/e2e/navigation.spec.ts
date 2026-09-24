import { test, expect } from '@playwright/test'

/**
 * E2E de la barre de navigation (story 20.1).
 *
 * Ces tests vivent en E2E et non en unitaire : le projet n'embarque ni `@vue/test-utils` ni
 * `happy-dom`, et les ajouter pour un menu reviendrait à toucher une stack verrouillée. Ce
 * qu'on vérifie ici — focus, `Escape`, flèches, exclusion mutuelle — est de toute façon du
 * comportement de navigateur, que seul un vrai navigateur exerce fidèlement.
 */
const TRIGGER_TX = 'Transactions'
const TRIGGER_DATA = 'Données'

const trigger = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name}`) })

test.describe('Navigation — deux menus', () => {
  /**
   * Auto-suffisance vis-à-vis des autres specs E2E (même raison que `rules.spec.ts`) : la base
   * E2E est partagée par toute la suite, et `import-bank.spec.ts` (qui s'exécute avant, dans
   * l'ordre alphabétique des fichiers) y crée désormais un second profil pour distinguer un
   * vrai préremplissage d'une coïncidence avec le repli `BANKS[0]`. Sans cookie explicite, ces
   * tests dépendaient implicitement du repli « exactement un profil » (D38), qui disparaît dès
   * qu'un second profil existe — le comportement testé ici n'a rien à voir avec les profils,
   * on épingle donc `marceau` (id 1) pour ne pas en dépendre.
   */
  test.beforeEach(async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string
    await page.context().addCookies([{ name: 'pf_profile', value: '1', url: baseURL }])
  })

  test('la barre porte quatre entrées, dont deux menus', async ({ page }) => {
    await page.goto('/analyse')
    const nav = page.getByRole('navigation', { name: 'Navigation principale' })

    await expect(nav.getByRole('link', { name: 'Analyse' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Évolution' })).toBeVisible()
    await expect(trigger(page, TRIGGER_TX)).toBeVisible()
    await expect(trigger(page, TRIGGER_DATA)).toBeVisible()

    // Les anciens onglets ne sont plus des liens de premier niveau.
    await expect(nav.getByRole('link', { name: 'Import' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'À ranger' })).toHaveCount(0)
  })

  test('ouvre, navigue, et referme derrière soi', async ({ page }) => {
    await page.goto('/analyse')
    await trigger(page, TRIGGER_TX).click()

    const menu = page.getByRole('menu', { name: TRIGGER_TX })
    await expect(menu).toBeVisible()
    await expect(trigger(page, TRIGGER_TX)).toHaveAttribute('aria-expanded', 'true')
    // L'ouverture pose le focus sur la première entrée : le clavier prend la suite sans détour.
    await expect(menu.getByRole('menuitem', { name: 'Toutes' })).toBeFocused()

    await menu.getByRole('menuitem', { name: 'À ranger' }).click()
    await expect(page).toHaveURL(/\/a-ranger$/)
    await expect(page.getByRole('menu', { name: TRIGGER_TX })).toHaveCount(0)
    // La page atteinte appartient au menu : son déclencheur reste allumé.
    await expect(trigger(page, TRIGGER_TX)).toHaveClass(/bar__link--on/)
  })

  test('`Escape` referme et rend le focus au déclencheur', async ({ page }) => {
    await page.goto('/analyse')
    await trigger(page, TRIGGER_DATA).click()
    await expect(page.getByRole('menu', { name: TRIGGER_DATA })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name: TRIGGER_DATA })).toHaveCount(0)
    await expect(trigger(page, TRIGGER_DATA)).toBeFocused()
  })

  test('les flèches parcourent la liste et bouclent', async ({ page }) => {
    await page.goto('/analyse')
    await trigger(page, TRIGGER_DATA).click()
    const menu = page.getByRole('menu', { name: TRIGGER_DATA })

    await expect(menu.getByRole('menuitem', { name: 'Import' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: 'Règles' })).toBeFocused()
    await page.keyboard.press('End')
    await expect(menu.getByRole('menuitem', { name: 'Catégories' })).toBeFocused()
    // Circulaire : buter en silence sur la dernière entrée laisse croire que la touche est morte.
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: 'Import' })).toBeFocused()
    // Et dans l'autre sens, depuis la première entrée.
    await page.keyboard.press('ArrowUp')
    await expect(menu.getByRole('menuitem', { name: 'Catégories' })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(menu.getByRole('menuitem', { name: 'Import' })).toBeFocused()
  })

  test('un clic extérieur referme sans naviguer', async ({ page }) => {
    await page.goto('/analyse')
    await trigger(page, TRIGGER_TX).click()
    await expect(page.getByRole('menu', { name: TRIGGER_TX })).toBeVisible()

    await page.getByRole('heading', { name: 'Analyse' }).click()
    await expect(page.getByRole('menu', { name: TRIGGER_TX })).toHaveCount(0)
    await expect(page).toHaveURL(/\/analyse/)
  })

  test('jamais deux menus ouverts à la fois', async ({ page }) => {
    await page.goto('/analyse')
    await trigger(page, TRIGGER_TX).click()
    await expect(page.getByRole('menu', { name: TRIGGER_TX })).toBeVisible()

    await trigger(page, TRIGGER_DATA).click()
    await expect(page.getByRole('menu', { name: TRIGGER_DATA })).toBeVisible()
    await expect(page.getByRole('menu', { name: TRIGGER_TX })).toHaveCount(0)
  })

  /*
   * Régressions trouvées à la revue du 2026-09-08 — aucune n'était visible à l'œil, et la
   * première passait même les assertions de classe.
   */
  test('l\'entrée du menu courant est visiblement allumée, pas seulement marquée', async ({ page }) => {
    await page.goto('/a-ranger')
    const t = trigger(page, TRIGGER_TX)
    // La classe seule ne prouve rien : elle était bien posée, mais définie dans un style scopé
    // qui n'atteignait pas le bouton. C'est la COULEUR calculée qui fait foi.
    const [couleurActive, couleurInactive] = await Promise.all([
      t.evaluate(el => getComputedStyle(el).color),
      trigger(page, TRIGGER_DATA).evaluate(el => getComputedStyle(el).color),
    ])
    expect(couleurActive).not.toBe(couleurInactive)
    await expect(t).toHaveAttribute('aria-current', 'true')
    // Et le déclencheur doit avoir la hauteur d'une entrée de barre, pas celle d'un bouton nu.
    const h = await t.evaluate(el => el.getBoundingClientRect().height)
    expect(h).toBeGreaterThan(30)
  })

  test('`↓` ouvre le menu depuis son déclencheur fermé', async ({ page }) => {
    await page.goto('/analyse')
    await trigger(page, TRIGGER_TX).focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menu', { name: TRIGGER_TX })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Toutes' })).toBeFocused()
  })

  test('`Tab` hors du menu le referme', async ({ page }) => {
    await page.goto('/analyse')
    await trigger(page, TRIGGER_TX).click()
    await expect(page.getByRole('menu', { name: TRIGGER_TX })).toBeVisible()

    // Depuis la dernière entrée, `Tab` sort du menu : il ne doit pas rester ouvert par-dessus
    // la page avec `aria-expanded="true"` sur un déclencheur que plus rien ne relie au focus.
    await page.keyboard.press('End')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('menu', { name: TRIGGER_TX })).toHaveCount(0)
    await expect(trigger(page, TRIGGER_TX)).toHaveAttribute('aria-expanded', 'false')
  })

  test('les flèches ne sont pas confisquées au reste de la page', async ({ page }) => {
    await page.goto('/analyse')
    await trigger(page, TRIGGER_TX).click()
    await page.keyboard.press('Escape')

    // Le focus sort de la barre : `Escape` l'avait rendu au déclencheur, où `↓` rouvre
    // légitimement le menu. C'est AILLEURS que la touche doit rester à la page.
    await page.getByRole('combobox', { name: 'Granularité' }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menu', { name: TRIGGER_TX })).toHaveCount(0)
  })

  test('aucun défilement horizontal, même en fenêtre étroite', async ({ page }) => {
    await page.goto('/analyse')
    for (const width of [1440, 1150, 900, 600]) {
      await page.setViewportSize({ width, height: 860 })
      const overflows = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(overflows, `débordement horizontal à ${width} px`).toBe(false)
    }
  })

  test('une URL profonde allume le menu qui la contient', async ({ page }) => {
    await page.goto('/regles')
    await expect(trigger(page, TRIGGER_DATA)).toHaveClass(/bar__link--on/)
    await expect(trigger(page, TRIGGER_TX)).not.toHaveClass(/bar__link--on/)
  })

  test('un préfixe profond sous Transactions allume son menu', async ({ page }) => {
    await page.goto('/transactions/2026-08')
    await expect(trigger(page, TRIGGER_TX)).toHaveClass(/bar__link--on/)
    await expect(trigger(page, TRIGGER_DATA)).not.toHaveClass(/bar__link--on/)
  })

  /*
   * La réconciliation est la SEULE logique dont la forme change : une branche dédiée
   * (`RECONCILIATION_PARENT`) devient un préfixe parmi ceux du menu « Données ». Rien ne
   * l'exerçait (revue du 2026-09-08).
   */
  test('la page de réconciliation allume Données, comme elle allumait Import', async ({ page }) => {
    await page.goto(`/reconciliation/${'a'.repeat(64)}`)
    await expect(trigger(page, TRIGGER_DATA)).toHaveClass(/bar__link--on/)
    await expect(trigger(page, TRIGGER_TX)).not.toHaveClass(/bar__link--on/)
  })

  test('sur une base vide, « Toutes » vise l\'année du calendrier', async ({ page }) => {
    await page.goto('/analyse')
    await trigger(page, TRIGGER_TX).click()
    const annee = new Date().getFullYear()
    await expect(page.getByRole('menuitem', { name: 'Toutes' }))
      .toHaveAttribute('href', `/transactions/${annee}`)
  })
})
