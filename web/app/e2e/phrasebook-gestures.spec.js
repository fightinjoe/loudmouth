import { test, expect } from '@playwright/test'

const titles = ['Hello', 'Hello', 'Asking for directions around town']
const families = [['Greetings', 4], ['Farewells', 4], ['Numbers', 2]]
const CATEGORY_KEYS = ['words', 'phrases', 'exchanges', 'conversation']

const categoryCards = page => page.locator('[data-region="chapter-list"] > .chapter-card[data-chapter-kind="category"]')
const category = (page, key) => page.locator(`[data-region="chapter-list"] > .chapter-card[data-category="${key}"]`)
const deckCards = (page, key) => category(page, key).locator('.deck-card')
const sheet = page => page.locator('[data-region="chapter-sheet"]')
const sheetTitle = page => sheet(page).locator('[data-region="chapter-sheet-title"]')
const activePage = page => sheet(page).locator('.chapter-page:not([inert])')
const selectedTab = page => sheet(page).locator('.chapter-tab[aria-selected="true"]')
const pane = page => page.locator('#content-pane')
const isFocused = locator => locator.evaluate(el => el === document.activeElement)
const focusId = card => card.getAttribute('data-focus').then(focus => focus.split(':')[1])

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  await page.evaluate(async ({ titles, families }) => {
    const { db, ui } = window.__loudmouth
    const phrase = (text, translation) => ({ id: crypto.randomUUID(), card: { type: 'phrase', lang: 'es', text, translation } })
    const groups = titles.map((title, g) => ({
      id: crypto.randomUUID(),
      title,
      thingsToSay: Array.from({ length: 8 }, (_, index) => {
        const repeated = g === 0 && index < 2
        return repeated
          ? phrase('Hola de nuevo', index === 0 ? 'Hello again' : 'Hi again')
          : phrase(`Hola ${g}-${index}`, `Hello ${g}-${index}`)
      }),
      likelyExchanges: Array.from({ length: 4 }, (_, e) => ({
        id: crypto.randomUUID(),
        title: `Exchange ${g}-${e}`,
        lines: Array.from({ length: 4 }, (_, t) => ({
          speaker: t % 2 ? 'partner' : 'you',
          responses: Array.from({ length: t === 1 ? 2 : 1 }, (_, r) => phrase(`Frase ${g}-${e}-${t}-${r}`, `Line ${g}-${e}-${t}-${r}`)),
        })),
      })),
      words: families.map(([familyTitle, size], f) => ({
        id: crypto.randomUUID(),
        title: familyTitle,
        items: Array.from({ length: size }, (_, w) => ({
          card: { type: 'word', lang: 'es', text: `palabra ${g}-${f}-${w}`, translation: `word ${g}-${f}-${w}`, partOfSpeech: 'noun', senseKey: `sense-${g}-${f}-${w}` },
        })),
      })),
      exampleConversation: [
        { ...phrase(`Hola ${g}.`, 'Hello.'), speaker: 'you' },
        { ...phrase(`Buenos días ${g}.`, 'Good morning.'), speaker: 'partner' },
      ],
    }))
    const deck = await db.commitPhrasebook({ name: 'Gesture check', lang: 'es', groups, selectedIndexes: groups.map((_, index) => index) })
    document.body.dataset.gestureDeckId = deck.id
    ui.transition('content/select-deck', { id: deck.id })
    if (ui.get('shell').exposed === 'background') ui.transition('shell/toggle')
  }, { titles, families })
  await expect(categoryCards(page)).toHaveCount(4)
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

/** Offset of `target` inside the scrolling page, against where the page actually sits. */
async function scrollOffset(target) {
  return target.evaluate(el => {
    const page = el.closest('.chapter-page')
    return {
      top: el.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop,
      max: page.scrollHeight - page.clientHeight,
      scrollTop: page.scrollTop,
    }
  })
}

