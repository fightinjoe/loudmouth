import { speak, ttsText } from '../js/tts.js'
import { MODES } from '../js/modes.js'

function renderReviewCardContent(card, mode) {
  if (mode === MODES.REVERSE) {
    return `<div class="review-card-text">${card.translation || ''}</div>`
  }
  return `
    <div class="review-card-text">${card.text || ''}</div>
    ${card.reading ? `<div class="review-card-reading">${card.reading}</div>` : ''}
  `
}

function renderTranslationArea(card, mode) {
  if (mode === MODES.REVERSE) return ''
  
  return `
    <div class="review-translation review-translation--skeleton" data-translation="${(card.translation || '').replace(/"/g, '&quot;')}">
      <div class="review-translation-skeleton-line"></div>
      <div class="review-translation-skeleton-line review-translation-skeleton-line--short"></div>
    </div>
  `
}

function wireTranslationReveal(el, mode) {
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

export function openCardReview(appEl, cards, deck, startIndex) {
  let currentIndex = startIndex

  const panel = document.createElement('div')
  panel.className = 'card-review-panel panel-screen'
  panel.innerHTML = `
    <div class="panel-header">
      <button class="panel-header-back" aria-label="Back">‹</button>
      <span class="panel-header-title">${deck.name}</span>
      <span class="panel-header-spacer"></span>
    </div>
    <div class="card-review-body">
      <div class="card-review-content">
        <div class="review-card" id="review-card-el"></div>
        <div id="review-translation-el" style="width:100%"></div>
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

  renderCurrent()

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('panel-screen--visible')
    })
  })

  cardEl.addEventListener('click', () => {
    const card = cards[currentIndex]
    speak(ttsText(card), card.lang)
  })

  panel.querySelector('.panel-header-back').addEventListener('click', () => {
    panel.classList.remove('panel-screen--visible')
    panel.addEventListener('transitionend', () => panel.remove(), { once: true })
  })

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
      cardEl.style.transition = 'transform 200ms ease'
      cardEl.style.transform = ''
      cardEl.addEventListener('transitionend', () => { cardEl.style.transition = '' }, { once: true })
      return
    }

    let nextIndex = -1
    if (dx < 0 && currentIndex < cards.length - 1) nextIndex = currentIndex + 1
    else if (dx > 0 && currentIndex > 0) nextIndex = currentIndex - 1

    if (nextIndex === -1) {
      cardEl.style.transition = 'transform 200ms ease'
      cardEl.style.transform = ''
      cardEl.addEventListener('transitionend', () => { cardEl.style.transition = '' }, { once: true })
      return
    }

    const exitX = dx < 0 ? '-110%' : '110%'
    const enterX = dx < 0 ? '110%' : '-110%'
    cardEl.style.transition = 'transform 200ms ease'
    cardEl.style.transform = `translateX(${exitX})`
    cardEl.addEventListener('transitionend', () => {
      currentIndex = nextIndex
      renderCurrent()
      cardEl.style.transition = ''
      cardEl.style.transform = `translateX(${enterX})`
      cardEl.getBoundingClientRect()
      cardEl.style.transition = 'transform 200ms ease'
      cardEl.style.transform = ''
      cardEl.addEventListener('transitionend', () => { cardEl.style.transition = '' }, { once: true })
    }, { once: true })
  }, { passive: true })
}
