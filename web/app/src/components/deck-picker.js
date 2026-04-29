import { LANG_FLAGS, LANG_NAMES } from '../js/lang.js'
import { relativeTime } from '../js/utils.js'
export { LANG_FLAGS, LANG_NAMES }

function renderDeckPickerRow(deck, cardCount) {
  const ts = relativeTime(deck.lastAccessedAt ?? deck.createdAt)
  const flag = LANG_FLAGS[deck.lang] ?? ''
  return `
    <div class="deck-picker-row flex items-center bg-surface tappable" data-deck-id="${deck.id}">
      <div class="deck-picker-row-info flex-col justify-center">
        <span class="deck-picker-row-name text-body1 font-semibold fg-body">${deck.name}</span>
        <span class="deck-picker-row-meta text-body2 fg-secondary">${ts} · <span class="deck-picker-row-flag">${flag} ·</span> ${cardCount} cards</span>
      </div>
    </div>
  `
}

export async function openDeckPicker(appEl, { db, getDecks, getRecentDecks, getCardsByLang }, onSelectDeck, onAddCards) {
  const allDecks = await getDecks(null, { includeSystem: false })
  const recentDecks = await getRecentDecks(3)
  const allCards = await db.cards.toArray()
  function cardCount(deckId) {
    return allCards.filter(c => c.deckIds && c.deckIds.includes(deckId)).length
  }

  const byLang = {}
  for (const deck of allDecks) {
    ;(byLang[deck.lang] ??= []).push(deck)
  }
  for (const lang of Object.keys(byLang)) {
    byLang[lang].sort((a, b) => a.name.localeCompare(b.name))
  }

  // Collect all langs that have cards (including those without decks)
  const allLangs = [...new Set(allCards.map(c => c.lang))].sort()
  for (const lang of allLangs) {
    if (!byLang[lang]) byLang[lang] = []
  }

  // Also include langs from remaining decks already added above
  const langCardCounts = {}
  const starredCounts = {}
  if (getCardsByLang) {
    for (const lang of Object.keys(byLang)) {
      const langCards = await getCardsByLang(lang)
      langCardCounts[lang] = langCards.length
      starredCounts[lang] = langCards.filter(c => c.state?.starredAt).length
    }
  } else {
    for (const lang of Object.keys(byLang)) {
      langCardCounts[lang] = allCards.filter(c => c.lang === lang).length
      starredCounts[lang] = allCards.filter(c => c.lang === lang && c.state?.starredAt).length
    }
  }

  let mostRecentHTML = ''
  if (recentDecks.length > 0) {
    mostRecentHTML = `
      <div class="deck-picker-section-header flex items-baseline justify-between section-label">Most Recent</div>
      ${recentDecks.map(d => renderDeckPickerRow(d, cardCount(d.id))).join('')}
    `
  }

  let byLangHTML = ''
  for (const [lang, decks] of Object.entries(byLang).sort(([a], [b]) => a.localeCompare(b))) {
    const flag = LANG_FLAGS[lang] ?? ''
    const name = LANG_NAMES[lang] ?? lang.toUpperCase()
    const total = langCardCounts[lang] ?? 0
    const starredCount = starredCounts[lang] ?? 0
    const starredRow = starredCount > 0
      ? renderDeckPickerRow({ id: `starred-${lang}`, name: '★ Starred', lang, lastAccessedAt: null, createdAt: null }, starredCount)
      : ''
    byLangHTML += `
      <div class="deck-picker-section-header flex items-baseline justify-between section-label">
        <span>${flag} ${name}</span>
        <span class="deck-picker-section-header-link text-body2 fg-secondary tappable" data-deck-id="lang:${lang}">All ${total} cards</span>
      </div>
      <div class="deck-picker-lang-group">
        ${starredRow}
        ${decks.map(d => renderDeckPickerRow(d, cardCount(d.id))).join('')}
      </div>
    `
  }

  const panel = document.createElement('div')
  panel.className = 'deck-picker-panel panel-screen fixed-inset bg-primary flex-col transition-sheet'
  panel.innerHTML = `
    <div class="panel-header flex items-center">
      <button class="panel-header-back fg-accent text-icon flex items-center justify-center shrink-0" aria-label="Back">‹</button>
      <span class="panel-header-title flex-1 text-center text-header font-semibold fg-body bg-none">Language decks</span>
      <button class="panel-header-right fg-accent text-icon flex items-center justify-center shrink-0" aria-label="Add">＋</button>
    </div>
    <div class="deck-picker-list flex-1 overflow-y-auto">
      ${mostRecentHTML}
      ${byLangHTML}
      ${allDecks.length === 0 && allLangs.length === 0 ? '<p class="deck-picker-empty text-center fg-secondary">No decks yet.</p>' : ''}
    </div>
  `
  appEl.appendChild(panel)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('panel-screen--visible')
    })
  })

  function close() {
    panel.classList.remove('panel-screen--visible')
    panel.addEventListener('transitionend', () => panel.remove(), { once: true })
  }

  panel.querySelector('.panel-header-back').addEventListener('click', close)

  panel.querySelector('.deck-picker-list').addEventListener('click', e => {
    const row = e.target.closest('[data-deck-id]')
    if (!row) return
    const deckId = row.dataset.deckId
    close()
    onSelectDeck(deckId)
  })

  panel.querySelector('.panel-header-right').addEventListener('click', () => {
    if (onAddCards) onAddCards(close)
  })
}
