import { LANG_FLAGS, LANG_NAMES } from '../js/lang.js'
import { speak, ttsText } from '../js/tts.js'
import { openBottomSheet } from './bottom-sheet.js'

const GATEWAY_URL = 'https://translation-api-gateway-2qqw247r.uc.gateway.dev'

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function positionLabel(i, total) {
  if (total === 1) return 'only'
  if (i === 0) return 'top'
  if (i === total - 1) return 'bottom'
  return 'middle'
}

function renderResultCard(t, position) {
  const radiusClass = {
    top: 'tr-card--top', middle: 'tr-card--middle', bottom: 'tr-card--bottom', only: 'tr-card--only',
  }[position] ?? ''
  const plainReading = (t.ruby_markup ?? '')
    .replace(/<rt>/g, ' (').replace(/<\/rt>/g, ')').replace(/<\/?ruby>/g, '').replace(/<\/rb>/g, '').replace(/<rb>/g, '')
    .trim() || t.translation
  const tokens = parseRubyMarkup(t.ruby_markup);
  const tokensJson = tokens ? JSON.stringify(tokens) : '';

  return `
    <div class="tr-card bg-surface ${radiusClass}"
      data-translation-text="${escAttr(t.text)}"
      data-translation-reading="${escAttr(plainReading)}"
      data-translation-reading-tokens='${escAttr(tokensJson)}'
      data-translation="${escAttr(t.translation)}"
      data-lang="${escAttr(t.lang ?? '')}">
      <div class="tr-card-main flex items-center">
        <div class="tr-card-left flex-1 flex-col min-w-0">
          <span class="tr-card-reading text-body2 fg-caption">${escHtml(plainReading)}</span>
          <span class="tr-card-text text-h2 font-medium fg-body">${escHtml(t.text)}</span>
          <span class="tr-card-meaning text-body2 fg-caption">${escHtml(t.translation)}</span>
        </div>
        <button class="tr-card-play fg-tertiary text-body1 shrink-0 tappable" aria-label="Play">▶</button>
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

/**
 * Parses a ruby_markup string into a ReadingToken array.
 */
function parseRubyMarkup(htmlStr) {
  if (!htmlStr) return null;
  const div = document.createElement('div');
  div.innerHTML = htmlStr;
  const tokens = [];

  function addToken(base, annotation) {
    if (!base) return;
    if (annotation === base || !annotation) { tokens.push([base, null]); return; }
    let start = 0;
    while (start < base.length && start < annotation.length && base[start] === annotation[start]) start++;
    if (start > 0) tokens.push([base.slice(0, start), null]);
    let endBase = base.length;
    let endAnn = annotation.length;
    while (endBase > start && endAnn > start && base[endBase - 1] === annotation[endAnn - 1]) { endBase--; endAnn--; }
    const midBase = base.slice(start, endBase);
    const midAnn = annotation.slice(start, endAnn);
    if (midBase) tokens.push([midBase, midAnn]);
    if (endBase < base.length) tokens.push([base.slice(endBase), null]);
  }

  for (const node of div.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text) tokens.push([text, null]);
    } else if (node.nodeName === 'RUBY') {
      let currentBase = '';
      for (const child of node.childNodes) {
        if (child.nodeName === 'RT') {
          if (currentBase) { addToken(currentBase, child.textContent); currentBase = ''; }
        } else if (child.nodeType === Node.TEXT_NODE) {
          currentBase += child.textContent;
        } else if (child.nodeName === 'RB') {
          currentBase += child.textContent;
        }
      }
      if (currentBase) addToken(currentBase, null);
    }
  }
  return tokens.length > 0 ? tokens : null;
}

function renderBody(langFlag, langName) {
  return `
    <div class="pane-header flex items-center">
      <button class="icon-button fg-accent text-icon flex items-center justify-center shrink-0 translation-back" aria-label="Back">‹</button>
      <span class="pane-header-title flex-1 text-center text-header font-semibold fg-body bg-none no-tap-highlight translation-lang-label">${langFlag} ${escHtml(langName)}</span>
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
}

