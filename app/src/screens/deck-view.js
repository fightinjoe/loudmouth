import { db, getCards, getDecks, getRecentDecks } from '../db.js'
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

const LANG_FLAGS = { zh: '🇨🇳', ja: '🇯🇵', ko: '🇰🇷', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', pt: '🇵🇹', it: '🇮🇹', ru: '🇷🇺' }

function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function renderDeckPickerRow(deck, cardCount) {
  const ts = relativeTime(deck.lastAccessedAt ?? deck.createdAt)
  const flag = LANG_FLAGS[deck.lang] ?? ''
  return `
    <div class="deck-picker-row" data-deck-id="${deck.id}">
      <div class="deck-picker-row-info">
        <span class="deck-picker-row-name">${deck.name}</span>
        <span class="deck-picker-row-meta">${ts} · ${flag} · ${cardCount} cards</span>
      </div>
    </div>
  `
}

async function openDeckPicker(appEl, onSelectDeck) {
  const allDecks = await getDecks(null, { includeSystem: false })
  const recentDecks = await getRecentDecks(2)
  // Card counts: load all cards once
  const allCards = await db.cards.toArray()
  function cardCount(deckId) {
    return allCards.filter(c => c.deckIds && c.deckIds.includes(deckId)).length
  }

  // Most recent section (top 2)
  const recentIds = new Set(recentDecks.map(d => d.id))
  const remaining = allDecks.filter(d => !recentIds.has(d.id))

  // Group remaining by language
  const byLang = {}
  for (const deck of remaining) {
    ;(byLang[deck.lang] ??= []).push(deck)
  }

  let mostRecentHTML = ''
  if (recentDecks.length > 0) {
    mostRecentHTML = `
      <div class="deck-picker-section-header">Most Recent</div>
      ${recentDecks.map(d => renderDeckPickerRow(d, cardCount(d.id))).join('')}
    `
  }

  let byLangHTML = ''
  for (const [lang, decks] of Object.entries(byLang)) {
    const flag = LANG_FLAGS[lang] ?? ''
    byLangHTML += `
      <div class="deck-picker-section-header">${flag} ${lang.toUpperCase()}</div>
      ${decks.map(d => renderDeckPickerRow(d, cardCount(d.id))).join('')}
    `
  }

  const panel = document.createElement('div')
  panel.className = 'deck-picker-panel'
  panel.innerHTML = `
    <div class="deck-picker-header">
      <button class="deck-picker-back" aria-label="Back">‹ Back</button>
      <span class="deck-picker-title">Language decks</span>
      <button class="deck-picker-add" aria-label="Add">＋</button>
    </div>
    <div class="deck-picker-list">
      ${mostRecentHTML}
      ${byLangHTML}
      ${allDecks.length === 0 ? '<p class="deck-picker-empty">No decks yet.</p>' : ''}
    </div>
  `
  appEl.appendChild(panel)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('deck-picker-panel--visible')
    })
  })

  function close() {
    panel.classList.remove('deck-picker-panel--visible')
    panel.addEventListener('transitionend', () => panel.remove(), { once: true })
  }

  panel.querySelector('.deck-picker-back').addEventListener('click', close)

  panel.querySelector('.deck-picker-list').addEventListener('click', e => {
    const row = e.target.closest('.deck-picker-row')
    if (!row) return
    const deckId = row.dataset.deckId
    close()
    onSelectDeck(deckId)
  })
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

    el.querySelector('#btn-deck-title').addEventListener('click', () => {
      openDeckPicker(el, (selectedDeckId) => {
        renderDeckView(el, { id: selectedDeckId })
      })
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

    if (Math.abs(dx) < 50) {
      // Snap back
      cardEl.style.transition = 'transform 200ms ease'
      cardEl.style.transform = ''
      cardEl.addEventListener('transitionend', () => { cardEl.style.transition = '' }, { once: true })
      return
    }

    let nextIndex = -1
    if (dx < 0 && currentIndex < cards.length - 1) nextIndex = currentIndex + 1
    else if (dx > 0 && currentIndex > 0) nextIndex = currentIndex - 1

    if (nextIndex === -1) {
      // At boundary — snap back
      cardEl.style.transition = 'transform 200ms ease'
      cardEl.style.transform = ''
      cardEl.addEventListener('transitionend', () => { cardEl.style.transition = '' }, { once: true })
      return
    }

    // Slide out, then update and slide in
    const exitX = dx < 0 ? '-110%' : '110%'
    const enterX = dx < 0 ? '110%' : '-110%'
    cardEl.style.transition = 'transform 200ms ease'
    cardEl.style.transform = `translateX(${exitX})`
    cardEl.addEventListener('transitionend', () => {
      currentIndex = nextIndex
      renderCurrent()
      cardEl.style.transition = ''
      cardEl.style.transform = `translateX(${enterX})`
      // Force reflow then animate in
      cardEl.getBoundingClientRect()
      cardEl.style.transition = 'transform 200ms ease'
      cardEl.style.transform = ''
      cardEl.addEventListener('transitionend', () => { cardEl.style.transition = '' }, { once: true })
    }, { once: true })
  }, { passive: true })
}
