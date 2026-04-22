import { db, getCards, getCardsByLang, getStarredCards, toggleCardStar, getDecks, getRecentDecks, updateDeckAccessTime, updateDeckMode, updateDeckName, updateDeckOrder, updateDeckReadingDisplay, deleteDeck, createDeck, importCards, exportAllData, restoreAllData, applyCardOrder, updateCard, deleteCard } from '../js/db.js'
import { DEFAULT_MODE } from '../js/modes.js'
import { decode as base64urlDecode } from '../js/base64url.js'
import { parseCardBatch } from '../js/import-parser.js'
import { speak, ttsText } from '../js/tts.js'

import { renderCardRow } from '../components/card.js'
import { LANG_FLAGS, LANG_NAMES } from '../components/deck-picker.js'
import { openAddCardsPanel } from '../components/add-cards-panel.js'
import { openDeckSettings } from '../components/deck-settings.js'
import { openCardReview } from '../components/card-review.js'
import { openCardEditPanel } from '../components/card-edit-panel.js'
import { openJsonPanel, toImportJson } from '../components/json-panel.js'

const LAST_DECK_KEY = 'loudmouth.lastDeckId'

export function getLastDeckId() {
  return localStorage.getItem(LAST_DECK_KEY)
}

export function setLastDeckId(deckId) {
  localStorage.setItem(LAST_DECK_KEY, deckId)
}

const dbOps = { db, getDecks, getRecentDecks, getCardsByLang, createDeck, importCards, exportAllData, restoreAllData }
const settingsOps = { updateDeckMode, updateDeckName, updateDeckOrder, updateDeckReadingDisplay, deleteDeck }

function stripHashParam(param) {
  const raw = window.location.hash.slice(1) || 'deck'
  const [route, qstring] = raw.split('?')
  const p = new URLSearchParams(qstring || '')
  p.delete(param)
  const remaining = p.toString()
  window.location.hash = remaining ? `${route}?${remaining}` : route
}

// ── Drawer HTML builder ──────────────────────────────────────────────────────

function renderDeckPickerRow(deck, cardCount) {
  const flag = LANG_FLAGS[deck.lang] ?? ''
  return `
    <div class="deck-picker-row" data-deck-id="${deck.id}">
      <div class="deck-picker-row-info">
        <span class="deck-picker-row-name">${deck.name}</span>
        <span class="deck-picker-row-meta">${flag} · ${cardCount} cards</span>
      </div>
    </div>
  `
}

