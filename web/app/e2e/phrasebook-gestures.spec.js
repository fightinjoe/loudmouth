import { test, expect } from '@playwright/test'

const titles = ['Hello', 'Hello', 'Asking for directions around town']

const firstChapter = page => page.locator('.textbook-chapter[data-chapter-kind="topic"]').first()
const phraseShelf = page => firstChapter(page).locator('[data-reorder-region="thingsToSay"]')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  await page.evaluate(async titles => {
    const { db, ui } = window.__loudmouth
    const groups = titles.map((title, groupIndex) => ({
      id: crypto.randomUUID(),
      title,
      thingsToSay: Array.from({ length: 8 }, (_, index) => {
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
        }
      }),
      likelyExchanges: [{ id: crypto.randomUUID(), title: 'Greet someone', lines: [
        { speaker: 'you', responses: [{ id: crypto.randomUUID(), card: { type: 'phrase', lang: 'es', text: '¿Qué tal?', translation: 'How are you?' } }] },
        { speaker: 'partner', responses: [
          { id: crypto.randomUUID(), card: { type: 'phrase', lang: 'es', text: 'Bien.', translation: 'Well.' } },
          { id: crypto.randomUUID(), card: { type: 'phrase', lang: 'es', text: 'Muy bien.', translation: 'Very well.' } },
        ] },
      ] }],
      words: [{ id: crypto.randomUUID(), title: 'Greetings', items: [
        { card: { type: 'word', lang: 'es', text: 'hola', translation: 'hello', partOfSpeech: 'interjection', senseKey: 'greeting' } },
        { card: { type: 'word', lang: 'es', text: 'adiós', translation: 'goodbye', partOfSpeech: 'interjection', senseKey: 'farewell' } },
      ] }],
      exampleConversation: [
        { id: crypto.randomUUID(), speaker: 'you', card: { type: 'phrase', lang: 'es', text: 'Hola.', translation: 'Hello.' } },
        { id: crypto.randomUUID(), speaker: 'partner', card: { type: 'phrase', lang: 'es', text: 'Buenos días.', translation: 'Good morning.' } },
      ],
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
  const words = firstChapter(page).locator('[data-reorder-region^="family:"]')
  await shelf.focus()
  await shelf.press('ArrowRight')
  await expect.poll(() => shelf.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  await expect.poll(() => words.evaluate(el => el.scrollLeft)).toBe(0)
  await shelf.press('End')
  await expect.poll(() => shelf.evaluate(el => Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft))).toBeLessThan(2)
  await shelf.press('Home')
  await expect.poll(() => shelf.evaluate(el => el.scrollLeft)).toBe(0)
})

test('repeated phrase occurrences retain distinct identities through reorder and reload', async ({ page }) => {
  const rows = phraseShelf(page).locator('.card-row-wrapper')
  await expect(rows).toHaveCount(8)
  const repeated = await rows.evaluateAll(elements => elements.slice(0, 2).map(row => ({ cardId: row.dataset.cardId, entryKey: row.dataset.entryKey })))
  expect(repeated[0].cardId).toBe(repeated[1].cardId)
  expect(repeated[0].entryKey).not.toBe(repeated[1].entryKey)
  await expect(rows.nth(0).locator('.card-term-english')).toHaveText('Hello again')
  await expect(rows.nth(1).locator('.card-term-english')).toHaveText('Hi again')
  await page.getByRole('button', { name: 'Reorder cards', exact: true }).click()
  await expect(page.locator('#content-pane')).toHaveAttribute('data-edit-mode', '')
  await rows.nth(0).scrollIntoViewIfNeeded()
  const first = await rows.nth(0).boundingBox()
  const second = await rows.nth(1).boundingBox()
  const lane = await page.locator('#reorder-handle').boundingBox()
  await swipe(page, [lane.x + lane.width / 2, first.y + first.height / 2], [lane.x + lane.width / 2, second.y + second.height])
  const keys = await rows.evaluateAll(elements => elements.map(row => row.dataset.entryKey))
  expect(keys.indexOf(repeated[0].entryKey)).toBeGreaterThan(0)
  expect(keys).toHaveLength(8)
  expect(new Set(keys).size).toBe(8)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('#content-pane')).not.toHaveAttribute('data-edit-mode')
  const id = await page.evaluate(() => document.body.dataset.gestureDeckId)
  await expect.poll(() => page.evaluate(async deckId => {
    const { db } = window.__loudmouth
    const [group] = await db.getGroups(deckId)
    const entries = await db.getCards(deckId)
    return entries
      .filter(entry => entry.occurrence?.groupId === group.id && entry.occurrence.section === 'thingsToSay')
      .map(entry => entry.key)
  }, id)).toEqual(keys)
  await page.reload()
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  await page.evaluate(id => { window.__loudmouth.ui.transition('content/select-deck', { id }); window.__loudmouth.ui.transition('content/reload-deck') }, id)
  await expect.poll(() => rows.evaluateAll(elements => elements.map(row => row.dataset.entryKey))).toEqual(keys)
})

test('v4 chapters keep all four sections, titled families and explicit exchange options', async ({ page }) => {
  const chapter = firstChapter(page)
  await expect(chapter.locator('[data-topic-section] > .section-label')).toHaveText([
    'Things to say', 'Likely exchanges', 'Words', 'Example conversation',
  ])
  const exchanges = chapter.locator('[data-topic-section="likelyExchanges"]')
  await expect(exchanges.getByText('Greet someone', { exact: true })).toBeVisible()
  await expect(exchanges.locator('.card-term-english')).toHaveText(['How are you?', 'Well.', 'Very well.'])
  await expect(exchanges.locator('.card-option-separator')).toHaveCount(1)
  await expect(chapter.locator('[data-topic-section="words"]').getByText('Greetings', { exact: true })).toBeVisible()
  await expect(chapter.locator('[data-reorder-region^="family:"] .card-word-tile')).toHaveCount(2)
  await expect(chapter.locator('[data-reorder-region="exampleConversation"] .card-term-english')).toHaveText(['Hello.', 'Good morning.'])
  await expect(chapter.locator('[data-reorder-region="exampleConversation"] .card-option-separator')).toHaveCount(0)
})