export function openTranslationPanel(appEl, deck, { importCards }, onCardAdded) {
  const langFlag = LANG_FLAGS[deck.lang] ?? '🌐'
  const langName = LANG_NAMES[deck.lang] ?? deck.lang ?? 'Unknown'

  const sheet = openBottomSheet(appEl, {
    kind: 'translation',
    bodyHTML: `<div class="translation-panel-inner flex-col flex-1">${renderBody(langFlag, langName)}</div>`,
    onMount: (panel) => {
      // Re-add the `flex-col` modifier that the original template relied on.
      // openBottomSheet sets the base bottom-sheet classes; we add flex-col so
      // the translation panel's internal layout works.
      panel.classList.add('flex-col')

      const inputEl = panel.querySelector('#tr-input')
      const translateBtn = panel.querySelector('#tr-translate-btn')
      const resultsEl = panel.querySelector('#tr-results')
      let currentTranslations = []

      inputEl.addEventListener('input', () => {
        translateBtn.disabled = inputEl.value.trim().length === 0
      })

      translateBtn.addEventListener('click', () => runTranslate())

      async function runTranslate() {
        const text = inputEl.value.trim()
        if (!text) return
        translateBtn.disabled = true
        currentTranslations = []
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
            if (res.status === 429) showError('Try again in 60 seconds.')
            else if (res.status >= 500) {
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
        if (currentTranslations.length === 0) { resultsEl.innerHTML = ''; return }
        const cardListHtml = currentTranslations.map((t, i) =>
          renderResultCard(t, positionLabel(i, currentTranslations.length))
        ).join('')
        resultsEl.innerHTML = `
          <p class="translation-hint text-body2 text-center fg-secondary">Swipe or tap to add card</p>
          <div class="translation-card-list flex-col" id="tr-card-list">${cardListHtml}</div>
        `
        wireCardInteractions()
      }

      function removeCard(cardEl) {
        cardEl.classList.add('tr-card--removing')
        cardEl.addEventListener('transitionend', () => {
          cardEl.remove()
          const remaining = resultsEl.querySelectorAll('.tr-card:not(.tr-card--removing)')
          remaining.forEach((el, i) => {
            el.classList.remove('tr-card--top', 'tr-card--middle', 'tr-card--bottom', 'tr-card--only')
            el.classList.add(`tr-card--${positionLabel(i, remaining.length)}`)
          })
          if (remaining.length === 0) {
            currentTranslations = []
            resultsEl.innerHTML = ''
            inputEl.value = ''
            translateBtn.disabled = true
          }
        }, { once: true })
      }

      async function addCard(cardEl) {
        const text = cardEl.dataset.translationText
        const translation = cardEl.dataset.translation
        const lang = cardEl.dataset.lang || deck.lang
        const tokensAttr = cardEl.dataset.translationReadingTokens
        const reading = tokensAttr ? JSON.parse(tokensAttr) : cardEl.dataset.translationReading
        const card = { lang, text, reading, translation }
        try { await importCards([card], deck.id); onCardAdded && onCardAdded(card) }
        catch { /* best-effort */ }
        removeCard(cardEl)
      }

      function wireCardInteractions() {
        const cardList = resultsEl.querySelector('#tr-card-list')
        if (!cardList) return
        cardList.addEventListener('click', e => {
          const playBtn = e.target.closest('.tr-card-play')
          if (playBtn) {
            e.stopPropagation()
            const cardEl = playBtn.closest('.tr-card')
            if (cardEl) {
              const fakeCard = { text: cardEl.dataset.translationText, lang: cardEl.dataset.lang || deck.lang }
              speak(ttsText(fakeCard), fakeCard.lang)
            }
            return
          }
          const cardEl = e.target.closest('.tr-card')
          if (cardEl && (cardEl.classList.contains('tr-card--top') || cardEl.classList.contains('tr-card--only'))) {
            addCard(cardEl)
          }
        })
        wireCardSwipe(cardList, addCard)
      }

      panel.querySelector('.translation-back').addEventListener('click', sheet.close)
      requestAnimationFrame(() => inputEl.focus())
    },
  })
}

function wireCardSwipe(cardList, onCommitAdd) {
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
    if (!axis && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    if (axis !== 'h') return
    currentCardEl.style.transform = `translateX(${dx}px)`
    currentCardEl.dataset.swipeDir = dx > 0 ? 'right' : 'left'
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
    if (dx > 80) onCommitAdd(currentCardEl)
    else currentCardEl.style.transform = ''
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
