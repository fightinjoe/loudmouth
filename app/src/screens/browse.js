import '../styles/browse.css'
import { getCards, db, deleteDeck, updateDeckMode } from '../db.js'
import { STUDY_MODES, MODE_LABELS } from '../study-modes.js'

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
    let currentMode = STUDY_MODES.TARGET_LANG
    if (isVirtual) {
      const lang = deckId.replace('all-', '')
      const labels = { zh: 'Chinese', ja: 'Japanese' }
      deckName = `All ${labels[lang] || lang.toUpperCase()} Cards`
      const sysDeck = await db.decks.get(deckId)
      if (sysDeck?.mode) currentMode = sysDeck.mode
    } else {
      const deck = await db.decks.get(deckId)
      deckName = deck ? deck.name : 'Deck'
      if (deck?.mode) currentMode = deck.mode
    }

    const modePickerHTML = `
      <div class="browse-mode-picker">
        <select id="mode-select">
          ${Object.entries(MODE_LABELS).map(([val, label]) =>
            `<option value="${val}"${val === currentMode ? ' selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>
    `

    el.innerHTML = `
      <div class="screen">
        <div class="browse-header">
          <button class="browse-back" id="btn-back">←</button>
          <h1 class="browse-title">${deckName}</h1>
          ${isVirtual ? `<div class="browse-header-spacer"></div>` : `<button class="browse-delete-btn" id="btn-delete-deck" aria-label="Delete deck">🗑</button>`}
        </div>
        ${modePickerHTML}
        ${cards.length === 0 ? `
          <div class="empty-state">
            <p style="color: var(--text-secondary)">No cards in this deck.</p>
          </div>
        ` : `
          <div class="card-list">
            ${cards.map(card => `
              <div class="card-row" data-card-id="${card.id}">
                <div class="card-row-front">${card.text}</div>
                <div class="card-row-translation">${card.translation}</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `

    el.querySelector('#btn-back').addEventListener('click', () => {
      window.location.hash = 'home'
    })

    el.querySelector('#mode-select').addEventListener('change', async (e) => {
      await updateDeckMode(deckId, e.target.value)
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
