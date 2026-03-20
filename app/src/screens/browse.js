import '../styles/browse.css'
import { getCards, db } from '../db.js'

export function renderBrowse(el, params) {
  const deckId = params.deckId
  if (!deckId) { window.location.hash = 'home'; return }

  async function init() {
    const [cards, deck] = await Promise.all([
      getCards(deckId),
      db.decks.get(deckId),
    ])

    const deckName = deck ? deck.name : 'Deck'

    el.innerHTML = `
      <div class="screen">
        <div class="browse-header">
          <button class="browse-back" id="btn-back">←</button>
          <h1 class="browse-title">${deckName}</h1>
          <div class="browse-header-spacer"></div>
        </div>
        ${cards.length === 0 ? `
          <div class="empty-state">
            <p style="color: var(--text-secondary)">No cards in this deck.</p>
          </div>
        ` : `
          <div class="card-list">
            ${cards.map(card => `
              <div class="card-row">
                <div class="card-row-front">${card.front.text}</div>
                <div class="card-row-translation">${card.back.translation}</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `

    el.querySelector('#btn-back').addEventListener('click', () => {
      window.location.hash = 'home'
    })
  }

  init()
}
