import { LANG_FLAGS, LANG_NAMES } from '../js/lang.js'
import { openBottomSheet } from './bottom-sheet.js'

const GATEWAY_URL = 'https://translation-api-gateway-2qqw247r.uc.gateway.dev'
const SUPPORTED_LANGS = Object.keys(LANG_FLAGS)

function renderBody(selectedLang) {
  const langFlag = LANG_FLAGS[selectedLang] ?? ''
  const langName = LANG_NAMES[selectedLang] ?? selectedLang
  return `
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
}

export function openGenerateCardsPanel(appEl, { createDeck, importCards }, onDone, targetDeck = null, onDismiss = null) {
  let selectedLang = targetDeck?.lang ?? (SUPPORTED_LANGS.includes('ja') ? 'ja' : SUPPORTED_LANGS[0])

  const sheet = openBottomSheet(appEl, {
    kind: 'generate',
    bodyHTML: renderBody(selectedLang),
    onClose: onDismiss,
    onMount: (panel, _scrim, close) => {
      if (targetDeck) panel.dataset.hasDeck = ''
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
    },
  })
  return sheet
}
