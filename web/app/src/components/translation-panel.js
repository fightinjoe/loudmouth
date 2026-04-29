import { LANG_FLAGS, LANG_NAMES } from '../js/lang.js'
import { speak, ttsText } from '../js/tts.js'

const GATEWAY_URL = 'https://translation-api-gateway-2qqw247r.uc.gateway.dev'

/**
 * Renders a single translation result card row.
 * reading comes from ruby_markup (strip tags for plain text fallback) or
 * we just show it empty — the API returns ruby_markup.
 */
function renderResultCard(t, position) {
  // position: 'top' | 'middle' | 'bottom' | 'only'
  const radiusClass = {
    top: 'tr-card--top',
    middle: 'tr-card--middle',
    bottom: 'tr-card--bottom',
    only: 'tr-card--only',
  }[position] ?? ''

  // Strip ruby tags to get plain reading text
  const plainReading = (t.ruby_markup ?? '')
    .replace(/<rt>/g, ' (').replace(/<\/rt>/g, ')').replace(/<\/?ruby>/g, '').replace(/<\/rb>/g, '').replace(/<rb>/g, '')
    .trim() || t.translation

  return `
    <div class="tr-card bg-surface ${radiusClass}" data-translation-text="${escAttr(t.text)}" data-translation-reading="${escAttr(plainReading)}" data-translation="${escAttr(t.translation)}" data-lang="${escAttr(t.lang ?? '')}">
      <div class="tr-card-main flex items-center">
        <div class="tr-card-left flex-1 flex-col min-w-0">
          <span class="tr-card-reading text-body2 fg-caption">${escHtml(plainReading)}</span>
          <span class="tr-card-text text-h2 font-medium fg-body">${escHtml(t.text)}</span>
          <span class="tr-card-meaning text-body2 fg-caption">${escHtml(t.translation)}</span>
        </div>
        <button class="tr-card-play fg-tertiary text-body1 shrink-0" aria-label="Play">▶</button>
      </div>
    </div>
  `
}

function renderSkeletonCard(position) {
  const radiusClass = { top: 'tr-card--top', middle: 'tr-card--middle', bottom: 'tr-card--bottom', only: 'tr-card--only' }[position] ?? ''
  return `
    <div class="tr-card tr-card--skeleton bg-surface ${radiusClass}">
      <div class="tr-card-main flex items-center">
        <div class="tr-card-left flex-1 flex-col min-w-0">
          <div class="tr-skeleton-line tr-skeleton-line--short bg-border"></div>
          <div class="tr-skeleton-line tr-skeleton-line--long bg-border"></div>
          <div class="tr-skeleton-line tr-skeleton-line--med bg-border"></div>
        </div>
        <div class="tr-skeleton-play bg-border shrink-0"></div>
      </div>
    </div>
  `
}

function positionLabel(i, total) {
  if (total === 1) return 'only'
  if (i === 0) return 'top'
  if (i === total - 1) return 'bottom'
  return 'middle'
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;')
}

/**
 * Opens the Translation action pane as a bottom sheet.
 *
 * @param {HTMLElement} appEl - the top-level app container
 * @param {Object} deck - the current deck ({ id, lang, name })
 * @param {{ importCards: Function }} ops - db operations
 * @param {Function} onCardAdded - called with a card object when user adds one
 */
