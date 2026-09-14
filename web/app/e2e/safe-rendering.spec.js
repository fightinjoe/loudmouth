import { test, expect } from '@playwright/test'

// Exercise stored/API-shaped content through the real app, not just HTML helpers.
// The payload must remain visible text after persistence, reload, and review.
test('stored hostile text stays inert while ruby and card actions still work', async ({ page }) => {
  const payload = '<img src="/security-probe" onerror="window.__injectionExecuted=true">'
  const hostileId = 'probe" onmouseover="window.__injectionExecuted=true'
  const probeRequests = []
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/security-probe') probeRequests.push(request.url())
  })
  await page.goto('/')
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  const deckId = await page.evaluate(async ({ payload, hostileId }) => {
    const { db, ui } = window.__loudmouth
    const deck = await db.createDeck(payload, 'ja')
    await db.importCards([{
      id: hostileId,
      lang: 'ja',
      type: 'phrase',
      text: `猫${payload}`,
      translation: payload,
      reading: [['猫', 'ねこ'], [payload, null]],
      context: payload,
      notes: JSON.stringify({ speaker: 'you' }),
    }], deck.id)
    ui.transition('content/select-deck', { id: deck.id })
    ui.transition('shell/close')
    return deck.id
  }, { payload, hostileId })

  await expect(page.locator('.card-term-english')).toHaveText(payload)
  await expect(page.locator('.card-term-target rt')).toHaveText('ねこ')
  await expect(page.locator('.card-term-target')).toContainText(payload)
  await expect(page.locator('.card-row')).toHaveAttribute('data-card-id', hostileId)
  await expect(page.locator('img[src="/security-probe"], [onerror], [onmouseover]')).toHaveCount(0)

  // An escaped attribute must round-trip to the original ID for delegated actions.
  await page.locator('.card-star').click()
  await expect.poll(async () => page.evaluate(async deckId => {
    const cards = await window.__loudmouth.db.getCards(deckId)
    return !!cards[0].state?.starredAt
  }, deckId)).toBe(true)

  await page.reload()
  await expect(page.locator('.card-term-english')).toHaveText(payload)
  await page.evaluate(async deckId => {
    const { db, ui } = window.__loudmouth
    const cards = await db.getCards(deckId)
    // The review pane needs only the deck's ordering/language fields.
    ui.transition('action/open', {
      kind: 'review',
      payload: { deck: { id: deckId, lang: 'ja', order: 'default' }, cards },
    })
  }, deckId)
  await expect(page.locator('.review-panel-inner')).toContainText(payload)
  await page.locator('[data-action="review/toggle-reveal"]').click()
  await expect(page.locator('.review-panel-inner rt')).toHaveText('ねこ')
  await page.locator('[data-action="review/toggle-direction"]').click()
  await expect(page.locator('.review-panel-inner')).toContainText(payload)
  await expect(page.locator('img[src="/security-probe"], [onerror], [onmouseover]')).toHaveCount(0)
  expect(await page.evaluate(() => window.__injectionExecuted === true)).toBe(false)
  expect(probeRequests).toEqual([])
})