test('landing lists one card per category with counts and topic-aware deck cards', async ({ page }) => {
  expect(await categoryCards(page).evaluateAll(cards => cards.map(card => card.dataset.category))).toEqual(CATEGORY_KEYS)
  await expect(page.locator('[data-region="chapter-list"] > .chapter-card')).toHaveCount(4)
  await expect(page.locator('[data-region="starred-card"] .chapter-card')).toHaveCount(0)
  await expect(categoryCards(page).locator('.chapter-card-glyph')).toHaveText(['Aa', '“', '⇆', '…'])
  await expect(categoryCards(page).locator('.chapter-card-name')).toHaveText([
    'Words · 9 groups', 'Key phrases · 3 topics', 'Exchanges · 12 exchanges', 'Conversation · 3 topics',
  ])

  // Words and Exchanges cluster their cards per topic; duplicate topic titles stay separate clusters.
  const words = category(page, 'words').locator('.chapter-row > .deck-group')
  expect(await words.evaluateAll(groups => groups.map(group => group.getAttribute('aria-label')))).toEqual(titles)
  await expect(words.first().locator('.deck-card-label')).toHaveText(families.map(([title]) => title))
  await expect(words.first().locator('.deck-card-foot')).toHaveText(['4 words', '4 words', '2 words'])
  await expect(words.first().locator('.deck-card-english').first()).toHaveText('word 0-0-0')
  await expect(words.nth(1).locator('.deck-card-english').first()).toHaveText('word 1-0-0')

  const exchanges = category(page, 'exchanges').locator('.chapter-row > .deck-group')
  expect(await exchanges.evaluateAll(groups => groups.map(group => group.getAttribute('aria-label')))).toEqual(titles)
  await expect(exchanges.first().locator('.deck-card-label')).toHaveText(['Exchange 0-0', 'Exchange 0-1', 'Exchange 0-2', 'Exchange 0-3'])
  await expect(exchanges.first().locator('.deck-card-foot')).toHaveText(Array(4).fill('4 lines'))

  // Key phrases and Conversation have one card per topic, headed by the topic.
  await expect(category(page, 'phrases').locator('.deck-group')).toHaveAttribute('aria-label', 'Key phrases by topic')
  await expect(deckCards(page, 'phrases').locator('.deck-card-label')).toHaveText(titles)
  await expect(deckCards(page, 'phrases').locator('.deck-card-english')).toHaveText(['Hello again', 'Hello 1-0', 'Hello 2-0'])
  await expect(deckCards(page, 'phrases').locator('.deck-card-foot')).toHaveText(Array(3).fill('8 phrases'))
  const topicFocus = await deckCards(page, 'phrases').evaluateAll(cards => cards.map(card => card.dataset.focus))
  expect(new Set(topicFocus).size).toBe(3)
  topicFocus.forEach(focus => expect(focus).toMatch(/^topic:/))

  await expect(category(page, 'conversation').locator('.deck-group')).toHaveAttribute('aria-label', 'Conversations by topic')
  const conversations = deckCards(page, 'conversation')
  await expect(conversations).toHaveCount(3)
  await expect(conversations.locator('.deck-card-label')).toHaveText(titles)
  await expect(conversations.first().locator('.deck-card-line')).toHaveText(['Hola 0.', 'Buenos días 0.'])
  expect(await conversations.first().locator('.deck-card-line').evaluateAll(lines => lines.map(line => line.dataset.speaker))).toEqual(['you', 'partner'])
  await expect(conversations.locator('.deck-card-foot')).toHaveText(Array(3).fill('2 lines'))
})

