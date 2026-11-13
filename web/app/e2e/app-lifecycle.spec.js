import { test, expect } from '@playwright/test'

test('hash remount disposes old pane ownership before opening another action', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  await page.getByRole('button', { name: 'New phrasebook', exact: true }).click()
  await expect(page.locator('.creation-panel')).toHaveCount(1)
  await page.evaluate(() => {
    window.__previousUi = window.__loudmouth.ui
    window.location.hash = 'deck?remount=1'
  })
  await page.waitForFunction(() => window.__loudmouth?.ui !== window.__previousUi)
  await expect(page.locator('.creation-panel')).toHaveCount(0)
  await expect(page.locator('#nav-pane')).toHaveCount(1)
  await page.getByRole('button', { name: 'New phrasebook', exact: true }).click()
  await expect(page.locator('.creation-panel')).toHaveCount(1)
  // First run opens the language dropdown; Escape closes it before Back is reachable.
  await expect(page.locator('.creation-panel-inner[data-language-open="true"]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.locator('.creation-panel').getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.locator('.creation-panel')).toHaveCount(0)
  await expect(page.locator('.creation-scrim')).toHaveCount(0)
  expect(errors).toEqual([])
})
