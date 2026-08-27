import { test, expect } from '@playwright/test'

/**
 * Runtime smoke test for the action-pane sub-kinds.
 *
 * Every action pane (settings, card-edit, json) is opened in a real browser
 * and must mount, render, and close without emitting a single console error
 * or uncaught exception. This is the guard for the class of bug where a pane
 * throws only at runtime — e.g. a temporal-dead-zone ReferenceError when an
 * onMount closure evaluates a not-yet-initialized binding. Unit tests and the
 * build do not exercise that path; this does.
 *
 * The test drives the app the way the app drives itself: it fires
 * `action/open` transitions through the exposed state machine and seeds a deck
 * through the real db module. If a pane crashes on open, the collected-errors
 * assertion fails with the actual console/page-error text.
 */

// Every kind the action pane can open, with the payload shape each expects.
// `needsDeck`/`needsCard` mark kinds that require seeded data in the payload.
const KINDS = [
  { kind: 'settings', needsDeck: true, needsCards: true, label: 'settings' },
  { kind: 'card-edit', needsCard: true, label: 'card-edit' },
  { kind: 'review', needsDeck: true, needsCards: true, label: 'review' },
  { kind: 'lookup', needsDeck: true, label: 'lookup (input mode)' },
  { kind: 'textbook', payload: { lang: 'ja', ability: 'beginner' }, label: 'textbook (topic entry)' },
  { kind: 'new-phrasebook', payload: {}, label: 'new-phrasebook' },
  {
    kind: 'new-phrasebook',
    payload: { suggestion: { id: 'seed-greetings-ja', emoji: '👋', title: 'Greetings', lang: 'ja', terms: [] } },
    label: 'new-phrasebook (confirm suggestion)',
  },
  {
    kind: 'json',
    payload: { title: 'Test', jsonString: '{"cards":[]}' },
    label: 'json',
  },
]

test.describe('action panes open without runtime errors', () => {
  for (const spec of KINDS) {
    test(spec.label, async ({ page }) => {
      const errors = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
        if (msg.type() === 'warning') errors.push(`console.warn: ${msg.text()}`)
      })
      page.on('pageerror', (err) => {
        errors.push(`pageerror: ${err.message}`)
      })

      await page.goto('/')
      await page.waitForFunction(() => !!window.__loudmouth?.ui)

      // Seed a deck + card when the kind needs one, then build the payload
      // inside the page so real deck/card objects (not serialized stand-ins)
      // reach the pane.
      const payload = await page.evaluate(async (spec) => {
        const { db } = window.__loudmouth
        let deck = null
        let cards = null
        if (spec.needsDeck || spec.needsCards || spec.needsCard) {
          deck = await db.createDeck('Smoke Deck', 'ja')
          await db.importCards(
            [{ lang: 'ja', text: 'こんにちは', translation: 'hello' }],
            deck.id,
          )
          cards = await db.getCards(deck.id)
        }
        const p = { ...(spec.payload || {}) }
        if (spec.needsDeck) p.deck = deck
        if (spec.kind === 'generate' && spec.needsDeck) {
          delete p.deck
          p.targetDeck = deck
        }
        if (spec.needsCards) p.cards = cards
        if (spec.needsCard) p.card = cards[0]
        return p
      }, spec)

      // Open the pane the way the app does, then let it mount/animate.
      await page.evaluate(
        ({ kind, payload }) => {
          window.__loudmouth.ui.transition('action/open', { kind, payload })
        },
        { kind: spec.kind, payload },
      )

      // A pane actually mounted into the action layer. Both bottom-sheet
      // kinds and full-screen kinds (card-edit, json) append here.
      const paneRoot = page.locator('#action-layer > *')
      await expect(paneRoot.first()).toBeVisible()

      // Close it the way a dismissal does, and confirm it tears down.
      await page.evaluate(() => {
        window.__loudmouth.ui.transition('action/close')
      })
      await expect(page.locator('#action-layer > *')).toHaveCount(0)

      expect(errors, `Runtime errors while opening "${spec.label}":\n${errors.join('\n')}`).toEqual([])
    })
  }
})

test('app boots without runtime errors', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

  await page.goto('/')
  await page.waitForFunction(() => !!window.__loudmouth?.ui)
  expect(errors, errors.join('\n')).toEqual([])
})
