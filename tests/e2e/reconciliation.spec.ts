import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'

const FIXTURE_DIR = resolve('tests/fixtures/pdfs')

function findFirstFixture(): string | null {
  if (!existsSync(FIXTURE_DIR)) return null
  const pdf = readdirSync(FIXTURE_DIR).find(f => f.toLowerCase().endsWith('.pdf'))
  return pdf ? resolve(FIXTURE_DIR, pdf) : null
}

const FIXTURE = findFirstFixture()

/**
 * E2E réconciliation manuelle (Story 3.3).
 *
 * Pré-requis : PDF de fixture + ANTHROPIC_API_KEY (pipeline d'ingestion réel).
 * Les scénarios `add_transaction` et `accept_gap` (AC#6 + AC#7) exigent un statement
 * déséquilibré ; ils sont skippés en runtime si la fixture est équilibrée
 * (la majorité des relevés Boursorama réels le sont).
 */
test.describe('Réconciliation manuelle', () => {
  test.skip(!FIXTURE, 'Aucun PDF de fixture sous tests/fixtures/pdfs/')
  test.skip(!process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY non défini : E2E LLM-dépendant skippé')

  async function ingestFixture(page: import('@playwright/test').Page) {
    await page.goto('/import')
    await expect(page.getByRole('heading', { name: /Importer un relevé/i })).toBeVisible({ timeout: 10_000 })

    const ack = page.getByRole('button', { name: /J'ai compris/i })
    if (await ack.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ack.click()
      await expect(ack).toBeHidden()
    }

    await page.locator('input[type=file]').setInputFiles(FIXTURE!)
    await expect(page.getByText(/Relevé ingéré/i)).toBeVisible({ timeout: 35_000 })
  }

  async function getFirstStatementHash(page: import('@playwright/test').Page): Promise<string> {
    const link = page.locator('.statements__row').first().getByRole('link', { name: /Réconciliation/i })
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^\/reconciliation\/[a-f0-9]{64}$/)
    return href!.replace('/reconciliation/', '')
  }

  test('liste des relevés affiche le badge de fiabilité après ingestion', async ({ page }) => {
    await ingestFixture(page)

    // La section "Relevés ingérés" est visible avec au moins une ligne
    await expect(page.getByRole('heading', { name: /Relevés ingérés/i })).toBeVisible()
    const firstRow = page.locator('.statements__row').first()
    await expect(firstRow).toBeVisible()
    // Soit "Mois fiable" soit "Mois non fiable"
    await expect(firstRow.locator('[role="status"]')).toBeVisible()
  })

  test('navigation vers la page de réconciliation depuis la liste', async ({ page }) => {
    await ingestFixture(page)

    await page.locator('.statements__row').first().getByRole('link', { name: /Réconciliation/i }).click()
    await expect(page).toHaveURL(/\/reconciliation\/[a-f0-9]{64}/)
    await expect(page.getByRole('heading', { name: /Réconciliation du relevé/i })).toBeVisible()
  })

  test('AC#6 — add_transaction ferme le gap et garde le statement reliable', async ({ page }) => {
    await ingestFixture(page)
    const hash = await getFirstStatementHash(page)

    // Si la fixture est équilibrée, l'API rejette add_transaction avec une raison
    // qui ferait que le statement passe à unreliable. On vérifie d'abord l'état initial.
    const detail = await page.request.get(`/api/statements/${hash}`).then(r => r.json())
    test.skip(detail.reconciliation.isBalanced, 'Fixture équilibrée — AC#6 nécessite un gap résiduel')

    const periodStart = detail.periodStart as string
    const gapCents = detail.reconciliation.gapCents as number

    // POSTer une transaction manuelle qui ferme exactement le gap.
    // Convention : gap = (closing - opening) - sum(tx) → ajouter `gapCents` referme à 0.
    const res = await page.request.post(`/api/reconciliation/${hash}`, {
      data: {
        action: 'add_transaction',
        transaction: {
          transactionDate: periodStart,
          label: 'Transaction manquante (E2E)',
          amountCents: gapCents,
          categoryCode: 'divers',
        },
      },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.isBalanced).toBe(true)
    expect(body.reliability).toBe('reliable')

    // Propagation UI : la liste sur /import doit rester "Mois fiable"
    await page.goto('/import')
    const firstRow = page.locator('.statements__row').first()
    await expect(firstRow.locator('[role="status"]')).toContainText(/Mois fiable/i)
  })

  test('AC#7 — accept_gap propage "Mois non fiable" sur /import et /transactions', async ({ page }) => {
    await ingestFixture(page)
    const hash = await getFirstStatementHash(page)

    const detail = await page.request.get(`/api/statements/${hash}`).then(r => r.json())
    test.skip(detail.reconciliation.isBalanced, 'Fixture équilibrée — AC#7 nécessite un gap résiduel')

    const period = (detail.periodStart as string).slice(0, 7) // YYYY-MM

    // Driver via UI : page reconciliation → bouton "Accepter l'écart" → confirm dialog
    await page.goto(`/reconciliation/${hash}`)
    await page.getByRole('button', { name: /Accepter l'écart/i }).click()
    // Confirm dialog apparaît
    await expect(page.getByRole('heading', { name: /Accepter l'écart \?/i })).toBeVisible()
    await page.getByRole('button', { name: /Marquer non fiable/i }).click()

    // La page elle-même montre maintenant le badge unreliable
    await expect(page.getByText(/Mois non fiable/i)).toBeVisible({ timeout: 5_000 })

    // Propagation /import (cache statements-list invalidé via useReconciliation)
    await page.goto('/import')
    const firstRow = page.locator('.statements__row').first()
    await expect(firstRow.locator('[role="status"]')).toContainText(/Mois non fiable/i)

    // Propagation /transactions/{period} (alert role + badge)
    await page.goto(`/transactions/${period}`)
    const alert = page.locator('.tx-page__alert[role="alert"]')
    await expect(alert).toBeVisible()
    await expect(alert.locator('[role="status"]')).toContainText(/Mois non fiable/i)
  })
})
