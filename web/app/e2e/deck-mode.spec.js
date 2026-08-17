import { test, expect } from '@playwright/test'

/**
 * Deck mode (card template) rendering test.
 *
 * The three deck modes are driven entirely by CSS ancestor selectors keyed on
 * `#app[data-deck-mode="..."]` (see components.css). Unit tests and the build
 * cannot exercise the real stylesheet cascade, so this drives a real browser
 * and asserts the *computed visibility* of the card-row primary line in each
 * mode:
 *
 *   study    → source text visible,   translation hidden
 *   review   → source text visible,   translation hidden (primary line)
 *   reverse  → source text hidden,    translation visible  ← the fix
 *
 * The reverse-mode regression this guards: reverse rendered identically to
 * study (text first) instead of translation-first.
 */

test.describe('deck mode card template rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__loudmouth?.ui)
  })

  async function setup(page, mode) {
    await page.evaluate(async (mode) => {
      // __loudmouth.db is the whole db.js module namespace (app.js does
      // `import * as db`), so createDeck/importCards/updateDeckMode are members.
      const { ui, db } = window.__loudmouth
      const deck = await db.createDeck('Mode Deck', 'ja')
      await db.importCards(
        [{ lang: 'ja', text: 'ねこ', translation: 'cat' }],
        deck.id,
      )
      if (mode !== 'study') await db.updateDeckMode(deck.id, mode)
      // Drive selection the way nav does, then force the reload that picks up
      // the persisted mode.
      ui.transition('content/select-deck', { id: deck.id })
      ui.transition('content/reload-deck')
    }, mode)

    // Wait for the load subscriber to resolve and stamp the ancestor attr.
    await expect
      .poll(() => page.evaluate(() => document.getElementById('app').dataset.deckMode))
      .toBe(mode)
  }

  test('study mode shows source text, hides translation', async ({ page }) => {
    await setup(page, 'study')
    const text = page.locator('.deck-view-list .card-row .card-primary .card-text').first()
    const translation = page.locator('.deck-view-list .card-row .card-primary .card-translation').first()
    await expect(text).toBeVisible()
    await expect(translation).toBeHidden()
  })

  test('reverse mode shows translation first, hides source text', async ({ page }) => {
    await setup(page, 'reverse')
    const text = page.locator('.deck-view-list .card-row .card-primary .card-text').first()
    const translation = page.locator('.deck-view-list .card-row .card-primary .card-translation').first()
    // The fix: reverse must NOT look like study.
    await expect(text).toBeHidden()
    await expect(translation).toBeVisible()
    await expect(translation).toHaveText('cat')
  })
})
