import { test, expect } from '@playwright/test'

const titles = ['Hello', 'Ordering dinner', 'Asking for directions around town']

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  await page.evaluate(async (titles) => {
    const { db, ui } = window.__loudmouth
    const groups = titles.map((title, groupIndex) => ({
      id: crypto.randomUUID(),
      title,
      phrases: Array.from({ length: 12 }, (_, index) => {
        const repeated = groupIndex === 0 && index < 2
        return {
          id: crypto.randomUUID(),
          card: {
            type: 'phrase',
            lang: 'es',
            text: repeated ? 'Hola de nuevo' : `Hola ${groupIndex}-${index}`,
            translation: repeated
              ? (index === 0 ? 'Hello again' : 'Hi again')
              : `Hello ${groupIndex}-${index}`,
          },
          speaker: index % 2 === 0 ? 'you' : 'partner',
          ...(index === 1 ? { alternative: true } : {}),
        }
      }),
      vocab: groupIndex === 0
        ? [{
            card: {
              type: 'word',
              lang: 'es',
              text: 'hola',
              translation: 'hello',
              partOfSpeech: 'interjection',
              senseKey: 'greeting',
            },
          }]
        : [],
    }))
    const deck = await db.commitPhrasebook({
      name: 'Gesture check',
      lang: 'es',
      groups,
      selectedIndexes: groups.map((_, index) => index),
    })
    document.body.dataset.gestureDeckId = deck.id
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

test('repeated phrase occurrences keep distinct row keys through gesture reorder and reload', async ({ page }) => {
  const activeRows = page.locator('.deck-page:not([inert]) .card-row-wrapper')
  await expect(activeRows).toHaveCount(12)
  const repeated = await activeRows.evaluateAll(rows => rows.slice(0, 2).map(row => ({
    cardId: row.dataset.cardId,
    entryKey: row.dataset.entryKey,
  })))
  expect(repeated[0].cardId).toBe(repeated[1].cardId)
  expect(repeated[0].entryKey).toBeTruthy()
  expect(repeated[1].entryKey).toBeTruthy()
  expect(repeated[0].entryKey).not.toBe(repeated[1].entryKey)
  await expect(activeRows.nth(0).locator('.card-term-english')).toHaveText('Hello again')
  await expect(activeRows.nth(1).locator('.card-term-english')).toHaveText('Hi again')

  await page.evaluate(() => window.__loudmouth.ui.transition('content/enter-edit'))
  await expect(page.locator('#content-pane')).toHaveAttribute('data-edit-mode', '')
  const firstBox = await activeRows.nth(0).boundingBox()
  const fourthBox = await activeRows.nth(3).boundingBox()
  expect(firstBox).not.toBeNull()
  expect(fourthBox).not.toBeNull()
  const x = page.viewportSize().width - 10
  await swipe(
    page,
    [x, firstBox.y + firstBox.height / 2],
    [x, fourthBox.y + fourthBox.height],
  )

  const reorderedKeys = await activeRows.evaluateAll(rows => rows.map(row => row.dataset.entryKey))
  expect(reorderedKeys).toHaveLength(12)
  expect(reorderedKeys.indexOf(repeated[0].entryKey)).toBeGreaterThan(0)
  expect(new Set(reorderedKeys).size).toBe(12)

  const deckId = await page.evaluate(() => document.body.dataset.gestureDeckId)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect.poll(() => page.evaluate(async deckId => {
    const { db } = window.__loudmouth
    const [group] = await db.getGroups(deckId)
    const entries = await db.getCards(deckId)
    return entries
      .filter(entry => entry.occurrence?.groupId === group.id)
      .map(entry => entry.key)
  }, deckId)).toEqual(reorderedKeys)

  await page.reload()
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  await page.evaluate(deckId => {
    window.__loudmouth.ui.transition('content/select-deck', { id: deckId })
    window.__loudmouth.ui.transition('content/reload-deck')
  }, deckId)
  await expect(page.getByRole('tab', { name: 'Hello', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => page.locator('.deck-page:not([inert]) .card-row-wrapper').evaluateAll(
    rows => rows.map(row => row.dataset.entryKey),
  )).toEqual(reorderedKeys)
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
