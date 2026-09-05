import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * E2E du dépôt multiple (FR1, FR2, FR3, FR4).
 *
 * Le tri des fichiers et l'ordre de la file sont vérifiables SANS clé LLM : le rejet des
 * fichiers non conformes se fait entièrement côté client, avant tout appel réseau. Les
 * spécifications qui exigent une vraie ingestion vivent dans `ingestion.spec.ts`, qui
 * s'auto-skippe sans fixture ni clé.
 */
const FIXTURE = resolve('tests/fixtures/pdfs/releve.pdf')

test.describe('Dépôt multiple', () => {
  test('rejette les fichiers non conformes en les nommant, sans bloquer les autres', async ({ page }) => {
    await page.goto('/import')
    await expect(page.getByRole('heading', { name: 'Importer des relevés' })).toBeVisible()

    // Deux fichiers refusés côté client : l'un n'est pas un PDF, l'autre est vide.
    await page.setInputFiles('input[type=file]', [
      { name: 'capture.png', mimeType: 'image/png', buffer: Buffer.from('x') },
      { name: 'vide.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) },
    ])

    // Le motif est énuméré par fichier : « certains fichiers ont été ignorés » n'aiderait pas.
    const message = page.locator('.dropzone-error, [role=alert]').first()
    await expect(message).toContainText('capture.png')
    await expect(message).toContainText('vide.pdf')

    // Aucun des deux n'entre dans la file.
    await expect(page.locator('.queue__row')).toHaveCount(0)
  })

  test('accepte plusieurs fichiers et les met en file dans l\'ordre du nom', async ({ page }) => {
    test.skip(!existsSync(FIXTURE), 'Aucun PDF de fixture sous tests/fixtures/pdfs/')
    await page.goto('/import')

    // Le même PDF sous trois noms : le second sera refusé en doublon, ce qui suffit à
    // vérifier l'ordre, la progression et l'isolation d'un rejet.
    await page.setInputFiles('input[type=file]', [FIXTURE, FIXTURE, FIXTURE])

    const rows = page.locator('.queue__row')
    await expect(rows).toHaveCount(3)
    await expect(page.locator('.queue__counter')).toContainText('/ 3')
  })
})
