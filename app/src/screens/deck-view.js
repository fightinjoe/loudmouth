import { db, getCards, getCardsByLang, getDecks, getRecentDecks, updateDeckAccessTime, updateDeckMode, updateDeckName, updateDeckOrder, updateDeckReadingDisplay, deleteDeck, createDeck, importCards, exportAllData, restoreAllData, applyCardOrder } from '../js/db.js'
import { DEFAULT_MODE } from '../js/modes.js'
import { decode as base64urlDecode } from '../js/base64url.js'
import { parseCardBatch } from '../js/import-parser.js'
import { speak, ttsText } from '../js/tts.js'

import { renderCardRow } from '../components/card.js'
import { openDeckPicker } from '../components/deck-picker.js'
import { openAddCardsPanel } from '../components/add-cards-panel.js'
import { openDeckSettings } from '../components/deck-settings.js'
import { openCardReview } from '../components/card-review.js'

const LAST_DECK_KEY = 'loudmouth.lastDeckId'

export function getLastDeckId() {
  return localStorage.getItem(LAST_DECK_KEY)
}

export function setLastDeckId(deckId) {
  localStorage.setItem(LAST_DECK_KEY, deckId)
}

const dbOps = { db, getDecks, getRecentDecks, getCardsByLang, createDeck, importCards, exportAllData, restoreAllData }
const settingsOps = { updateDeckMode, updateDeckName, updateDeckOrder, updateDeckReadingDisplay, deleteDeck }

function stripHashParam(param) {
  const raw = window.location.hash.slice(1) || 'deck'
  const [route, qstring] = raw.split('?')
  const p = new URLSearchParams(qstring || '')
  p.delete(param)
  const remaining = p.toString()
  window.location.hash = remaining ? `${route}?${remaining}` : route
}

