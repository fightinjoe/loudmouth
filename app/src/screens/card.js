import '../styles/card.css'
import { db, removeCardFromDeck, deleteCard } from '../db.js'
import { speak, ttsAvailable, ttsText } from '../tts.js'

function isVirtualDeck(deckId) {
  return /^all-/.test(deckId)
}

export function renderCard(el, params) {
  const cardId = params.id
  const deckId = params.deckId
  if (!cardId || !deckId) { window.location.hash = 'home'; return }

  async function init() {
    const card = await db.cards.get(cardId)
    if (!card) { window.location.hash = `browse?deckId=${deckId}`; return }

    const isAll = isVirtualDeck(deckId)
    const actionLabel = isAll ? 'Delete card' : 'Remove from deck'
    const actionClass = isAll ? 'btn-danger' : 'btn-danger'

    const ex = card.example || {}

    el.innerHTML = `
      <div class="screen">
        <div class="card-detail-header">
          <button class="browse-back" id="btn-back">←</button>
          <h1 class="browse-title">Card Detail</h1>
          ${ttsAvailable ? `<button class="btn-play" id="btn-play" aria-label="Play audio">▶</button>` : '<div class="browse-header-spacer"></div>'}
        </div>

        <div class="card-detail-body">
          <div class="card-detail-section">
            ${card.type ? `<span class="card-type-badge">${card.type}</span>` : ''}
            <div class="card-detail-front">${card.text}</div>
            ${card.reading ? `<div class="card-detail-reading">${card.reading}</div>` : ''}
          </div>

          <div class="card-detail-divider"></div>

          <div class="card-detail-section">
            <div class="card-detail-translation">${card.translation}</div>
            ${card.notes ? `<div class="card-detail-notes">${card.notes}</div>` : ''}
          </div>

          ${(ex.text || ex.reading || ex.translation) ? `
            <div class="card-detail-divider"></div>
            <div class="card-detail-section">
              <div class="card-detail-label">Example</div>
              ${ex.text ? `<div class="card-detail-example-text">${ex.text}</div>` : ''}
              ${ex.reading ? `<div class="card-detail-reading">${ex.reading}</div>` : ''}
              ${ex.translation ? `<div class="card-detail-example-translation">${ex.translation}</div>` : ''}
            </div>
          ` : ''}
        </div>

        <div class="card-detail-actions">
          <button class="btn ${actionClass}" id="btn-action">${actionLabel}</button>
        </div>
      </div>
    `

    el.querySelector('#btn-back').addEventListener('click', () => {
      window.location.hash = `browse?deckId=${deckId}`
    })

    if (ttsAvailable) {
      const btnPlay = el.querySelector('#btn-play')
      btnPlay.addEventListener('click', () => {
        btnPlay.classList.add('playing')
        speak(ttsText(card), card.lang, {
          onEnd: () => btnPlay.classList.remove('playing'),
          onError: () => btnPlay.classList.remove('playing'),
        })
      })
    }

    el.querySelector('#btn-action').addEventListener('click', async () => {
      const msg = isAll
        ? 'Permanently delete this card?'
        : 'Remove this card from the deck?'
      if (!confirm(msg)) return

      if (isAll) {
        await deleteCard(cardId)
      } else {
        await removeCardFromDeck(cardId, deckId)
      }
      window.location.hash = `browse?deckId=${deckId}`
    })
  }

  init()
}
