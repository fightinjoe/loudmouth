import '../styles/review.css'
import { getCards, db } from '../db.js'
import { speak, cancel, ttsAvailable, ttsText } from '../tts.js'
import { applyMode, STUDY_MODES } from '../study-modes.js'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function renderReview(el, params) {
  const deckId = params.deckId
  if (!deckId) { window.location.hash = 'home'; return }

  let cards = []
  let index = 0
  let flipped = false
  let speaking = false
  let mode = STUDY_MODES.TARGET_LANG

  function frontHTML(card) {
    const { front } = applyMode(card, mode)
    return `
      ${card.type ? `<div class="card-type-badge">${card.type}</div>` : ''}
      <div class="card-front-text">${front}</div>
    `
  }

  function backHTML(card) {
    const { back } = applyMode(card, mode)
    const ex = card.example
    return `
      <div class="card-back-translation">${back}</div>
      ${card.notes ? `<div class="card-back-notes">${card.notes}</div>` : ''}
      ${ex ? `
        <div class="card-example">
          <div class="card-example-label">Example</div>
          <div class="card-example-text">${ex.text}</div>
          ${ex.reading ? `<div class="card-example-reading">${ex.reading}</div>` : ''}
          ${ex.translation ? `<div class="card-example-translation">${ex.translation}</div>` : ''}
        </div>
      ` : ''}
    `
  }

  function render() {
    const card = cards[index]
    el.innerHTML = `
      <div class="screen review-screen">
        <div class="review-header">
          <button class="review-back" id="btn-back">←</button>
          <div class="review-counter">${index + 1} / ${cards.length}</div>
          <div class="review-header-spacer"></div>
        </div>
        <div class="card-scene" id="card-scene">
          <div class="card-flip${flipped ? ' flipped' : ''}">
            <div class="card-face card-face-front">${frontHTML(card)}</div>
            <div class="card-face card-face-back">${backHTML(card)}</div>
          </div>
        </div>
        <div class="review-tap-hint">Tap card to flip</div>
        <div class="review-controls">
          <button class="review-nav" id="btn-prev" ${index === 0 ? 'disabled' : ''}>←</button>
          ${ttsAvailable ? `<button class="review-play" id="btn-play">${speaking ? 'Playing…' : '▶ Play'}</button>` : ''}
          <button class="review-nav" id="btn-next" ${index === cards.length - 1 ? 'disabled' : ''}>→</button>
        </div>
      </div>
    `

    el.querySelector('#btn-back').addEventListener('click', () => {
      cancel()
      window.location.hash = 'home'
    })
    el.querySelector('#card-scene').addEventListener('click', doFlip)
    el.querySelector('#btn-prev').addEventListener('click', () => go(-1))
    el.querySelector('#btn-next').addEventListener('click', () => go(1))
    const playBtn = el.querySelector('#btn-play')
    if (playBtn) playBtn.addEventListener('click', doPlay)
  }

  function doFlip() {
    flipped = !flipped
    const flipEl = el.querySelector('.card-flip')
    flipEl.classList.toggle('flipped', flipped)
  }

  function go(dir) {
    cancel()
    speaking = false
    flipped = false
    index = Math.max(0, Math.min(cards.length - 1, index + dir))
    render()
  }

  function doPlay() {
    if (!ttsAvailable || !cards.length) return
    const card = cards[index]
    speaking = true
    const btn = el.querySelector('#btn-play')
    if (btn) btn.textContent = 'Playing…'
    speak(ttsText(card), card.lang, {
      onEnd: () => {
        speaking = false
        const b = el.querySelector('#btn-play')
        if (b) b.textContent = '▶ Play'
      },
      onError: () => {
        speaking = false
        const b = el.querySelector('#btn-play')
        if (b) b.textContent = '▶ Play'
      },
    })
  }

  function onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
    switch (e.key) {
      case 'ArrowLeft': go(-1); break
      case 'ArrowRight': go(1); break
      case ' ':
      case 'Enter': e.preventDefault(); doFlip(); break
      case 'p': doPlay(); break
    }
  }

  document.addEventListener('keydown', onKey)
  window.addEventListener('hashchange', () => {
    document.removeEventListener('keydown', onKey)
    cancel()
  }, { once: true })

  async function init() {
    const deck = await db.decks.get(deckId)
    mode = deck?.mode || STUDY_MODES.TARGET_LANG

    const rawCards = await getCards(deckId)
    cards = shuffle(rawCards)

    if (cards.length === 0) {
      el.innerHTML = `
        <div class="screen review-screen">
          <div class="review-header">
            <button class="review-back" id="btn-back">←</button>
            <div class="review-counter">0 / 0</div>
            <div class="review-header-spacer"></div>
          </div>
          <div class="empty-state">
            <p style="color: var(--text-secondary)">No cards in this deck.</p>
          </div>
        </div>
      `
      el.querySelector('#btn-back').addEventListener('click', () => { window.location.hash = 'home' })
      return
    }

    render()
  }

  init()
}
