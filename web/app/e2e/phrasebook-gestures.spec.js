import { test, expect } from '@playwright/test'

const titles = ['Hello', 'Hello', 'Asking for directions around town']

const firstChapter = page => page.locator('.textbook-chapter[data-chapter-kind="topic"]').first()
const phraseShelf = page => firstChapter(page).locator('[data-reorder-region="essentials"]')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  await page.evaluate(async titles => {
    const { db, ui } = window.__loudmouth
    const groups = titles.map((title, groupIndex) => ({
      id: crypto.randomUUID(),
      title,
      essentials: Array.from({ length: 8 }, (_, index) => ({
        id: crypto.randomUUID(),
        card: { type: 'phrase', lang: 'es', text: `Necesito ${groupIndex}-${index}`, translation: `I need ${groupIndex}-${index}` },
      })),
      dialogue: Array.from({ length: 10 }, (_, index) => ({
        id: crypto.randomUUID(),
        card: {
          type: 'phrase', lang: 'es',
          text: groupIndex === 0 && index < 2 ? 'Hola de nuevo' : `Hola ${groupIndex}-${index}`,
          translation: groupIndex === 0 && index < 2 ? (index === 0 ? 'Hello again' : 'Hi again') : `Hello ${groupIndex}-${index}`,
        },
        speaker: index % 2 === 0 ? 'you' : 'partner',
      })),
      vocab: Array.from({ length: 8 }, (_, index) => ({ card: {
        type: 'word', lang: 'es', text: `palabra ${groupIndex}-${index}`, translation: `word ${groupIndex}-${index}`,
        partOfSpeech: 'noun', senseKey: `word-${groupIndex}-${index}`,
      } })),
    }))
    const deck = await db.commitPhrasebook({ name: 'Gesture check', lang: 'es', groups, selectedIndexes: groups.map((_, index) => index) })
    document.body.dataset.gestureDeckId = deck.id
    ui.transition('content/select-deck', { id: deck.id })
    if (ui.get('shell').exposed === 'background') ui.transition('shell/toggle')
  }, titles)
  await expect(page.locator('.textbook-chapter[data-chapter-kind="topic"]')).toHaveCount(3)
  await page.waitForFunction(() => document.querySelector('#content-pane').getBoundingClientRect().left === 0)
})

async function swipe(page, from, to, { cancel = false } = {}) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] })
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from[0] + (to[0] - from[0]) * i / 12, y: from[1] + (to[1] - from[1]) * i / 12 }] })
    await page.waitForTimeout(25)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('all chapters remain readable and duplicate titles jump to distinct identities', async ({ page }) => {
  await expect(page.getByRole('tab')).toHaveCount(0)
  await page.getByText('In this phrasebook', { exact: true }).click()
  const links = page.locator('.textbook-chapter-links button').filter({ hasText: /^Hello$/ })
  await expect(links).toHaveCount(2)
  const targetKey = await links.nth(1).getAttribute('data-chapter-key')
  await links.nth(1).click()
  await expect.poll(() => page.evaluate(() => document.activeElement?.dataset.chapterKey)).toBe(targetKey)
  await expect(page.locator('.textbook-chapter[inert]')).toHaveCount(0)
})

test('native shelf swipes scroll cards without paging or revealing the library', async ({ page }) => {
  const shelf = phraseShelf(page)
  await shelf.scrollIntoViewIfNeeded()
  const bounds = await shelf.boundingBox()
  const y = bounds.y + Math.min(bounds.height / 2, 60)
  await swipe(page, [bounds.x + bounds.width - 25, y], [bounds.x + 35, y])
  await expect.poll(() => shelf.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => window.__loudmouth.ui.get('shell').exposed)).toBe('foreground')
  await expect(page.locator('.card-row-wrapper--swiped')).toHaveCount(0)
  await expect(page.locator('.textbook-chapter[data-chapter-kind="topic"]')).toHaveCount(3)
})

test('focused shelves support keyboard browsing and independent positions', async ({ page }) => {
  const shelf = phraseShelf(page)
  const vocab = firstChapter(page).locator('[data-reorder-region="vocab"]')
  await shelf.focus()
  await shelf.press('ArrowRight')
  await expect.poll(() => shelf.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  await expect.poll(() => vocab.evaluate(el => el.scrollLeft)).toBe(0)
  await shelf.press('End')
  await expect.poll(() => shelf.evaluate(el => Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft))).toBeLessThan(2)
  await shelf.press('Home')
  await expect.poll(() => shelf.evaluate(el => el.scrollLeft)).toBe(0)
})

test('repeated dialogue occurrences retain distinct identities through reorder and reload', async ({ page }) => {
  const rows = firstChapter(page).locator('[data-reorder-region="dialogue"] .card-row-wrapper')
  const repeated = await rows.evaluateAll(elements => elements.slice(0, 2).map(row => ({ cardId: row.dataset.cardId, entryKey: row.dataset.entryKey })))
  expect(repeated[0].cardId).toBe(repeated[1].cardId)
  expect(repeated[0].entryKey).not.toBe(repeated[1].entryKey)
  await page.getByRole('button', { name: 'Edit cards', exact: true }).click()
  await rows.nth(0).scrollIntoViewIfNeeded()
  const first = await rows.nth(0).boundingBox()
  const second = await rows.nth(1).boundingBox()
  const lane = await page.locator('#reorder-handle').boundingBox()
  await swipe(page, [lane.x + lane.width / 2, first.y + first.height / 2], [lane.x + lane.width / 2, second.y + second.height])
  const keys = await rows.evaluateAll(elements => elements.map(row => row.dataset.entryKey))
  expect(keys.indexOf(repeated[0].entryKey)).toBeGreaterThan(0)
  expect(new Set(keys).size).toBe(10)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('#content-pane')).not.toHaveAttribute('data-edit-mode')
  const id = await page.evaluate(() => document.body.dataset.gestureDeckId)
  await page.reload()
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  await page.evaluate(id => { window.__loudmouth.ui.transition('content/select-deck', { id }); window.__loudmouth.ui.transition('content/reload-deck') }, id)
  await expect.poll(() => rows.evaluateAll(elements => elements.map(row => row.dataset.entryKey))).toEqual(keys)
})
