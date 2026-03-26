import { db, getCards, getRecentDecks } from '../db.js'
import { speak } from '../tts.js'

function renderCardRow(card, mode) {
  let body
  if (mode === 'reverse') {
    body = `<div class="card-row-text">${card.translation || ''}</div>`
  } else if (mode === 'review') {
    const inline = [card.text, card.reading].filter(Boolean).join(' · ')
    body = `
      <div class="card-row-text">${inline}</div>
      ${card.translation ? `<div class="card-row-reading">${card.translation}</div>` : ''}
    `
  } else {
    // comprehension (default)
    body = `
      <div class="card-row-text">${card.text || ''}</div>
      ${card.reading ? `<div class="card-row-reading">${card.reading}</div>` : ''}
    `
  }
  return `
    <div class="card-row" data-card-id="${card.id}">
      <div class="card-row-body">${body}</div>
      <button class="card-row-play" data-card-id="${card.id}" aria-label="Play">▶</button>
    </div>
  `
}

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
      el.innerHTML = `<div class="screen" id="deck-view-screen"><div class="deck-view-empty"><p>No decks yet. Import cards to get started.</p></div></div>`
      return
    }

    const deck = await db.decks.get(deckId)
    if (!deck) {
      el.innerHTML = `<div class="screen" id="deck-view-screen"><div class="deck-view-empty"><p>Deck not found.</p></div></div>`
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
            <div class="deck-view-empty"><p>No cards in this deck.</p></div>
          ` : cards.map(card => renderCardRow(card, deck.mode)).join('')}
        </div>
      </div>
    `

    el.querySelector('.deck-view-list').addEventListener('click', e => {
      const playBtn = e.target.closest('.card-row-play')
      if (playBtn) {
        e.stopPropagation()
        const cardId = playBtn.dataset.cardId
        const card = cards.find(c => String(c.id) === cardId)
        if (card) speak(card.reading || card.text, deck.lang)
        return
      }
      const row = e.target.closest('.card-row')
      if (!row) return
      const cardId = row.dataset.cardId
      const idx = cards.findIndex(c => String(c.id) === cardId)
      openCardReview(el, cards, deck, idx < 0 ? 0 : idx)
    })
  }

  init()
}

function renderReviewCardContent(card, mode) {
  if (mode === 'reverse') {
    return `<div class="review-card-text">${card.translation || ''}</div>`
  }
  // comprehension and review
  return `
    <div class="review-card-text">${card.text || ''}</div>
    ${card.reading ? `<div class="review-card-reading">${card.reading}</div>` : ''}
  `
}

function renderTranslationArea(card, mode) {
  if (mode === 'reverse') return ''
  if (mode === 'review') {
    return `<div class="review-translation review-translation--visible">${card.translation || ''}</div>`
  }
  // comprehension: skeleton by default, reveal on press
  return `
    <div class="review-translation review-translation--skeleton" data-translation="${(card.translation || '').replace(/"/g, '&quot;')}">
      <div class="review-translation-skeleton-line"></div>
      <div class="review-translation-skeleton-line review-translation-skeleton-line--short"></div>
    </div>
  `
}

function openCardReview(appEl, cards, deck, startIndex) {
  let currentIndex = startIndex

  const panel = document.createElement('div')
  panel.className = 'card-review-panel'
  panel.innerHTML = `
    <div class="card-review-header">
      <button class="card-review-back" aria-label="Back">‹ Back</button>
      <span class="card-review-title">${deck.name}</span>
      <span class="card-review-header-spacer"></span>
    </div>
    <div class="card-review-body">
      <div class="card-review-content">
        <div class="review-card" id="review-card-el"></div>
        <div id="review-translation-el"></div>
      </div>
    </div>
  `
  appEl.appendChild(panel)

  const cardEl = panel.querySelector('#review-card-el')

  function renderCurrent() {
    const transContainer = panel.querySelector('#review-translation-el')
    cardEl.innerHTML = renderReviewCardContent(cards[currentIndex], deck.mode)
    transContainer.innerHTML = renderTranslationArea(cards[currentIndex], deck.mode)
    wireTranslationReveal(transContainer, deck.mode)
  }

  function wireTranslationReveal(el, mode) {
    if (mode !== 'comprehension') return
    const area = el.querySelector('.review-translation--skeleton')
    if (!area) return
    const translation = area.dataset.translation

    function reveal() {
      area.classList.add('review-translation--revealed')
      area.innerHTML = translation
    }
    function hide() {
      area.classList.remove('review-translation--revealed')
      area.innerHTML = `
        <div class="review-translation-skeleton-line"></div>
        <div class="review-translation-skeleton-line review-translation-skeleton-line--short"></div>
      `
    }

    area.addEventListener('mousedown', reveal)
    area.addEventListener('touchstart', reveal, { passive: true })
    area.addEventListener('mouseup', hide)
    area.addEventListener('mouseleave', hide)
    area.addEventListener('touchend', hide)
    area.addEventListener('touchcancel', hide)
  }

  renderCurrent()

  // Slide in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('card-review-panel--visible')
    })
  })

  // TTS on card tap
  cardEl.addEventListener('click', () => {
    const card = cards[currentIndex]
    speak(card.reading || card.text, deck.lang)
  })

  // Back button
  panel.querySelector('.card-review-back').addEventListener('click', () => {
    panel.classList.remove('card-review-panel--visible')
    panel.addEventListener('transitionend', () => panel.remove(), { once: true })
  })

  // Swipe left/right
  let touchStartX = null

  cardEl.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX
  }, { passive: true })

  cardEl.addEventListener('touchmove', e => {
    if (touchStartX === null) return
    const dx = e.touches[0].clientX - touchStartX
    cardEl.style.transform = `translateX(${dx}px)`
  }, { passive: true })

  cardEl.addEventListener('touchend', e => {
    if (touchStartX === null) return
    const dx = e.changedTouches[0].clientX - touchStartX
    touchStartX = null
    cardEl.style.transform = ''
    if (Math.abs(dx) < 50) return
    if (dx < 0 && currentIndex < cards.length - 1) {
      currentIndex++
      renderCurrent()
    } else if (dx > 0 && currentIndex > 0) {
      currentIndex--
      renderCurrent()
    }
  }, { passive: true })
}
