import { speak, ttsText } from '../js/tts.js'

function renderReviewCard(card, readingDisplay = 'reading') {
  return `
    <div class="review-card">
      <div class="review-card-text">${card.text || ''}</div>
      <div class="review-card-reading">${card[readingDisplay] || ''}</div>
      <div class="review-card-reverse">${card.translation || ''}</div>
    </div>
    <div class="review-translation">
      <div class="review-translation-skeleton">
        <div class="review-translation-skeleton-line"></div>
        <div class="review-translation-skeleton-line review-translation-skeleton-line--short"></div>
      </div>
      <div class="review-translation-text">${card.translation || ''}</div>
    </div>
  `
}

export function openCardReview(appEl, cards, deck, startIndex) {
  let currentIndex = startIndex

  const scrim = document.createElement('div')
  scrim.className = 'card-review-scrim'
  appEl.appendChild(scrim)

  const panel = document.createElement('div')
  panel.className = 'card-review-panel panel-screen'
  panel.innerHTML = `
    <div class="panel-header">
      <button class="panel-header-back" aria-label="Back">‹</button>
      <span class="panel-header-title">${deck.name}</span>
      <span class="panel-header-spacer"></span>
    </div>
    <div class="card-review-body">
      <div class="card-review-content"></div>
    </div>
  `
  appEl.appendChild(panel)

  const contentEl = panel.querySelector('.card-review-content')

  function renderCurrent() {
    contentEl.innerHTML = renderReviewCard(cards[currentIndex], deck.readingDisplay)
    contentEl.classList.remove('review--revealed')
    wireSwipe(contentEl.querySelector('.review-card'))
  }

  function wireSwipe(cardEl) {
    const COMMIT_THRESHOLD = 80
    let touchStartX = null
    let touchStartY = null
    let axis = null

    function applyDragStyle(dx) {
      const maxW = window.innerWidth
      const progress = Math.min(Math.abs(dx) / COMMIT_THRESHOLD, 1)
      const opacity = 1 - progress * 0.3
      const rotate = (dx / maxW) * 12
      cardEl.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`
      cardEl.style.opacity = opacity
    }

    function snapBack() {
      delete cardEl.dataset.dragging
      cardEl.style.transition = 'transform 200ms ease, opacity 200ms ease'
      cardEl.style.transform = ''
      cardEl.style.opacity = ''
      cardEl.addEventListener('transitionend', () => { cardEl.style.transition = '' }, { once: true })
    }

    cardEl.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX
      touchStartY = e.touches[0].clientY
      axis = null
      cardEl.dataset.dragging = ''
    }, { passive: true })

    cardEl.addEventListener('touchmove', e => {
      if (touchStartX === null) return
      const dx = e.touches[0].clientX - touchStartX
      const dy = e.touches[0].clientY - touchStartY

      if (!axis) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
        axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }

      if (axis !== 'h') return
      applyDragStyle(dx)
    }, { passive: true })

    cardEl.addEventListener('touchend', e => {
      if (touchStartX === null) return
      const dx = e.changedTouches[0].clientX - touchStartX
      touchStartX = null
      delete cardEl.dataset.dragging

      if (axis !== 'h' || Math.abs(dx) < COMMIT_THRESHOLD) {
        snapBack()
        return
      }

      let nextIndex = -1
      if (dx < 0 && currentIndex < cards.length - 1) nextIndex = currentIndex + 1
      else if (dx > 0 && currentIndex > 0) nextIndex = currentIndex - 1

      if (nextIndex === -1) {
        snapBack()
        return
      }

      const exitX = dx < 0 ? '-110%' : '110%'
      const enterX = dx < 0 ? '110%' : '-110%'
      cardEl.style.transition = 'transform 200ms ease, opacity 200ms ease'
      cardEl.style.transform = `translateX(${exitX})`
      cardEl.style.opacity = '0'
      cardEl.addEventListener('transitionend', () => {
        currentIndex = nextIndex
        renderCurrent()
        const newCardEl = contentEl.querySelector('.review-card')
        newCardEl.style.transform = `translateX(${enterX})`
        newCardEl.style.opacity = '0'
        newCardEl.getBoundingClientRect()
        newCardEl.style.transition = 'transform 200ms ease, opacity 200ms ease'
        newCardEl.style.transform = ''
        newCardEl.style.opacity = ''
        newCardEl.addEventListener('transitionend', () => { newCardEl.style.transition = '' }, { once: true })
      }, { once: true })
    }, { passive: true })

    cardEl.addEventListener('touchcancel', () => {
      touchStartX = null
      snapBack()
    }, { passive: true })
  }

  renderCurrent()

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('panel-screen--visible')
      scrim.classList.add('card-review-scrim--visible')
    })
  })

  // Drag-down-to-dismiss
  const DISMISS_THRESHOLD = 100
  let dismissStartX = null
  let dismissStartY = null
  let dismissAxis = null

  panel.addEventListener('touchstart', e => {
    // Don't intercept touches on the card itself (handled by card swipe)
    if (e.target.closest('.review-card')) return
    dismissStartX = e.touches[0].clientX
    dismissStartY = e.touches[0].clientY
    dismissAxis = null
    panel.dataset.dragging = ''
  }, { passive: true })

  panel.addEventListener('touchmove', e => {
    if (dismissStartY === null) return
    const dx = e.touches[0].clientX - dismissStartX
    const dy = e.touches[0].clientY - dismissStartY

    if (!dismissAxis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
      dismissAxis = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h'
    }
    if (dismissAxis !== 'v' || dy < 0) return
    panel.style.transform = `translateY(${dy}px)`
  }, { passive: true })

  panel.addEventListener('touchend', e => {
    if (dismissStartY === null) return
    const dy = e.changedTouches[0].clientY - dismissStartY
    delete panel.dataset.dragging
    dismissStartX = null
    dismissStartY = null

    if (dismissAxis === 'v' && dy >= DISMISS_THRESHOLD) {
      scrim.classList.remove('card-review-scrim--visible')
      panel.style.transition = 'transform 250ms ease'
      panel.style.transform = 'translateY(100%)'
      panel.addEventListener('transitionend', () => { panel.remove(); scrim.remove() }, { once: true })
    } else {
      panel.style.transition = 'transform 250ms ease'
      panel.style.transform = ''
      panel.addEventListener('transitionend', () => { panel.style.transition = '' }, { once: true })
    }
    dismissAxis = null
  }, { passive: true })

  panel.addEventListener('touchcancel', () => {
    if (dismissStartY === null) return
    delete panel.dataset.dragging
    dismissStartX = null
    dismissStartY = null
    dismissAxis = null
    panel.style.transition = 'transform 250ms ease'
    panel.style.transform = ''
    panel.addEventListener('transitionend', () => { panel.style.transition = '' }, { once: true })
  }, { passive: true })

  contentEl.addEventListener('click', e => {
    if (e.target.closest('.review-card')) {
      const card = cards[currentIndex]
      speak(ttsText(card), card.lang)
    }
  })

  contentEl.addEventListener('mousedown', e => {
    if (e.target.closest('.review-translation')) contentEl.classList.add('review--revealed')
  })
  contentEl.addEventListener('touchstart', e => {
    if (e.target.closest('.review-translation')) contentEl.classList.add('review--revealed')
  }, { passive: true })
  contentEl.addEventListener('mouseup', () => contentEl.classList.remove('review--revealed'))
  contentEl.addEventListener('mouseleave', () => contentEl.classList.remove('review--revealed'))
  contentEl.addEventListener('touchend', () => contentEl.classList.remove('review--revealed'))
  contentEl.addEventListener('touchcancel', () => contentEl.classList.remove('review--revealed'))

  function dismiss() {
    scrim.classList.remove('card-review-scrim--visible')
    panel.classList.remove('panel-screen--visible')
    panel.addEventListener('transitionend', () => {
      panel.remove()
      scrim.remove()
    }, { once: true })
  }

  panel.querySelector('.panel-header-back').addEventListener('click', dismiss)
}