async function buildDrawerContent() {
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

  const allLangs = [...new Set(allCards.map(c => c.lang))].sort()
  for (const lang of allLangs) {
    if (!byLang[lang]) byLang[lang] = []
  }

  const langCardCounts = {}
  const starredCounts = {}
  for (const lang of Object.keys(byLang)) {
    const langCards = await getCardsByLang(lang)
    langCardCounts[lang] = langCards.length
    starredCounts[lang] = langCards.filter(c => c.state?.starredAt).length
  }

  let mostRecentHTML = ''
  if (recentDecks.length > 0) {
    mostRecentHTML = `
      <div class="deck-picker-section-header">Most Recent</div>
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
      ? renderDeckPickerRow({ id: `starred-${lang}`, name: '★ Starred', lang }, starredCount)
      : ''
    byLangHTML += `
      <div class="deck-picker-section-header">
        <span>${flag} ${name}</span>
        <span class="deck-picker-section-header-link" data-deck-id="lang:${lang}">All ${total} cards</span>
      </div>
      <div class="deck-picker-lang-group">
        ${starredRow}
        ${decks.map(d => renderDeckPickerRow(d, cardCount(d.id))).join('')}
      </div>
    `
  }

  const isEmpty = allDecks.length === 0 && allLangs.length === 0

  return `
    <div class="panel-header">
      <span class="panel-header-spacer"></span>
      <span class="panel-header-title">Decks</span>
      <button class="panel-header-right nav-drawer-add-btn" aria-label="Add">＋</button>
    </div>
    <div class="deck-picker-list">
      ${mostRecentHTML}
      ${byLangHTML}
      ${isEmpty ? '<p class="deck-picker-empty">No decks yet.</p>' : ''}
    </div>
  `
}

// ── Nav shell gesture (swipe-right to open drawer) ───────────────────────────

function wireDrawerGesture(navMainEl, onOpen, onClose) {
  const DRAWER_WIDTH = 280
  const OPEN_THRESHOLD = 100
  let startX = null
  let startY = null
  let axis = null
  let isOpen = false

  function setOpen(open, animate = true) {
    isOpen = open
    if (!animate) navMainEl.dataset.dragging = ''
    if (open) {
      navMainEl.classList.add('nav-main--open')
      onOpen()
    } else {
      navMainEl.classList.remove('nav-main--open')
      onClose()
    }
    if (!animate) {
      requestAnimationFrame(() => delete navMainEl.dataset.dragging)
    }
  }

  navMainEl.addEventListener('touchstart', e => {
    // Don't capture if a panel or the scrim is the target
    if (e.target.closest('.panel-screen') || e.target.closest('.nav-main-scrim')) return
    // Don't start a new gesture if the drawer is open (scrim handles closing)
    if (isOpen) return
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    axis = null
  }, { passive: true })

  navMainEl.addEventListener('touchmove', e => {
    if (startX === null) return
    const dx = e.touches[0].clientX - startX
    const dy = e.touches[0].clientY - startY

    if (!axis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
      axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (axis !== 'h') return

    // Only swipe-right to open (dx > 0) or swipe-left to close (dx < 0 when open)
    if (!isOpen && dx < 0) return
    if (isOpen && dx > 0) return

    const base = isOpen ? DRAWER_WIDTH : 0
    const raw = base + dx
    const clamped = Math.max(0, Math.min(DRAWER_WIDTH, raw))
    navMainEl.dataset.dragging = ''
    navMainEl.style.transform = `translateX(${clamped}px)`
    // Sync scrim opacity
    const scrim = navMainEl.querySelector('.nav-main-scrim')
    if (scrim) scrim.style.opacity = clamped / DRAWER_WIDTH
  }, { passive: false })

  navMainEl.addEventListener('touchend', e => {
    if (startX === null) return
    const dx = e.changedTouches[0].clientX - startX
    delete navMainEl.dataset.dragging
    navMainEl.style.transform = ''
    const scrim = navMainEl.querySelector('.nav-main-scrim')
    if (scrim) scrim.style.opacity = ''
    startX = null

    if (axis !== 'h') return

    if (!isOpen && dx >= OPEN_THRESHOLD) {
      setOpen(true)
    } else if (isOpen && dx <= -OPEN_THRESHOLD) {
      setOpen(false)
    }
    // else stays in current state — CSS class drives final position
    axis = null
  }, { passive: true })

  navMainEl.addEventListener('touchcancel', () => {
    if (startX === null) return
    delete navMainEl.dataset.dragging
    navMainEl.style.transform = ''
    const scrim = navMainEl.querySelector('.nav-main-scrim')
    if (scrim) scrim.style.opacity = ''
    startX = null
    axis = null
  }, { passive: true })

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
  }
}

// ── Main render ──────────────────────────────────────────────────────────────

export function renderDeckView(el, params) {
  async function init() {
    if (params.cards) {
      const jsonStr = base64urlDecode(params.cards)
      if (jsonStr === null) {
        el.innerHTML = `
          <div class="screen" id="deck-view-screen">
            <div class="deck-view-empty">
              <p class="uri-import-error">
                Import link is invalid — could not decode the card data.
              </p>
            </div>
          </div>
        `
        stripHashParam('cards')
        return
      }
      const result = parseCardBatch(jsonStr)
      if (result.cards.length === 0) {
        el.innerHTML = `
          <div class="screen" id="deck-view-screen">
            <div class="deck-view-empty">
              <p class="uri-import-error">
                Import link contained no valid cards.
              </p>
            </div>
          </div>
        `
        stripHashParam('cards')
        return
      }
      let deckId = params.id || getLastDeckId()
      if (!deckId) {
        const recent = await getRecentDecks(1)
        deckId = recent[0]?.id ?? null
      }
      el.innerHTML = `
        <div class="screen" id="deck-view-screen">
          <div class="deck-view-empty">
            <p>Review your cards below before importing.</p>
          </div>
        </div>
      `
      openAddCardsPanel(
        el,
        () => {},
        (importedDeckId) => {
          const dest = importedDeckId || deckId
          window.location.hash = dest ? `deck?id=${dest}` : 'deck'
        },
        dbOps,
        { initialCards: result.cards, initialErrors: result.errors, fromUri: true }
      )
      return
    }

    let deckId = params.id || getLastDeckId()
    if (!deckId) {
      const recent = await getRecentDecks(1)
      deckId = recent[0]?.id ?? null
    }

    // ── Build nav shell ──────────────────────────────────────────────────────

    el.innerHTML = `
      <div class="nav-shell">
        <div class="nav-drawer" id="nav-drawer"></div>
        <div class="nav-main" id="nav-main">
          <div class="nav-main-scrim" id="nav-main-scrim"></div>
          <div class="screen" id="deck-view-screen"></div>
        </div>
      </div>
    `

    const drawerEl = el.querySelector('#nav-drawer')
    const navMainEl = el.querySelector('#nav-main')
    const scrimEl = el.querySelector('#nav-main-scrim')
    const screenEl = el.querySelector('#deck-view-screen')

    // Populate drawer
    drawerEl.innerHTML = await buildDrawerContent()

    // Wire drawer gesture
    const drawer = wireDrawerGesture(navMainEl, () => {}, () => {})

    // Scrim tap closes drawer
    scrimEl.addEventListener('click', () => drawer.close())

    // Drawer deck selection
    drawerEl.querySelector('.deck-picker-list').addEventListener('click', async e => {
      const row = e.target.closest('[data-deck-id]')
      if (!row) return
      drawer.close()
      await selectDeck(row.dataset.deckId)
    })

    drawerEl.querySelector('.nav-drawer-add-btn').addEventListener('click', () => openAdd())

    // ── Load deck content ────────────────────────────────────────────────────

    async function selectDeck(newDeckId) {
      setLastDeckId(newDeckId)
      if (!newDeckId.startsWith('lang:') && !newDeckId.startsWith('starred-')) {
        await updateDeckAccessTime(newDeckId)
      }
      deckId = newDeckId
      await loadDeck()
    }

    function openAdd() {
      openAddCardsPanel(el, () => {}, async (importedDeckId) => {
        if (importedDeckId) await selectDeck(importedDeckId)
        // Refresh drawer
        drawerEl.innerHTML = await buildDrawerContent()
        drawerEl.querySelector('.deck-picker-list').addEventListener('click', async e => {
          const row = e.target.closest('[data-deck-id]')
          if (!row) return
          drawer.close()
          await selectDeck(row.dataset.deckId)
        })
        drawerEl.querySelector('.nav-drawer-add-btn').addEventListener('click', () => openAdd())
      }, dbOps)
    }

    async function loadDeck() {
      if (!deckId) {
        screenEl.innerHTML = `
          <div class="deck-view-empty">
            <p>No decks yet.</p>
            <button id="btn-import-cards" class="btn btn-primary">Import cards</button>
          </div>
        `
        screenEl.querySelector('#btn-import-cards').addEventListener('click', () => openAdd())
        return
      }

      const LANG_NAMES_LOCAL = { zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', ru: 'Russian' }

      let deck, cards, isStarredView = false
      if (deckId.startsWith('lang:')) {
        const lang = deckId.slice(5)
        cards = await getCardsByLang(lang)
        const langName = LANG_NAMES_LOCAL[lang] ?? lang.toUpperCase()
        deck = { id: deckId, name: `All ${langName} Cards`, lang, mode: DEFAULT_MODE, order: 'default', system: true }
      } else if (deckId.startsWith('starred-')) {
        isStarredView = true
        const lang = deckId.slice(8)
        cards = await getStarredCards(lang)
        const langName = LANG_NAMES_LOCAL[lang] ?? lang.toUpperCase()
        deck = { id: deckId, name: `★ Starred ${langName}`, lang, mode: DEFAULT_MODE, order: 'default', system: true }
      } else {
        deck = await db.decks.get(deckId)
        if (!deck) {
          screenEl.innerHTML = `
            <div class="deck-view-empty">
              <p>Deck not found.</p>
            </div>
          `
          return
        }
        cards = await getCards(deckId)
      }

      if (!isStarredView) {
        cards = applyCardOrder(cards, deck.order || 'default')
      }

      const isLangView = deckId.startsWith('lang:') || isStarredView

      el.dataset.mode = deck.mode
      screenEl.innerHTML = `
        <div class="panel-header">
          <button class="panel-header-back" id="btn-menu" aria-label="Menu">☰</button>
          <button class="panel-header-title" id="btn-deck-title">${deck.name}</button>
          ${isLangView ? '<span class="panel-header-spacer"></span>' : '<button class="panel-header-right" id="btn-deck-settings" aria-label="Settings">⚙</button>'}
        </div>
        <div class="deck-view-list">
          ${cards.length === 0
            ? `<div class="deck-view-empty"><p>No cards in this deck.</p></div>`
            : cards.map(card => renderCardRow(card, deck.readingDisplay)).join('')}
        </div>
      `

      const listEl = screenEl.querySelector('.deck-view-list')
      const editOps = { updateCard, deleteCard }
      let activeSwiped = null

      function onSaveCard(updatedCard) {
        const idx = cards.findIndex(c => String(c.id) === String(updatedCard.id))
        if (idx >= 0) cards[idx] = updatedCard
        const wrapperEl = screenEl.querySelector(`.card-row-wrapper[data-card-id="${updatedCard.id}"]`)
        if (wrapperEl) {
          const tmp = document.createElement('div')
          tmp.innerHTML = renderCardRow(updatedCard, deck.readingDisplay)
          wrapperEl.replaceWith(tmp.firstElementChild)
        }
      }

      function onDeleteCard(cardId) {
        const idx = cards.findIndex(c => String(c.id) === String(cardId))
        if (idx >= 0) cards.splice(idx, 1)
        const wrapperEl = screenEl.querySelector(`.card-row-wrapper[data-card-id="${cardId}"]`)
        if (wrapperEl) wrapperEl.remove()
        if (cards.length === 0) {
          const list = screenEl.querySelector('.deck-view-list')
          if (list) list.innerHTML = `<div class="deck-view-empty"><p>No cards in this deck.</p></div>`
        }
      }

      listEl.addEventListener('click', async e => {
        const starBtn = e.target.closest('.card-row-star-btn')
        if (starBtn) {
          const wrapper = starBtn.closest('.card-row-wrapper')
          if (wrapper) {
            wrapper.classList.remove('card-row-wrapper--swiped')
            activeSwiped = null
          }
          const cardId = starBtn.dataset.cardId
          const cardIdx = cards.findIndex(c => String(c.id) === cardId)
          if (cardIdx >= 0) {
            const nowStarred = await toggleCardStar(cardId)
            const updatedCard = { ...cards[cardIdx], state: { ...(cards[cardIdx].state || {}), starredAt: nowStarred ? new Date().toISOString() : null } }
            if (isStarredView && !nowStarred) {
              onDeleteCard(cardId)
            } else {
              onSaveCard(updatedCard)
            }
          }
          return
        }

        const editBtn = e.target.closest('.card-row-edit-btn')
        if (editBtn) {
          const wrapper = editBtn.closest('.card-row-wrapper')
          if (wrapper) {
            wrapper.classList.remove('card-row-wrapper--swiped')
            activeSwiped = null
          }
          const card = cards.find(c => String(c.id) === editBtn.dataset.cardId)
          if (card) openCardEditPanel(el, card, editOps, onSaveCard, onDeleteCard)
          return
        }

        const wrapper = e.target.closest('.card-row-wrapper')
        if (wrapper && wrapper.classList.contains('card-row-wrapper--swiped')) {
          wrapper.classList.remove('card-row-wrapper--swiped')
          activeSwiped = null
          return
        }

        const playBtn = e.target.closest('.card-row-play')
        if (playBtn) {
          e.stopPropagation()
          const card = cards.find(c => String(c.id) === playBtn.dataset.cardId)
          if (card) speak(ttsText(card), card.lang)
          return
        }

        const row = e.target.closest('.card-row')
        if (!row) return
        const idx = cards.findIndex(c => String(c.id) === row.dataset.cardId)
        openCardReview(el, cards, deck, idx < 0 ? 0 : idx)
      })

      // Swipe-to-reveal edit button
      const SWIPE_REVEAL_WIDTH = 160
      const SWIPE_COMMIT_THRESHOLD = 80
      let swipeStartX = 0
      let swipeStartY = 0
      let swipeTarget = null
      let swipeAxis = null

      listEl.addEventListener('touchstart', e => {
        const wrapper = e.target.closest('.card-row-wrapper')
        if (!wrapper) return
        swipeStartX = e.touches[0].clientX
        swipeStartY = e.touches[0].clientY
        swipeTarget = wrapper
        swipeAxis = null
        const row = wrapper.querySelector('.card-row')
        row.dataset.dragging = ''
      }, { passive: true })

      listEl.addEventListener('touchmove', e => {
        if (!swipeTarget) return
        const dx = e.touches[0].clientX - swipeStartX
        const dy = e.touches[0].clientY - swipeStartY

        if (!swipeAxis) {
          if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
          swipeAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
        }

        if (swipeAxis !== 'h') return
        e.preventDefault()

        const isSwiped = swipeTarget.classList.contains('card-row-wrapper--swiped')
        const base = isSwiped ? -SWIPE_REVEAL_WIDTH : 0
        const raw = base + dx
        const clamped = Math.max(-SWIPE_REVEAL_WIDTH, Math.min(0, raw))
        swipeTarget.querySelector('.card-row').style.transform = `translateX(${clamped}px)`
      }, { passive: false })

      listEl.addEventListener('touchend', e => {
        if (!swipeTarget) return
        const row = swipeTarget.querySelector('.card-row')
        delete row.dataset.dragging

        if (swipeAxis === 'h') {
          const dx = e.changedTouches[0].clientX - swipeStartX
          const isSwiped = swipeTarget.classList.contains('card-row-wrapper--swiped')
          const base = isSwiped ? -SWIPE_REVEAL_WIDTH : 0
          const net = base + dx

          if (net < -SWIPE_COMMIT_THRESHOLD) {
            if (activeSwiped && activeSwiped !== swipeTarget) {
              activeSwiped.classList.remove('card-row-wrapper--swiped')
              activeSwiped.querySelector('.card-row').style.transform = ''
            }
            swipeTarget.classList.add('card-row-wrapper--swiped')
            activeSwiped = swipeTarget
          } else {
            swipeTarget.classList.remove('card-row-wrapper--swiped')
            if (activeSwiped === swipeTarget) activeSwiped = null
          }
          row.style.transform = ''
        }

        swipeTarget = null
        swipeAxis = null
      })

      listEl.addEventListener('touchcancel', () => {
        if (!swipeTarget) return
        const row = swipeTarget.querySelector('.card-row')
        delete row.dataset.dragging
        row.style.transform = ''
        swipeTarget = null
        swipeAxis = null
      })

      screenEl.querySelector('#btn-menu').addEventListener('click', () => drawer.open())

      screenEl.querySelector('#btn-deck-title').addEventListener('click', () => drawer.open())

      if (!isLangView) {
        screenEl.querySelector('#btn-deck-settings').addEventListener('click', () => {
          const deckSettingsOps = { ...settingsOps, exportJson: () => openJsonPanel(el, 'Deck JSON', toImportJson(cards)) }
          openDeckSettings(el, deck, deckSettingsOps, async (changes) => {
            if (changes.deleted) {
              localStorage.removeItem(LAST_DECK_KEY)
              deckId = null
              await loadDeck()
              return
            }
            if (changes.name) {
              screenEl.querySelector('#btn-deck-title').textContent = changes.name
              deck.name = changes.name
            }
            if (changes.mode) {
              deck.mode = changes.mode
              el.dataset.mode = changes.mode
            }
            if (changes.order) {
              deck.order = changes.order
              cards = applyCardOrder(cards, changes.order)
              const list = screenEl.querySelector('.deck-view-list')
              if (list) {
                list.innerHTML = cards.length === 0
                  ? `<div class="deck-view-empty"><p>No cards in this deck.</p></div>`
                  : cards.map(card => renderCardRow(card, deck.readingDisplay)).join('')
              }
            }
            if (changes.readingDisplay) {
              deck.readingDisplay = changes.readingDisplay
              const list = screenEl.querySelector('.deck-view-list')
              if (list) {
                list.innerHTML = cards.length === 0
                  ? `<div class="deck-view-empty"><p>No cards in this deck.</p></div>`
                  : cards.map(card => renderCardRow(card, deck.readingDisplay)).join('')
              }
            }
          })
        })
      }
    }

    await loadDeck()
  }

  init()
}
