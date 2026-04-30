import { LANG_FLAGS, LANG_NAMES } from '../js/lang.js'

const GATEWAY_URL = 'https://translation-api-gateway-2qqw247r.uc.gateway.dev'

const SUPPORTED_LANGS = Object.keys(LANG_FLAGS)

/**
 * Opens the Generate Cards action pane.
 *
 * @param {HTMLElement} appEl
 * @param {{ createDeck: Function, importCards: Function }} ops
 * @param {Function} onDone - called with the deck id after cards are added
 * @param {Object|null} targetDeck - if provided, add cards to this deck instead of creating a new one
 */
export function openGenerateCardsPanel(appEl, { createDeck, importCards }, onDone, targetDeck = null) {
  let selectedLang = targetDeck?.lang ?? (SUPPORTED_LANGS.includes('ja') ? 'ja' : SUPPORTED_LANGS[0])

  const langFlag = LANG_FLAGS[selectedLang] ?? ''
  const langName = LANG_NAMES[selectedLang] ?? selectedLang

  const scrim = document.createElement('div')
  scrim.className = 'generate-cards-scrim fixed-inset scrim scrim-clear transition-bg'
  appEl.appendChild(scrim)

  const panel = document.createElement('div')
  panel.className = 'generate-cards-panel bottom-sheet bg-primary flex-col transition-sheet'
  if (targetDeck) panel.dataset.hasDeck = ''
  panel.innerHTML = `
    <div class="generate-cards-handle sheet-handle"></div>
    <div class="pane-header flex items-center">
      <button class="icon-button fg-accent text-icon flex items-center justify-center shrink-0 generate-cards-back" aria-label="Back">‹</button>
      <span class="pane-header-title flex-1 text-center text-header font-semibold fg-body bg-none no-tap-highlight">Add cards</span>
      <span class="pane-header-spacer shrink-0"></span>
    </div>
    <div class="generate-cards-body flex-col">
      <p class="generate-cards-instruction text-body2 text-center fg-secondary">Share a situation or context</p>
      <textarea class="generate-cards-textarea surface-field text-area-fixed text-body1 font-inherit leading-entry" id="gc-topic"
        placeholder="Greetings for morning, afternoon, evening…"
        rows="4" autocorrect="off" autocapitalize="sentences" spellcheck="true"></textarea>
      <div class="generate-cards-footer flex items-center justify-between">
        <div class="generate-cards-lang-wrap flex items-center text-body1 fg-body tappable">
          <span id="gc-lang-flag">${langFlag}</span>
          <span id="gc-lang-name">${langName}</span>
          <span class="generate-cards-lang-chevron text-icon-sm fg-tertiary">⇅</span>
          <select class="generate-cards-lang-select absolute-inset" id="gc-lang-select" aria-label="Language">
            ${SUPPORTED_LANGS.map(l => `<option value="${l}"${l === selectedLang ? ' selected' : ''}>${LANG_FLAGS[l] ?? ''} ${LANG_NAMES[l] ?? l}</option>`).join('')}
          </select>
        </div>
        <span class="generate-cards-lang-label items-center text-body1 fg-secondary">${langFlag} ${langName}</span>
        <button class="generate-cards-generate-btn pill-action tappable" id="gc-generate-btn" disabled>Generate</button>
      </div>
      <div class="generate-cards-error text-body2 text-center fg-danger" id="gc-error" aria-live="polite"></div>
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

  const topicEl = panel.querySelector('#gc-topic')
  const generateBtn = panel.querySelector('#gc-generate-btn')
  const langSelect = panel.querySelector('#gc-lang-select')
  const errorEl = panel.querySelector('#gc-error')

  topicEl.addEventListener('input', () => {
    generateBtn.disabled = topicEl.value.trim().length === 0
  })

  langSelect.addEventListener('change', () => {
    selectedLang = langSelect.value
    panel.querySelector('#gc-lang-flag').textContent = LANG_FLAGS[selectedLang] ?? ''
    panel.querySelector('#gc-lang-name').textContent = LANG_NAMES[selectedLang] ?? selectedLang
  })

  panel.querySelector('.generate-cards-back').addEventListener('click', close)
  scrim.addEventListener('click', close)

  generateBtn.addEventListener('click', async () => {
    const topic = topicEl.value.trim()
    if (!topic) return

    errorEl.textContent = ''
    generateBtn.disabled = true
    generateBtn.textContent = 'Generating…'

    let cards
    try {
      const res = await fetch(`${GATEWAY_URL}/generate-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: selectedLang, topic }),
      })
      if (!res.ok) {
        if (res.status === 429) { errorEl.textContent = 'Try again in 60 seconds.'; return }
        if (res.status === 504) { errorEl.textContent = 'Could not generate — try again.'; return }
        errorEl.textContent = `Error ${res.status} — try again.`
        return
      }
      const data = await res.json()
      cards = data.cards
      if (!cards || cards.length === 0) { errorEl.textContent = 'No cards returned — try rephrasing.'; return }
    } catch {
      errorEl.textContent = 'No connection.'
      return
    } finally {
      generateBtn.textContent = 'Generate'
      generateBtn.disabled = topicEl.value.trim().length === 0
    }

    if (targetDeck) {
      await importCards(cards, targetDeck.id)
      close()
      onDone(targetDeck.id)
    } else {
      const deckName = topic.length > 30 ? topic.slice(0, 30).trimEnd() + '…' : topic
      const deck = await createDeck(deckName, selectedLang)
      await importCards(cards, deck.id)
      close()
      onDone(deck.id)
    }
  })

  // Swipe-down to dismiss
  let startY = 0
  panel.addEventListener('touchstart', e => { startY = e.touches[0].clientY }, { passive: true })
  panel.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - startY
    if (dy > 60) close()
  }, { passive: true })
}