export function openTranslationPanel(appEl, deck, { importCards }, onCardAdded) {
  const langFlag = LANG_FLAGS[deck.lang] ?? '🌐'
  const langName = LANG_NAMES[deck.lang] ?? deck.lang ?? 'Unknown'

  const scrim = document.createElement('div')
  scrim.className = 'translation-scrim fixed-inset scrim scrim-clear transition-bg'
  appEl.appendChild(scrim)

  const panel = document.createElement('div')
  panel.className = 'translation-panel bottom-sheet bg-primary flex-col transition-sheet'
  panel.innerHTML = `
    <div class="translation-handle sheet-handle"></div>
    <div class="pane-header flex items-center">
      <button class="pane-header-back fg-accent text-icon flex items-center justify-center shrink-0 translation-back" aria-label="Back">‹</button>
      <span class="pane-header-title flex-1 text-center text-header font-semibold fg-body bg-none translation-lang-label">${langFlag} ${escHtml(langName)}</span>
      <span class="pane-header-spacer shrink-0"></span>
    </div>
    <div class="translation-body flex-1 flex-col min-h-0 overflow-y-auto">
      <textarea
        class="translation-textarea surface-field text-area-fixed text-entry font-inherit"
        id="tr-input"
        placeholder="Type a word or phrase…"
        autocorrect="off"
        autocapitalize="sentences"
        spellcheck="true"
        rows="3"
      ></textarea>
      <div class="translation-results flex-1 flex-col" id="tr-results" aria-live="polite"></div>
      <div class="translation-footer flex justify-end shrink-0">
        <button class="translation-translate-btn pill-action tappable" id="tr-translate-btn" disabled>Translate</button>
      </div>
    </div>
  `
  appEl.appendChild(panel)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrim.classList.add('scrim-visible')
      panel.classList.add('bottom-sheet--visible')
    })
  })

  function close() {
    scrim.classList.remove('scrim-visible')
    panel.classList.remove('bottom-sheet--visible')
    panel.addEventListener('transitionend', () => {
      panel.remove()
      scrim.remove()
    }, { once: true })
  }

  const inputEl = panel.querySelector('#tr-input')
  const translateBtn = panel.querySelector('#tr-translate-btn')
  const resultsEl = panel.querySelector('#tr-results')

  // Track current result translations so we can manage swipe-to-add
  let currentTranslations = []

  // ── Enable/disable translate button ─────────────────────────────────────────

  inputEl.addEventListener('input', () => {
    translateBtn.disabled = inputEl.value.trim().length === 0
  })

  // ── Translate ────────────────────────────────────────────────────────────────

  translateBtn.addEventListener('click', () => runTranslate())

  async function runTranslate() {
    const text = inputEl.value.trim()
    if (!text) return

    translateBtn.disabled = true
    currentTranslations = []

    // Show skeleton (1 row while loading)
    resultsEl.innerHTML = `
      <p class="translation-hint text-body2 text-center fg-secondary">Swipe or tap to add card</p>
      <div class="translation-card-list flex-col" id="tr-card-list">
        ${renderSkeletonCard('only')}
      </div>
    `

    let data
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      const res = await fetch(`${GATEWAY_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage: langName }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        if (res.status === 429) {
          showError('Try again in 60 seconds.')
        } else if (res.status >= 500) {
          showError('Could not generate — try again. <button class="translation-retry-btn fg-accent text-body1 tappable" id="tr-retry">↻</button>')
          panel.querySelector('#tr-retry')?.addEventListener('click', runTranslate)
        } else {
          showError(`Error ${res.status} — try again.`)
        }
        translateBtn.disabled = false
        return
      }

      data = await res.json()
    } catch (err) {
      if (err.name === 'AbortError') {
        showError('Could not generate — try again. <button class="translation-retry-btn fg-accent text-body1 tappable" id="tr-retry">↻</button>')
        panel.querySelector('#tr-retry')?.addEventListener('click', runTranslate)
      } else {
        showError('No connection.')
      }
      translateBtn.disabled = false
      return
    }

    const translations = data?.translations ?? []
    if (translations.length === 0) {
      showError('No result — try rephrasing. <button class="translation-retry-btn fg-accent text-body1 tappable" id="tr-retry">↻</button>')
      panel.querySelector('#tr-retry')?.addEventListener('click', runTranslate)
      translateBtn.disabled = inputEl.value.trim().length === 0
      return
    }

    currentTranslations = [...translations]
    renderResults()
    translateBtn.disabled = false
  }

  function showError(html) {
    resultsEl.innerHTML = `<p class="translation-error text-body2 text-center fg-danger" aria-live="polite">${html}</p>`
  }

  function renderResults() {
    if (currentTranslations.length === 0) {
      resultsEl.innerHTML = ''
      return
    }
    const cardListHtml = currentTranslations.map((t, i) =>
      renderResultCard(t, positionLabel(i, currentTranslations.length))
    ).join('')
    resultsEl.innerHTML = `
      <p class="translation-hint text-body2 text-center fg-secondary">Swipe or tap to add card</p>
      <div class="translation-card-list flex-col" id="tr-card-list">
        ${cardListHtml}
      </div>
    `
    wireCardInteractions()
  }

  function removeCard(cardEl) {
    cardEl.classList.add('tr-card--removing')
    cardEl.addEventListener('transitionend', () => {
      cardEl.remove()
      // Update radius classes on remaining cards
      const remaining = resultsEl.querySelectorAll('.tr-card:not(.tr-card--removing)')
      remaining.forEach((el, i) => {
        el.classList.remove('tr-card--top', 'tr-card--middle', 'tr-card--bottom', 'tr-card--only')
        el.classList.add(`tr-card--${positionLabel(i, remaining.length)}`)
      })
      if (remaining.length === 0) {
        // All done — reset to empty state
        currentTranslations = []
        resultsEl.innerHTML = ''
        inputEl.value = ''
        translateBtn.disabled = true
      }
    }, { once: true })
  }

  async function addCard(cardEl) {
    const text = cardEl.dataset.translationText
    const reading = cardEl.dataset.translationReading
    const translation = cardEl.dataset.translation
    const lang = cardEl.dataset.lang || deck.lang

    const card = { lang, text, reading, translation }
    try {
      await importCards([card], deck.id)
      onCardAdded && onCardAdded(card)
    } catch (e) {
      // best-effort; still remove from list
    }
    removeCard(cardEl)
  }

  function wireCardInteractions() {
    const cardList = resultsEl.querySelector('#tr-card-list')
    if (!cardList) return

    // Tap on card row → add (top card only, matching design spec)
    cardList.addEventListener('click', e => {
      const playBtn = e.target.closest('.tr-card-play')
      if (playBtn) {
        e.stopPropagation()
        const cardEl = playBtn.closest('.tr-card')
        if (cardEl) {
          const fakeCard = {
            text: cardEl.dataset.translationText,
            lang: cardEl.dataset.lang || deck.lang,
          }
          speak(ttsText(fakeCard), fakeCard.lang)
        }
        return
      }

      const cardEl = e.target.closest('.tr-card')
      if (cardEl && (cardEl.classList.contains('tr-card--top') || cardEl.classList.contains('tr-card--only'))) {
        addCard(cardEl)
      }
    })

    // Swipe-to-add on top card
    wireCardSwipe(cardList)
  }

  function wireCardSwipe(cardList) {
    let startX = 0, startY = 0, axis = null, currentCardEl = null

    cardList.addEventListener('touchstart', e => {
      const cardEl = e.target.closest('.tr-card')
      if (!cardEl) return
      if (!cardEl.classList.contains('tr-card--top') && !cardEl.classList.contains('tr-card--only')) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      axis = null
      currentCardEl = cardEl
      cardEl.dataset.dragging = ''
    }, { passive: true })

    cardList.addEventListener('touchmove', e => {
      if (!currentCardEl) return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      if (!axis) {
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
        }
      }
      if (axis !== 'h') return
      currentCardEl.style.transform = `translateX(${dx}px)`
      // Reveal indicator
      if (dx > 0) {
        currentCardEl.dataset.swipeDir = 'right'
      } else {
        currentCardEl.dataset.swipeDir = 'left'
      }
    }, { passive: true })

    cardList.addEventListener('touchend', e => {
      if (!currentCardEl || axis !== 'h') {
        if (currentCardEl) {
          delete currentCardEl.dataset.dragging
          delete currentCardEl.dataset.swipeDir
          currentCardEl = null
        }
        return
      }
      const dx = e.changedTouches[0].clientX - startX
      delete currentCardEl.dataset.dragging
      delete currentCardEl.dataset.swipeDir

      if (dx > 80) {
        // Swipe right → add
        addCard(currentCardEl)
      } else {
        // Snap back
        currentCardEl.style.transform = ''
      }
      currentCardEl = null
      axis = null
    }, { passive: true })

    cardList.addEventListener('touchcancel', () => {
      if (currentCardEl) {
        delete currentCardEl.dataset.dragging
        delete currentCardEl.dataset.swipeDir
        currentCardEl.style.transform = ''
        currentCardEl = null
      }
      axis = null
    }, { passive: true })
  }

  // ── Dismiss ─────────────────────────────────────────────────────────────────

  panel.querySelector('.translation-back').addEventListener('click', close)
  scrim.addEventListener('click', close)

  let swipeStartY = 0
  panel.addEventListener('touchstart', e => { swipeStartY = e.touches[0].clientY }, { passive: true })
  panel.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - swipeStartY
    if (dy > 60) close()
  }, { passive: true })

  // Focus the input
  requestAnimationFrame(() => inputEl.focus())
}
