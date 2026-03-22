import '../styles/browse.css'
import { getCards, db, deleteDeck } from '../db.js'

function isVirtualDeck(deckId) {
  return /^all-/.test(deckId)
}

export function renderBrowse(el, params) {
  const deckId = params.deckId
  if (!deckId) { window.location.hash = 'home'; return }

  async function init() {
    const cards = await getCards(deckId)
    const isVirtual = isVirtualDeck(deckId)

    let deckName = deckId
    if (isVirtual) {
      const lang = deckId.replace('all-', '')
      const labels = { zh: 'Chinese', ja: 'Japanese' }
      deckName = `All ${labels[lang] || lang.toUpperCase()} Cards`
    } else {
      const deck = await db.decks.get(deckId)
      deckName = deck ? deck.name : 'Deck'
    }

    el.innerHTML = `
      <div class="screen">
        <div class="browse-header">
          <button class="browse-back" id="btn-back">←</button>
          <h1 class="browse-title">${deckName}</h1>
          ${isVirtual ? `<div class="browse-header-spacer"></div>` : `<button class="browse-delete-btn" id="btn-delete-deck" aria-label="Delete deck">🗑</button>`}
        </div>
        ${cards.length === 0 ? `
          <div class="empty-state">
            <p style="color: var(--text-secondary)">No cards in this deck.</p>
          </div>
        ` : `
          <div class="card-list">
            ${cards.map(card => `
              <div class="card-row" data-card-id="${card.id}">
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

    if (!isVirtual) {
      el.querySelector('#btn-delete-deck').addEventListener('click', async () => {
        if (!confirm('Delete this deck? Cards will not be deleted.')) return
        await deleteDeck(deckId)
        window.location.hash = 'home'
      })
    }

    el.querySelectorAll('.card-row').forEach(row => {
      row.addEventListener('click', () => {
        const cardId = row.dataset.cardId
        window.location.hash = `card?id=${cardId}&deckId=${deckId}`
      })
    })
  }

  init()
}