export function renderDeckView(el, params) {
  async function init() {
    if (params.cards) {
      const jsonStr = base64urlDecode(params.cards)
      if (jsonStr === null) {
        el.innerHTML = `
          <div class="screen" id="deck-view-screen">
            <div class="deck-view-empty">
              <p class="uri-import-error">
                Import link is invalid — could not decode the card data.
              </p>
            </div>
          </div>
        `;
        stripHashParam('cards')
        return
      }
      const result = parseCardBatch(jsonStr)
      if (result.cards.length === 0) {
        el.innerHTML = `
          <div class="screen" id="deck-view-screen">
            <div class="deck-view-empty">
              <p class="uri-import-error">
                Import link contained no valid cards.
              </p>
            </div>
          </div>
        `;
        stripHashParam('cards')
        return
      }
      let deckId = params.id || getLastDeckId()
      if (!deckId) {
        const recent = await getRecentDecks(1)
        deckId = recent[0]?.id ?? null
      }
      el.innerHTML = `
        <div class="screen" id="deck-view-screen">
          <div class="deck-view-empty">
            <p>Review your cards below before importing.</p>
          </div>
        </div>
      `;
      openAddCardsPanel(
        el,
        () => {},
        (importedDeckId) => {
          const dest = importedDeckId || deckId
          window.location.hash = dest ? `deck?id=${dest}` : 'deck'
        },
        dbOps,
        { initialCards: result.cards, initialErrors: result.errors, fromUri: true }
      )
      return
    }

    let deckId = params.id || getLastDeckId()
    if (!deckId) {
      const recent = await getRecentDecks(1)
      deckId = recent[0]?.id ?? null
    }

    if (!deckId) {
      el.innerHTML = `
        <div class="screen" id="deck-view-screen">
          <div class="deck-view-empty">
            <p>No decks yet. Import cards to get started.</p>
          </div>
        </div>
      `;
      return
    }

    let deck, cards
    if (deckId.startsWith('lang:')) {
      const lang = deckId.slice(5)
      cards = await getCardsByLang(lang)
      const langName = lang === 'zh' ? 'Chinese' : lang === 'ja' ? 'Japanese' : lang.toUpperCase()
      deck = { id: deckId, name: `All ${langName} Cards`, lang, mode: DEFAULT_MODE, order: 'default', system: true }
    } else {
      deck = await db.decks.get(deckId)
      if (!deck) {
        el.innerHTML = `
          <div class="screen" id="deck-view-screen">
            <div class="deck-view-empty"><p>Deck not found.</p></div>
          </div>
        `;
        return
      }
      cards = await getCards(deckId)
    }

    cards = applyCardOrder(cards, deck.order || 'default')

    const isLangView = deckId.startsWith('lang:')

    el.innerHTML = `
      <div class="screen" id="deck-view-screen">
        <div class="panel-header">
          <span class="panel-header-spacer"></span>
          <button class="panel-header-title" id="btn-deck-title">${deck.name}</button>
          ${isLangView ? '<span class="panel-header-spacer"></span>' : '<button class="panel-header-right" id="btn-deck-settings" aria-label="Settings">⚙</button>'}
        </div>
        <div class="deck-view-list" data-deck-mode="${deck.mode}">
          ${cards.length === 0
            ? `<div class="deck-view-empty"><p>No cards in this deck.</p></div>`
            : cards.map(card => renderCardRow(card, deck.readingDisplay)).join('')}
        </div>
      </div>
    `

    el.querySelector('.deck-view-list').addEventListener('click', e => {
      // Play the audio for the card when clicked
      const playBtn = e.target.closest('.card-row-play')
      if (playBtn) {
        e.stopPropagation()
        const card = cards.find(c => String(c.id) === playBtn.dataset.cardId)
        if (card) speak(ttsText(card), card.lang)
        return
      }

      // Otherwise, show the card full screen
      const row = e.target.closest('.card-row')
      if (!row) return
      const idx = cards.findIndex(c => String(c.id) === row.dataset.cardId)
      openCardReview(el, cards, deck, idx < 0 ? 0 : idx)
    })

    if (!isLangView) {
      el.querySelector('#btn-deck-settings').addEventListener('click', () => {
        openDeckSettings(el, deck, settingsOps, (changes) => {
          if (changes.deleted) {
            localStorage.removeItem(LAST_DECK_KEY)
            window.location.hash = 'deck'
            return
          }
          if (changes.name) {
            el.querySelector('#btn-deck-title').textContent = changes.name
            deck.name = changes.name
          }
          if (changes.mode) {
            deck.mode = changes.mode
            el.querySelector('.deck-view-list')?.setAttribute('data-deck-mode', changes.mode)
          }
          if (changes.order) {
            deck.order = changes.order
            cards = applyCardOrder(cards, changes.order)
            const list = el.querySelector('.deck-view-list')
            if (list) {
              list.innerHTML = cards.length === 0
                ? `<div class="deck-view-empty"><p>No cards in this deck.</p></div>`
                : cards.map(card => renderCardRow(card, deck.readingDisplay)).join('')
            }
          }
          if (changes.readingDisplay) {
            deck.readingDisplay = changes.readingDisplay
            const list = el.querySelector('.deck-view-list')
            if (list) {
              list.innerHTML = cards.length === 0
                ? `<div class="deck-view-empty"><p>No cards in this deck.</p></div>`
                : cards.map(card => renderCardRow(card, deck.readingDisplay)).join('')
            }
          }
        })
      })
    }

    el.querySelector('#btn-deck-title').addEventListener('click', () => {
      openDeckPicker(
        el,
        dbOps,
        async (selectedDeckId) => {
          setLastDeckId(selectedDeckId)
          if (!selectedDeckId.startsWith('lang:')) {
            await updateDeckAccessTime(selectedDeckId)
          }
          renderDeckView(el, { id: selectedDeckId })
        },
        (closePicker) => {
          openAddCardsPanel(el, closePicker, (importedDeckId) => {
            renderDeckView(el, { id: importedDeckId || deckId })
          }, dbOps)
        }
      )
    })
  }

  init()
}
