import { test, expect } from '@playwright/test'

async function openStory(page, id) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`)
  await page.waitForFunction(id => {
    const render = window.__STORYBOOK_PREVIEW__?.currentRender
    return render?.id === id && ['finished', 'errored'].includes(render.phase)
  }, id)
  await expect(page.locator('.sb-errordisplay')).not.toBeVisible()
  expect(await page.evaluate(() => window.__STORYBOOK_PREVIEW__.currentRender.phase)).toBe('finished')
}

async function libraryRows(page, table) {
  return page.evaluate(async table => {
    const names = (await indexedDB.databases()).map(db => db.name).filter(name => name?.startsWith('catchphrase-storybook.'))
    if (names.length !== 1) throw new Error(`Expected one isolated preview database, found ${names.length}`)
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(names[0])
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(table).objectStore(table).getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally { db.close() }
  }, table)
}

const failures = new WeakMap()
test.beforeEach(async ({ page }) => {
  // LAN HTTP origins expose getRandomValues but not secure-context randomUUID.
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined })
  })
  const errors = []
  failures.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => {
    if (/gateway\.dev|openrouter\.ai|\/__storybook_api__\//.test(request.url())) errors.push(`Escaped controlled transport: ${request.url()}`)
  })
  page.on('response', response => {
    if (response.url().startsWith(new URL(page.url()).origin) && response.status() >= 400) errors.push(`Failed local asset: ${response.status()} ${response.url()}`)
  })
})
test.afterEach(async ({ page }) => {
  expect(failures.get(page), 'Unexpected browser/runtime errors').toEqual([])
})

test('first-time preparation commits selected topics once, only after confirmation', async ({ page }) => {
  await openStory(page, 'interactions-creation--first-time-atomic-save')
  expect((await libraryRows(page, 'decks'))).toHaveLength(1)
  expect((await libraryRows(page, 'groups')).sort((a, b) => a.position - b.position).map(group => group.title)).toEqual(['Ordering drinks', 'Paying the bill'])
  await expect(page.locator('.creation-panel')).toHaveCount(0)
  await expect(page.locator('.textbook-chapter[data-chapter-kind="topic"]')).toHaveCount(2)
  await expect(page.locator('.workbench-log li').filter({ hasText: /API \d+ \/phrasebook: success/ })).toHaveCount(1)
})

test('membership stars stay shared across occurrences but scoped to their book', async ({ page }) => {
  await openStory(page, 'interactions-textbook--membership-stars')
  await expect(page.locator('[data-action="content/review"], .card-star')).toHaveCount(0)
  const memberships = await libraryRows(page, 'memberships')
  expect(new Set(memberships.map(row => row.deckId)).size).toBeGreaterThan(1)
  expect(memberships.some(row => row.starredAt !== null)).toBe(true)
})

test('language collections open without attempting to timestamp a virtual deck', async ({ page }) => {
  await openStory(page, 'interactions-library--menu-language-browse-and-back')
  await expect(page.locator('[data-region="card-list"]')).toContainText('Chunks')
  await expect(page.locator('[data-action="content/review"], .card-star')).toHaveCount(0)
  expect((await libraryRows(page, 'decks')).every(deck => !deck.id.startsWith('lang:'))).toBe(true)
})

test('settings export retains evidence and deleting a book preserves canonical cards', async ({ page }) => {
  await openStory(page, 'interactions-panels--settings-and-json')
  expect(await libraryRows(page, 'decks')).toEqual([])
  expect(await libraryRows(page, 'memberships')).toEqual([])
  expect((await libraryRows(page, 'cards')).some(row => row.type === 'phrase')).toBe(true)
  await expect(page.locator('.deck-settings-panel, .json-panel')).toHaveCount(0)
})

test('details keyboard dismissal restores the original focused card', async ({ page }) => {
  await openStory(page, 'interactions-details--keyboard-focus-and-close-restoration')
  await expect(page.locator('#details-layer')).toHaveAttribute('data-details-state', 'closed')
  expect(await page.evaluate(() => document.activeElement?.closest('.card-row-wrapper') !== null)).toBe(true)
  await expect(page.locator('#app-shell')).not.toHaveAttribute('inert')
})

test('details target starring persists historical evidence through reopen', async ({ page }) => {
  await openStory(page, 'interactions-details--selection-primary-targets-and-durable-stars')
  const provenance = await libraryRows(page, 'provenance')
  expect(provenance.some(row => row.source?.span.end > row.source?.span.start && row.source.snapshot.text)).toBe(true)
  expect((await libraryRows(page, 'memberships')).some(row => row.starredAt !== null)).toBe(true)
})

test('Review close during peek leaves the replacement answer hidden', async ({ page }) => {
  await openStory(page, 'interactions-lifecycle--review-peek-replacement')
  await expect(page.locator('.review-panel')).toHaveCount(1)
  await expect(page.locator('.review-card-wrap')).toHaveAttribute('data-revealed', 'false')
  await page.mouse.up()
  await expect(page.locator('.review-card-wrap')).toHaveAttribute('data-revealed', 'false')
})

test('Review masks Chunks and retains finite navigation through direction changes', async ({ page }) => {
  await openStory(page, 'interactions-panels--review')
  await expect(page.locator('.review-card-wrap')).toHaveAttribute('data-revealed', 'false')
  await page.locator('[data-action="review/close"]').click()
  await expect(page.locator('.review-panel')).toHaveCount(0)
  await expect(page.locator('.textbook-chapter').first()).toBeVisible()
})

test('late clipboard completion cannot update replacement export and Back has a fallback', async ({ page }) => {
  await openStory(page, 'interactions-lifecycle--pending-clipboard-replacement')
  await expect(page.locator('.json-pane-textarea')).toHaveValue('{"replacement":true}')
  await expect(page.locator('#btn-copy-json')).toHaveText('Copy')
  await page.locator('.json-panel').evaluate(panel => { panel.style.transition = 'none' })
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.locator('.json-panel')).toHaveCount(0)
})

test('touch reorder saves Done, restores Cancel, and preserves section ownership', async ({ page }) => {
  await openStory(page, 'interactions-textbook--reorder-done-and-cancel')
  await expect(page.locator('#content-pane')).not.toHaveAttribute('data-edit-mode')
  const occurrences = await libraryRows(page, 'occurrences')
  expect(occurrences.filter(row => row.section === 'likelyExchanges').every(row => row.exchangeId && Number.isInteger(row.turnIndex))).toBe(true)
})

test('real pointer shelf dragging scrolls without speaking or opening details', async ({ page }) => {
  await openStory(page, 'interactions-textbook--textbook-navigation-and-shelves')
  const shelf = page.locator('.textbook-shelf[data-reorder-region="thingsToSay"]').first()
  await shelf.evaluate(element => { element.scrollLeft = 0 })
  await shelf.scrollIntoViewIfNeeded()
  const bounds = await shelf.boundingBox()
  const before = await page.locator('.workbench-log').textContent()
  await page.mouse.move(bounds.x + bounds.width - 30, bounds.y + 35)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 30, bounds.y + 35, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => shelf.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  await expect(page.locator('#details-layer')).toHaveAttribute('data-details-state', 'closed')
  const after = await page.locator('.workbench-log').textContent()
  expect((after.match(/Speech ja:/g) ?? []).length).toBe((before.match(/Speech ja:/g) ?? []).length)
})

test('switching stories resets only sandbox storage and cancels pending requests', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('loudmouth-topic-v4.storybook-sentinel', 'untouched')
    window.__sentinelReady = new Promise((resolve, reject) => {
      const request = indexedDB.open('loudmouth-topic-v4', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('sentinel')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction('sentinel', 'readwrite')
        transaction.objectStore('sentinel').put('untouched', 'marker')
        transaction.oncomplete = () => { db.close(); resolve() }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  })
  await openStory(page, 'components-creation--context-wait')
  await page.evaluate(() => {
    window.__STORYBOOK_ADDONS_CHANNEL__.emit('setCurrentStory', { storyId: 'compositions-library--empty-landing', viewMode: 'story' })
  })
  await page.waitForFunction(() => window.__STORYBOOK_PREVIEW__?.currentRender?.id === 'compositions-library--empty-landing' && window.__STORYBOOK_PREVIEW__.currentRender.phase === 'finished')
  await expect(page.locator('.creation-panel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New phrasebook', exact: true })).toBeVisible()
  expect(await libraryRows(page, 'decks')).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('loudmouth-topic-v4.storybook-sentinel'))).toBe('untouched')
  expect(await page.evaluate(async () => {
    await window.__sentinelReady
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('loudmouth-topic-v4')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const read = db.transaction('sentinel').objectStore('sentinel').get('marker')
        read.onsuccess = () => { db.close(); resolve(read.result) }
        read.onerror = () => reject(read.error)
      }
    })
  })).toBe('untouched')
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length))).toBe(0)
})
