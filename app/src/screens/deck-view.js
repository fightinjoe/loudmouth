import { db, getCards, getRecentDecks } from '../db.js'

const LAST_DECK_KEY = 'loudmouth.lastDeckId'

export function getLastDeckId() {
  return localStorage.getItem(LAST_DECK_KEY)
}

export function setLastDeckId(deckId) {
  localStorage.setItem(LAST_DECK_KEY, deckId)
}

export function renderDeckView(el, params) {
  async function init() {
    let deckId = params.id

    if (!deckId) {
      deckId = getLastDeckId()
    }

    if (!deckId) {
      const recent = await getRecentDecks(1)
      deckId = recent[0]?.id ?? null
    }

    if (!deckId) {
      el.innerHTML = `<div class="screen"><div class="empty-state"><p>No decks yet. Import cards to get started.</p></div></div>`
      return
    }

    const deck = await db.decks.get(deckId)
    if (!deck) {
      el.innerHTML = `<div class="screen"><div class="empty-state"><p>Deck not found.</p></div></div>`
      return
    }

    const cards = await getCards(deckId)

    el.innerHTML = `
      <div class="screen" id="deck-view-screen">
        <div class="deck-view-header">
          <button class="deck-title-btn" id="btn-deck-title">${deck.name}</button>
          <button class="deck-settings-btn" id="btn-deck-settings" aria-label="Settings">⚙</button>
        </div>
        <div class="deck-view-list">
          ${cards.length === 0 ? `
            <div class="empty-state"><p>No cards in this deck.</p></div>
          ` : cards.map(card => `
            <div class="card-row" data-card-id="${card.id}">
              <div class="card-row-body">
                <div class="card-row-text">${card.text || ''}</div>
                ${card.reading ? `<div class="card-row-reading">${card.reading}</div>` : ''}
              </div>
              <button class="card-row-play" data-card-id="${card.id}" aria-label="Play">▶</button>
            </div>
          `).join('')}
        </div>
      </div>
    `
  }

  init()
}