test('native chapter-row swipes scroll deck cards without opening a chapter or revealing the library', async ({ page }) => {
  const row = category(page, 'words').locator('.chapter-row')
  const other = category(page, 'phrases').locator('.chapter-row')
  await row.scrollIntoViewIfNeeded()
  const bounds = await row.boundingBox()
  const y = bounds.y + bounds.height / 2
  await swipe(page, [bounds.x + bounds.width - 25, y], [bounds.x + 35, y])
  await expect.poll(() => row.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  await expect.poll(() => other.evaluate(el => el.scrollLeft)).toBe(0)
  await expect.poll(() => page.evaluate(() => window.__loudmouth.ui.get('shell').exposed)).toBe('foreground')
  await expect(pane(page)).not.toHaveAttribute('data-chapter-open')
  await expect(categoryCards(page)).toHaveCount(4)
})

test('focused chapter rows support keyboard browsing and independent positions', async ({ page }) => {
  const row = category(page, 'words').locator('.chapter-row')
  const other = category(page, 'exchanges').locator('.chapter-row')
  await row.focus()
  await row.press('ArrowRight')
  await expect.poll(() => row.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  await expect.poll(() => other.evaluate(el => el.scrollLeft)).toBe(0)
  await row.press('End')
  await expect.poll(() => row.evaluate(el => Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft))).toBeLessThan(2)
  await row.press('ArrowLeft')
  await expect.poll(() => row.evaluate(el => el.scrollWidth - el.clientWidth - el.scrollLeft)).toBeGreaterThan(2)
  await row.press('Home')
  await expect.poll(() => row.evaluate(el => el.scrollLeft)).toBe(0)
  await expect(pane(page)).not.toHaveAttribute('data-chapter-open')
})

test('a category header opens every topic at the top and Back returns focus', async ({ page }) => {
  const header = category(page, 'words').locator('.chapter-card-header')
  await header.click()
  await expect(pane(page)).toHaveAttribute('data-chapter-open', '')
  await expect(sheet(page)).toHaveAttribute('data-chapter-kind', 'category')
  await expect(page.locator('[data-region="textbook-reader"]')).toHaveJSProperty('inert', true)
  await expect(sheetTitle(page)).toHaveText('Words')
  await expect(sheet(page).locator('.chapter-tabs')).toHaveAttribute('data-tab-count', '1')
  await expect(sheet(page).locator('.chapter-tabs')).toBeHidden()
  await expect(activePage(page)).toHaveAttribute('data-tab', 'words')
  await expect(sheet(page).locator('.chapter-page')).toHaveCount(1)
  const sections = activePage(page).locator('.chapter-group')
  await expect(sections.locator('.chapter-group-title')).toHaveText(titles.flatMap(() => families.map(([title]) => title)))
  await expect(sections.locator('.chapter-group-context')).toHaveText(titles.flatMap(title => Array(families.length).fill(title)))
  await expect(sections.nth(3).locator('.card-term-english').first()).toHaveText('word 1-0-0')
  expect(await activePage(page).evaluate(el => el.scrollTop)).toBe(0)
  await expect.poll(() => isFocused(sheet(page).locator('.chapter-sheet-back'))).toBe(true)

  // A scrolled chapter reopens at the top from its header.
  await activePage(page).evaluate(el => { el.scrollTop = el.scrollHeight })
  expect(await activePage(page).evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  await sheet(page).getByRole('button', { name: 'Back to phrasebook', exact: true }).click()
  await expect(pane(page)).not.toHaveAttribute('data-chapter-open')
  await expect.poll(() => isFocused(header)).toBe(true)
  await header.click()
  await expect(sheetTitle(page)).toHaveText('Words')
  expect(await activePage(page).evaluate(el => el.scrollTop)).toBe(0)
  await page.keyboard.press('Escape')
  await expect(pane(page)).not.toHaveAttribute('data-chapter-open')

  await category(page, 'exchanges').locator('.chapter-card-header').click()
  await expect(sheetTitle(page)).toHaveText('Exchanges')
  await expect(activePage(page)).toHaveAttribute('data-tab', 'exchanges')
  await expect(activePage(page).locator('.chapter-exchange')).toHaveCount(12)
  await expect(activePage(page).locator('.chapter-flash')).toHaveCount(0)
  expect(await activePage(page).evaluate(el => el.scrollTop)).toBe(0)
})

test('a word-family card opens Words scrolled to that family without a flash', async ({ page }) => {
  const card = category(page, 'words').locator('.deck-group').first().locator('.deck-card').last()
  await expect(card.locator('.deck-card-label')).toHaveText('Numbers')
  const familyId = await focusId(card)
  await card.click()
  await expect(sheetTitle(page)).toHaveText('Words')
  const section = activePage(page).locator(`[data-family-id="${familyId}"]`)
  await expect(section.locator('.chapter-group-title')).toHaveText('Numbers')
  await expect(section.locator('.chapter-group-context')).toHaveText('Hello')
  await expect(section.locator('.card-term-english')).toHaveText(['word 0-2-0', 'word 0-2-1'])
  await expect(section.locator('.chapter-group-title')).toBeInViewport()
  const offset = await scrollOffset(section)
  expect(offset.scrollTop).toBeGreaterThan(0)
  expect(Math.abs(offset.scrollTop - Math.min(offset.top, offset.max))).toBeLessThan(2)
  await expect(section).not.toHaveClass(/chapter-flash/)
  await page.keyboard.press('Escape')
  await expect(pane(page)).not.toHaveAttribute('data-chapter-open')
  await expect.poll(() => isFocused(card)).toBe(true)
})

test('a Key phrases card opens on its own topic even when titles repeat', async ({ page }) => {
  const card = deckCards(page, 'phrases').nth(1)
  await expect(card.locator('.deck-card-label')).toHaveText('Hello')
  const topicId = await focusId(card)
  await card.click()
  await expect(sheetTitle(page)).toHaveText('Key phrases')
  await expect(activePage(page)).toHaveAttribute('data-tab', 'phrases')
  await expect(activePage(page).locator('.chapter-group-title')).toHaveText(titles)
  const section = activePage(page).locator(`[data-topic-id="${topicId}"]`)
  await expect(section.locator('.card-term-english').first()).toHaveText('Hello 1-0')
  await expect(section.locator('.chapter-group-title')).toBeInViewport()
  const offset = await scrollOffset(section)
  expect(offset.scrollTop).toBeGreaterThan(0)
  expect(Math.abs(offset.scrollTop - Math.min(offset.top, offset.max))).toBeLessThan(2)
  await expect(section).not.toHaveClass(/chapter-flash/)
})

test('an exchange card opens Exchanges on that exchange with explicit alternatives', async ({ page }) => {
  const card = category(page, 'exchanges').locator('.deck-group').first().locator('.deck-card').last()
  const exchangeId = await focusId(card)
  await card.click()
  await expect(sheetTitle(page)).toHaveText('Exchanges')
  const exchanges = activePage(page)
  await expect(exchanges).toHaveAttribute('data-tab', 'exchanges')
  const target = exchanges.locator(`.chapter-exchange[data-exchange-id="${exchangeId}"]`)
  await expect(target.locator('.chapter-group-title')).toHaveText('Exchange 0-3')
  await expect(target.locator('.chapter-group-context')).toHaveText('Hello')
  await expect(target).toHaveClass(/chapter-flash/)
  await expect(target.locator('.chapter-group-title')).toBeInViewport()
  await expect(exchanges.locator('.chapter-flash')).toHaveCount(1)
  expect(await exchanges.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  await expect(target.locator('.chapter-turn')).toHaveCount(4)
  const options = target.locator('.chapter-turn').nth(1)
  await expect(options).toHaveAttribute('data-speaker', 'partner')
  await expect(options.locator('.card-term-english')).toHaveText(['Line 0-3-1-0', 'Line 0-3-1-1'])
  await expect(options.locator('.card-option-separator')).toHaveCount(1)
  await expect(target.locator('.card-option-separator')).toHaveCount(1)

  // Conversation lines are a dialogue, not alternatives.
  await sheet(page).locator('.chapter-sheet-switch').click()
  await sheet(page).locator('.chapter-menu-item', { hasText: 'Conversation' }).click()
  await expect(sheetTitle(page)).toHaveText('Conversation')
  await expect(activePage(page).locator('.chapter-group').first().locator('.card-term-english')).toHaveText(['Hello.', 'Good morning.'])
  await expect(activePage(page).locator('.card-option-separator')).toHaveCount(0)
})

test('the chapter menu switches chapters and Escape closes the menu before the sheet', async ({ page }) => {
  const opener = deckCards(page, 'phrases').first()
  await opener.click()
  await expect(sheetTitle(page)).toHaveText('Key phrases')
  const switcher = sheet(page).locator('.chapter-sheet-switch')
  const items = sheet(page).locator('.chapter-menu-item')

  await switcher.click()
  await expect(sheet(page)).toHaveClass(/chapter-sheet--menu-open/)
  await expect(switcher).toHaveAttribute('aria-expanded', 'true')
  await expect(items.locator('.chapter-menu-name')).toHaveText(['Words', 'Key phrases', 'Exchanges', 'Conversation'])
  await expect(items.locator('.chapter-menu-marker')).toHaveText(['Aa', '“', '⇆', '…'])
  await expect(items.nth(1)).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => isFocused(items.nth(1))).toBe(true)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => isFocused(items.nth(2))).toBe(true)

  await page.keyboard.press('Escape')
  await expect(sheet(page)).not.toHaveClass(/chapter-sheet--menu-open/)
  await expect(switcher).toHaveAttribute('aria-expanded', 'false')
  await expect(pane(page)).toHaveAttribute('data-chapter-open', '')
  await expect(sheetTitle(page)).toHaveText('Key phrases')
  await expect.poll(() => isFocused(switcher)).toBe(true)

  await activePage(page).evaluate(el => { el.scrollTop = 400 })
  await switcher.click()
  await items.nth(0).click()
  await expect(sheet(page)).not.toHaveClass(/chapter-sheet--menu-open/)
  await expect(sheetTitle(page)).toHaveText('Words')
  await expect(activePage(page)).toHaveAttribute('data-tab', 'words')
  await expect(items.nth(0)).toHaveAttribute('aria-checked', 'true')
  await expect(items.nth(1)).toHaveAttribute('aria-checked', 'false')
  await expect(activePage(page).locator('.card-term-english').first()).toHaveText('word 0-0-0')
  expect(await activePage(page).evaluate(el => el.scrollTop)).toBe(0)
  await expect.poll(() => isFocused(switcher)).toBe(true)

  await switcher.click()
  await page.keyboard.press('Escape')
  await expect(pane(page)).toHaveAttribute('data-chapter-open', '')
  await page.keyboard.press('Escape')
  await expect(pane(page)).not.toHaveAttribute('data-chapter-open')
  await expect.poll(() => isFocused(opener)).toBe(true)
})

test('Starred tabs follow clicks and pager swipes, and In context opens the entry’s category', async ({ page }) => {
  const id = await page.evaluate(() => document.body.dataset.gestureDeckId)
  const phraseKey = await page.evaluate(async deckId => {
    const { db, ui } = window.__loudmouth
    const entries = await db.getCards(deckId)
    const word = entries.find(entry => entry.card.translation === 'word 0-0-0')
    const phrase = entries.find(entry => entry.card.translation === 'Hello 2-5')
    await db.toggleCardStar(deckId, { cardId: word.cardId })
    await db.toggleCardStar(deckId, { cardId: phrase.cardId })
    ui.transition('content/reload-deck')
    return phrase.key
  }, id)
  const starred = page.locator('[data-region="starred-card"] .chapter-card--starred')
  await expect(starred.locator('.deck-group[aria-label="Starred words"] .deck-card-label')).toHaveText('Greetings')
  await starred.locator('.deck-group[aria-label="Starred phrases"] .deck-card').click()
  await expect(sheetTitle(page)).toHaveText('Starred')
  await expect(selectedTab(page)).toHaveText('Phrases')
  const pager = sheet(page).locator('[data-region="chapter-pager"]')
  const pagerIndex = () => pager.evaluate(el => Math.round(el.scrollLeft / el.clientWidth))
  await expect.poll(pagerIndex).toBe(1)

  await sheet(page).getByRole('tab', { name: 'Words', exact: true }).click()
  await expect(selectedTab(page)).toHaveText('Words')
  await expect(activePage(page)).toHaveAttribute('data-tab', 'words')
  await expect(activePage(page).locator('.card-term-english')).toHaveText('word 0-0-0')
  await expect(sheet(page).locator('.chapter-page[inert]')).toHaveCount(1)
  // Swipe only once the smooth tab scroll has fully settled.
  await expect.poll(() => pager.evaluate(el => el.scrollLeft)).toBe(0)

  const bounds = await pager.boundingBox()
  const y = bounds.y + bounds.height / 2
  await swipe(page, [bounds.x + bounds.width - 30, y], [bounds.x + 30, y])
  await expect(selectedTab(page)).toHaveText('Phrases')
  await expect(activePage(page)).toHaveAttribute('data-tab', 'phrases')
  await expect.poll(pagerIndex).toBe(1)
  await expect.poll(() => page.evaluate(() => window.__loudmouth.ui.get('shell').exposed)).toBe('foreground')

  await activePage(page).getByRole('button', { name: 'In context ›' }).click()
  await expect(sheetTitle(page)).toHaveText('Key phrases')
  await expect(sheet(page)).toHaveAttribute('data-chapter-kind', 'category')
  const row = activePage(page).locator(`.card-row-wrapper[data-entry-key="${phraseKey}"]`)
  await expect(row.locator('.card-term-english')).toHaveText('Hello 2-5')
  await expect(row).toHaveClass(/chapter-flash/)
  await expect(row).toBeInViewport()
  expect(await activePage(page).evaluate(el => el.scrollTop)).toBeGreaterThan(0)
})

test('the title header collapses past 150px of reading and expands below 110px', async ({ page }) => {
  const body = page.locator('#content-pane [data-region="content-body"]')
  const reader = page.locator('[data-region="textbook-reader"]')
  const scrollTo = top => reader.evaluate((el, top) => { el.scrollTop = top }, top)
  expect(await reader.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(200)
  await scrollTo(140)
  await page.waitForTimeout(100)
  await expect(body).not.toHaveClass(/phrasebook--collapsed/)
  await scrollTo(200)
  await expect(body).toHaveClass(/phrasebook--collapsed/)
  await scrollTo(130)
  await page.waitForTimeout(100)
  await expect(body).toHaveClass(/phrasebook--collapsed/)
  await scrollTo(100)
  await expect(body).not.toHaveClass(/phrasebook--collapsed/)
})

test('reordering one topic’s key phrases keeps repeated occurrences distinct through Done and reload', async ({ page }) => {
  const opener = deckCards(page, 'phrases').first()
  const groupId = await focusId(opener)
  const otherGroupId = await focusId(deckCards(page, 'phrases').nth(1))
  await opener.click()
  await expect(sheetTitle(page)).toHaveText('Key phrases')
  const rows = activePage(page).locator(`[data-reorder-region="thingsToSay:${groupId}"] > .card-row-wrapper`)
  const otherRows = activePage(page).locator(`[data-reorder-region="thingsToSay:${otherGroupId}"] > .card-row-wrapper`)
  const keysOf = locator => locator.evaluateAll(elements => elements.map(row => row.dataset.entryKey))
  await expect(rows).toHaveCount(8)
  const otherKeys = await keysOf(otherRows)
  const repeated = await rows.evaluateAll(elements => elements.slice(0, 2).map(row => ({ cardId: row.dataset.cardId, entryKey: row.dataset.entryKey })))
  expect(repeated[0].cardId).toBe(repeated[1].cardId)
  expect(repeated[0].entryKey).not.toBe(repeated[1].entryKey)
  await expect(rows.nth(0).locator('.card-term-english')).toHaveText('Hello again')
  await expect(rows.nth(1).locator('.card-term-english')).toHaveText('Hi again')

  await sheet(page).getByRole('button', { name: 'Reorder cards', exact: true }).click()
  await expect(pane(page)).toHaveAttribute('data-edit-mode', '')
  const first = await rows.nth(0).boundingBox()
  const second = await rows.nth(1).boundingBox()
  const lane = await page.locator('#reorder-handle').boundingBox()
  expect(first.y + first.height / 2).toBeGreaterThan(lane.y)
  await swipe(page, [lane.x + lane.width / 2, first.y + first.height / 2], [lane.x + lane.width / 2, second.y + second.height])
  const keys = await keysOf(rows)
  expect(keys.indexOf(repeated[0].entryKey)).toBeGreaterThan(0)
  expect(keys).toHaveLength(8)
  expect(new Set(keys).size).toBe(8)
  expect(await keysOf(otherRows)).toEqual(otherKeys)

  await sheet(page).getByRole('button', { name: 'Done', exact: true }).click()
  await expect(pane(page)).not.toHaveAttribute('data-edit-mode')
  await expect(pane(page)).toHaveAttribute('data-chapter-open', '')
  await expect.poll(() => keysOf(rows)).toEqual(keys)
  const id = await page.evaluate(() => document.body.dataset.gestureDeckId)
  await expect.poll(() => page.evaluate(async ({ deckId, groupId }) => {
    const entries = await window.__loudmouth.db.getCards(deckId)
    return entries
      .filter(entry => entry.occurrence?.groupId === groupId && entry.occurrence.section === 'thingsToSay')
      .map(entry => entry.key)
  }, { deckId: id, groupId })).toEqual(keys)

  await page.reload()
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  await page.evaluate(id => {
    const { ui } = window.__loudmouth
    ui.transition('content/select-deck', { id })
    ui.transition('content/reload-deck')
    if (ui.get('shell').exposed === 'background') ui.transition('shell/toggle')
  }, id)
  await expect(categoryCards(page)).toHaveCount(4)
  await page.waitForFunction(() => document.querySelector('#content-pane').getBoundingClientRect().left === 0)
  await deckCards(page, 'phrases').first().click()
  await expect.poll(() => keysOf(rows)).toEqual(keys)
  await expect.poll(() => keysOf(otherRows)).toEqual(otherKeys)
})
