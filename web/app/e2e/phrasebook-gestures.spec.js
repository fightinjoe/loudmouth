import { test, expect } from '@playwright/test'

const titles = ['Hello', 'Ordering dinner', 'Asking for directions around town']

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  await page.evaluate(async (titles) => {
    const { db, ui } = window.__loudmouth
    const deck = await db.createDeck('Gesture check', 'es')
    await db.importCards(titles.flatMap(context => Array.from({ length: 12 }, (_, i) => ({
      lang: 'es', text: `Hola ${i}`, translation: `Hello ${i}`, context,
    }))), deck.id)
    ui.transition('content/select-deck', { id: deck.id })
    if (ui.get('shell').exposed === 'background') ui.transition('shell/toggle')
  }, titles)
  await expect(page.getByRole('tab', { name: 'Hello', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.waitForFunction(() => document.querySelector('#content-pane').getBoundingClientRect().left === 0)
})

async function swipe(page, from, to, { steps = 12, cancel = false } = {}) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: from[0] + (to[0] - from[0]) * i / steps,
      y: from[1] + (to[1] - from[1]) * i / steps,
    }] })
    if (steps > 1) await page.waitForTimeout(25)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await page.waitForTimeout(350)
}

async function expectPage(page, title, shell = 'foreground') {
  await expect(page.getByRole('tab', { name: title, exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => page.evaluate(() => window.__loudmouth.ui.get('shell').exposed)).toBe(shell)
}

test('tabs fit their titles and show a partial third conversation', async ({ page }) => {
  const geometry = await page.locator('.deck-tab').evaluateAll(tabs => tabs.map(tab => {
    const text = document.createRange()
    text.selectNodeContents(tab.querySelector('span'))
    const rect = tab.getBoundingClientRect()
    return { width: rect.width, textWidth: text.getBoundingClientRect().width, left: rect.left, right: rect.right }
  }))
  for (const tab of geometry) expect(tab.width - tab.textWidth).toBeCloseTo(32, 0)
  expect(geometry[0].width).toBeLessThan(geometry[1].width)
  expect(geometry[2].left).toBeLessThan(page.viewportSize().width)
  expect(geometry[2].right).toBeGreaterThan(page.viewportSize().width)
})

test('long drags and flicks navigate one page, then reveal navigation at the first page', async ({ page }) => {
  const right = page.viewportSize().width - 20
  await swipe(page, [right, 400], [70, 400])
  await expectPage(page, titles[1])
  await swipe(page, [20, 400], [right, 400])
  await expectPage(page, titles[0])
  await swipe(page, [right, 400], [right - 90, 400], { steps: 1 })
  await expectPage(page, titles[1])
  await swipe(page, [20, 400], [110, 400], { steps: 1 })
  await expectPage(page, titles[0])
  await swipe(page, [20, 400], [right, 400])
  await expectPage(page, titles[0], 'background')
})

test('a slow horizontal drag keeps ownership when the finger drifts vertically', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  const x = page.viewportSize().width - 40
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 300 }] })
  // Lock horizontally in small steps before crossing the browser's native
  // scrolling threshold with a vertical drift.
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: x - i * 2, y: 300 + Math.max(0, i - 5) * 8,
    }] })
    await page.waitForTimeout(30)
  }
  for (let i = 1; i <= 20; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: x - 20 - i * 4, y: 340,
    }] })
    await page.waitForTimeout(30)
  }
  // The page must still follow the finger before release, not snap back.
  await expect.poll(() => page.locator('.deck-pages').evaluate(el => el.scrollLeft)).toBe(100)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await expectPage(page, titles[1])
})

test('interior, short, cancelled and vertical drags do not change conversations', async ({ page }) => {
  const right = page.viewportSize().width - 20
  await swipe(page, [200, 400], [70, 400])
  await expectPage(page, titles[0])
  await swipe(page, [right, 400], [right - 30, 400])
  await expectPage(page, titles[0])
  await swipe(page, [right, 400], [70, 400], { cancel: true })
  await expectPage(page, titles[0])
  await swipe(page, [20, 400], [250, 400], { cancel: true })
  await expectPage(page, titles[0])
  await swipe(page, [20, 500], [20, 250])
  await expectPage(page, titles[0])
  await expect.poll(() => page.locator('[role="tabpanel"]').first().evaluate(panel => panel.scrollTop)).toBeGreaterThan(0)
})
