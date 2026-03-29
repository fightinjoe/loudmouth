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

export async function openDeckPicker(appEl, { db, getDecks, getRecentDecks }, onSelectDeck, onAddCards) {
  const allDecks = await getDecks(null, { includeSystem: false })
  const recentDecks = await getRecentDecks(2)
  const allCards = await db.cards.toArray()
  function cardCount(deckId) {
    return allCards.filter(c => c.deckIds && c.deckIds.includes(deckId)).length
  }

  const recentIds = new Set(recentDecks.map(d => d.id))
  const remaining = allDecks.filter(d => !recentIds.has(d.id))

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
  panel.className = 'deck-picker-panel panel-screen'
  panel.innerHTML = `
    <div class="panel-header">
      <button class="panel-header-back" aria-label="Back">‹</button>
      <span class="panel-header-title">Language decks</span>
      <button class="panel-header-right" aria-label="Add">＋</button>
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
      panel.classList.add('panel-screen--visible')
    })
  })

  function close() {
    panel.classList.remove('panel-screen--visible')
    panel.addEventListener('transitionend', () => panel.remove(), { once: true })
  }

  panel.querySelector('.panel-header-back').addEventListener('click', close)

  panel.querySelector('.deck-picker-list').addEventListener('click', e => {
    const row = e.target.closest('.deck-picker-row')
    if (!row) return
    const deckId = row.dataset.deckId
    close()
    onSelectDeck(deckId)
  })

  panel.querySelector('.deck-picker-add').addEventListener('click', () => {
    if (onAddCards) onAddCards(close)
  })
}
