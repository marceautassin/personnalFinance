import { test, expect } from '@playwright/test'

/**
 * E2E du choix de banque à l'ingestion (story 28.1, FR77, AR37).
 *
 * Ces scénarios n'ont besoin ni de MISTRAL_API_KEY ni d'un vrai PDF valide : la validation du
 * champ multipart `bank` et le préremplissage du sélecteur se jouent AVANT tout appel au
 * fournisseur (extraction/catégorisation). Un PDF syntaxiquement minimal (en-tête `%PDF-`)
 * suffit à passer la garde côté client et le contrôle des octets magiques côté serveur ; la
 * suite du pipeline peut échouer sans affecter ce qui est vérifié ici.
 *
 * Cookie `pf_profile=1` posé explicitement (comme `rules.spec.ts`) : la base E2E est partagée
 * par toute la suite, et `profiles.spec.ts` y laisse un second profil (« Test B ») qui fait
 * disparaître le repli « exactement un profil » (D38).
 */
const FAKE_PDF = Buffer.from('%PDF-1.4\nfake content, not a real statement\n%%EOF')

test.describe('Choix de la banque à l\'ingestion', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string
    await page.context().addCookies([{ name: 'pf_profile', value: '1', url: baseURL }])
  })

  test('le sélecteur est prérempli avec la banque par défaut du profil, et modifiable (AC 1)', async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string
    // Un profil à `credit_mutuel`, PAS `marceau` (à `boursorama`) : `boursorama` est AUSSI
    // `BANKS[0]`, la valeur de repli de `selectedBank` avant que `useCurrentProfile` ne
    // réponde — un test contre `marceau` ne distinguerait donc pas « préremplissage réel
    // depuis le profil » de « coïncidence avec le repli ».
    const created = await page.request.post(`${baseURL}/api/profiles`, {
      data: { name: `cm-prefill-${Date.now()}`, defaultBank: 'credit_mutuel' },
    })
    expect(created.status()).toBe(201)
    const profile = await created.json() as { id: number }
    await page.context().addCookies([{ name: 'pf_profile', value: String(profile.id), url: baseURL }])

    await page.goto('/import')
    await expect(page.getByRole('heading', { name: 'Importer des relevés' })).toBeVisible()

    const bankSelect = page.getByLabel('Banque')
    await expect(bankSelect).toHaveValue('credit_mutuel')

    await bankSelect.selectOption('boursorama')
    await expect(bankSelect).toHaveValue('boursorama')
  })

  test('chaque fichier déposé part avec la banque sélectionnée au moment du dépôt (AC 1, AC 2)', async ({ page }) => {
    // `route.request().postDataBuffer()` restitue bien le corps `multipart/form-data`
    // (vérifié en revue : l'hypothèse initiale d'un corps vide sous Chromium était fausse —
    // elle ne valait que pour `page.waitForRequest(...).postData()`, qui lit l'événement
    // réseau AVANT que le corps ne soit attaché).
    let capturedBody: string | null = null
    await page.route('**/api/statements', async (route) => {
      capturedBody = route.request().postDataBuffer()?.toString('utf-8') ?? null
      await route.continue()
    })

    await page.goto('/import')
    await page.getByLabel('Banque').selectOption('credit_mutuel')
    await page.setInputFiles('input[type=file]', {
      name: 'releve.pdf',
      mimeType: 'application/pdf',
      buffer: FAKE_PDF,
    })

    await expect.poll(() => capturedBody).not.toBeNull()
    expect(capturedBody).toContain('name="bank"')
    expect(capturedBody).toContain('credit_mutuel')
  })

  test('le choix de banque survit à la fin de file, il n\'est pas réécrasé par le rafraîchissement du profil (bug corrigé en revue)', async ({ page }) => {
    // `useIngestionQueue.drain()` appelle `invalidateAnalysis()` en fin de file, qui fait un
    // `refreshNuxtData()` SANS clé — donc recharge aussi `current-profile`. Un `watch` sur
    // l'OBJET `currentProfile` (plutôt que sur son id) se redéclenchait à chaque fin de file
    // et écrasait le choix fait par l'utilisateur pour son PROCHAIN dépôt.
    await page.goto('/import')
    await page.getByLabel('Banque').selectOption('credit_mutuel')

    // Dépose un premier fichier — peu importe son sort (échec probable, pas de vrai relevé) :
    // ce qui compte est que la file se termine, en déclenchant `invalidateAnalysis()`.
    await page.setInputFiles('input[type=file]', {
      name: 'releve.pdf',
      mimeType: 'application/pdf',
      buffer: FAKE_PDF,
    })
    await expect.poll(async () => page.getByLabel('Banque').isVisible()).toBe(true)

    // Le sélecteur doit toujours porter le choix de l'utilisateur, pas être retombé sur la
    // banque par défaut du profil (`boursorama`).
    await expect(page.getByLabel('Banque')).toHaveValue('credit_mutuel')
  })

  test('POST /api/statements refuse une banque hors de BANKS avec 422 validation_failed (AC 2)', async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string
    const response = await page.request.post(`${baseURL}/api/statements`, {
      multipart: {
        file: { name: 'releve.pdf', mimeType: 'application/pdf', buffer: FAKE_PDF },
        bank: 'hsbc',
      },
    })
    expect(response.status()).toBe(422)
    const json = await response.json()
    expect(json.statusMessage ?? json.data?.statusMessage).toBe('validation_failed')
  })

  test('POST /api/statements sans champ bank retombe sur le profil et échoue plus loin dans le pipeline, jamais en 422 (AC 2)', async ({ page }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string
    const response = await page.request.post(`${baseURL}/api/statements`, {
      multipart: {
        file: { name: 'releve.pdf', mimeType: 'application/pdf', buffer: FAKE_PDF },
      },
    })
    // `FAKE_PDF` a les octets magiques `%PDF-` mais n'est pas un vrai relevé Boursorama : la
    // validation du champ `bank` (AC 2) est passée, et l'échec vient de l'EXTRACTION — pas de
    // `profile_required` ni d'un 500 imprévu, que `.not.toBe(422)` seul aurait laissés passer.
    expect(response.status()).toBe(400)
    const json = await response.json()
    expect(json.statusMessage ?? json.data?.statusMessage).toBe('pdf_parse_failed')
  })
})
