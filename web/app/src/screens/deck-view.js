import { db, getCards, getCardsByLang, getStarredCards, toggleCardStar, getDecks, getRecentDecks, updateDeckAccessTime, updateDeckMode, updateDeckName, updateDeckOrder, updateDeckReadingDisplay, deleteDeck, createDeck, importCards, exportAllData, restoreAllData, applyCardOrder, updateCard, deleteCard } from '../js/db.js'
import { DEFAULT_MODE } from '../js/modes.js'
import { decode as base64urlDecode } from '../js/base64url.js'
import { parseCardBatch } from '../js/import-parser.js'
import { speak, ttsText } from '../js/tts.js'

import { LANG_FLAGS, LANG_NAMES } from '../js/lang.js'
import { stripHashParam } from '../js/utils.js'
import { wireNavPaneGesture, wireRevealGesture } from '../js/gestures.js'
import { renderCardRow } from '../components/card.js'
import { openAddCardsPanel } from '../components/add-cards-panel.js'
import { openDeckSettings } from '../components/deck-settings.js'
import { openCardReview } from '../components/card-review.js'
import { openCardEditPanel } from '../components/card-edit-panel.js'
import { openJsonPanel, toImportJson } from '../components/json-panel.js'
import { openGenerateCardsPanel } from '../components/generate-cards-panel.js'
import { openTranslationPanel } from '../components/translation-panel.js'

const LAST_DECK_KEY = 'loudmouth.lastDeckId'

export function getLastDeckId() {
  try { return localStorage.getItem(LAST_DECK_KEY) } catch { return null }
}

export function setLastDeckId(deckId) {
  try { localStorage.setItem(LAST_DECK_KEY, deckId) } catch { /* ignore */ }
}

const dbOps = { db, getDecks, getRecentDecks, getCardsByLang, createDeck, importCards, exportAllData, restoreAllData }
const settingsOps = { updateDeckMode, updateDeckName, updateDeckOrder, updateDeckReadingDisplay, deleteDeck }

// ── Nav pane HTML builder ────────────────────────────────────────────────────

function renderDeckPickerRow(deck, cardCount) {
  const flag = LANG_FLAGS[deck.lang] ?? ''
  return `
    <div class="deck-picker-row flex items-center bg-surface tappable" data-deck-id="${deck.id}">
      <div class="deck-picker-row-info flex-col justify-center">
        <span class="deck-picker-row-name text-body">${deck.name}</span>
        <span class="deck-picker-row-meta text-secondary">${flag} · ${cardCount} cards</span>
      </div>
    </div>
  `
}

async function buildNavPaneContent() {
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
      ? renderDeckPickerRow({ id: `starred-${lang}`, name: '★ Starred', lang }, starredCount)
      : ''
    byLangHTML += `
      <div class="deck-picker-section-header flex items-baseline justify-between section-label">
        <span>${flag} ${name}</span>
        <span class="deck-picker-section-header-link text-secondary tappable" data-deck-id="lang:${lang}">All ${total} cards</span>
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
      <span class="panel-header-spacer"></span>
    </div>
    <div class="deck-picker-list flex-1">
      ${mostRecentHTML}
      ${byLangHTML}
      ${isEmpty ? '<p class="deck-picker-empty text-secondary">No decks yet.</p>' : ''}
    </div>
    <button class="nav-pane-add-fab flex items-center justify-center bg-accent text-surface shrink-0 tappable" aria-label="Add deck">＋</button>
  `
}

// ── Main render ──────────────────────────────────────────────────────────────

export function renderDeckView(el, params) {
  async function init() {
    if (params.cards) {
      const jsonStr = base64urlDecode(params.cards)
      if (jsonStr === null) {
        el.innerHTML = `
          <div class="screen flex-1 flex-col bg-primary" id="deck-view-screen">
            <div class="deck-view-empty text-secondary">
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
          <div class="screen flex-1 flex-col bg-primary" id="deck-view-screen">
            <div class="deck-view-empty text-secondary">
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
        <div class="screen flex-1 flex-col bg-primary" id="deck-view-screen">
          <div class="deck-view-empty text-secondary">
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
        <div class="nav-pane flex-col bg-primary" id="nav-pane"></div>
        <div class="nav-main flex-col bg-primary" id="nav-main">
          <div class="nav-main-scrim" id="nav-main-scrim"></div>
          <div class="screen flex-1 flex-col bg-primary" id="deck-view-screen"></div>
        </div>
      </div>
    `

    const navPaneEl = el.querySelector('#nav-pane')
    const navMainEl = el.querySelector('#nav-main')
    const scrimEl = el.querySelector('#nav-main-scrim')
    const screenEl = el.querySelector('#deck-view-screen')

    // Populate nav pane
    navPaneEl.innerHTML = await buildNavPaneContent()

    // Wire nav pane gesture
    const navPane = wireNavPaneGesture(navMainEl, () => {}, () => {})

    // Scrim tap closes nav pane
    scrimEl.addEventListener('click', () => navPane.close())

    // Nav pane deck selection
    navPaneEl.querySelector('.deck-picker-list').addEventListener('click', async e => {
      const row = e.target.closest('[data-deck-id]')
      if (!row) return
      navPane.close()
      await selectDeck(row.dataset.deckId)
    })

    navPaneEl.querySelector('.nav-pane-add-fab').addEventListener('click', () => openGenerateCards())

    // ── Load deck content ────────────────────────────────────────────────────

    async function selectDeck(newDeckId) {
      setLastDeckId(newDeckId)
      if (!newDeckId.startsWith('lang:') && !newDeckId.startsWith('starred-')) {
        await updateDeckAccessTime(newDeckId)
      }
      deckId = newDeckId
      await loadDeck()
    }

    async function refreshNavPane() {
      navPaneEl.innerHTML = await buildNavPaneContent()
      navPaneEl.querySelector('.deck-picker-list').addEventListener('click', async e => {
        const row = e.target.closest('[data-deck-id]')
        if (!row) return
        navPane.close()
        await selectDeck(row.dataset.deckId)
      })
      navPaneEl.querySelector('.nav-pane-add-fab').addEventListener('click', () => openGenerateCards())
    }

    function openGenerateCards() {
      openGenerateCardsPanel(el, { createDeck, importCards }, async (newDeckId) => {
        await refreshNavPane()
        navPane.close()
        await selectDeck(newDeckId)
      })
    }

    async function loadDeck() {
      if (!deckId) {
        screenEl.innerHTML = `
          <div class="deck-view-empty text-secondary">
            <p>No decks yet.</p>
            <button id="btn-import-cards" class="btn btn-primary">Import cards</button>
          </div>
        `
        screenEl.querySelector('#btn-import-cards').addEventListener('click', () => openGenerateCards())
        return
      }

      let deck, cards, isStarredView = false
      if (deckId.startsWith('lang:')) {
        const lang = deckId.slice(5)
        cards = await getCardsByLang(lang)
        const langName = LANG_NAMES[lang] ?? lang.toUpperCase()
        deck = { id: deckId, name: `All ${langName} Cards`, lang, mode: DEFAULT_MODE, order: 'default', system: true }
      } else if (deckId.startsWith('starred-')) {
        isStarredView = true
        const lang = deckId.slice(8)
        cards = await getStarredCards(lang)
        const langName = LANG_NAMES[lang] ?? lang.toUpperCase()
        deck = { id: deckId, name: `★ Starred ${langName}`, lang, mode: DEFAULT_MODE, order: 'default', system: true }
      } else {
        deck = await db.decks.get(deckId)
        if (!deck) {
          screenEl.innerHTML = `
            <div class="deck-view-empty text-secondary">
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
        <div class="panel-header flex items-center">
          <button class="panel-header-back" id="btn-menu" aria-label="Menu">☰</button>
          <button class="panel-header-title" id="btn-deck-title">${deck.name}</button>
          ${isLangView
            ? '<span class="panel-header-spacer"></span>'
            : `<button class="panel-header-right" id="btn-deck-add" aria-label="Translate">＋</button>
               <button class="panel-header-right deck-header-done" id="btn-deck-done">Done</button>`}
        </div>
        <div class="deck-view-list flex-1 flex-col min-h-0">
          ${cards.length === 0
            ? `<div class="deck-view-empty text-secondary"><p>No cards in this deck.</p></div>`
            : cards.map(card => renderCardRow(card, deck.readingDisplay)).join('')}
        </div>
      `

      const listEl = screenEl.querySelector('.deck-view-list')
      const editOps = { updateCard, deleteCard }
      const reveal = wireRevealGesture(listEl, '.card-row-wrapper', '.card-row')

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
          if (list) list.innerHTML = `<div class="deck-view-empty text-secondary"><p>No cards in this deck.</p></div>`
        }
      }

      listEl.addEventListener('click', async e => {
        const starBtn = e.target.closest('.card-row-star-btn')
        if (starBtn) {
          reveal.reset()
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
          reveal.reset()
          const card = cards.find(c => String(c.id) === editBtn.dataset.cardId)
          if (card) openCardEditPanel(el, card, editOps, onSaveCard, onDeleteCard)
          return
        }

        const wrapper = e.target.closest('.card-row-wrapper')
        if (wrapper && wrapper.classList.contains('card-row-wrapper--swiped')) {
          reveal.reset()
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

      screenEl.querySelector('#btn-menu').addEventListener('click', () => navPane.open())

      function closeTitleMenu() {
        document.getElementById('deck-title-menu')?.remove()
      }

      function showTitleMenu(anchor) {
        const rect = anchor.getBoundingClientRect()
        const menu = document.createElement('div')
        menu.id = 'deck-title-menu'
        menu.className = 'deck-title-menu bg-surface'
        menu.style.top = (rect.bottom + 4) + 'px'
        menu.innerHTML = `
          <button class="deck-title-menu-item bg-none text-body tappable" id="dtm-settings">Settings</button>
          <button class="deck-title-menu-item bg-none text-body tappable" id="dtm-edit">Edit cards</button>
        `
        document.body.appendChild(menu)
        requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('deck-title-menu--visible')))
        menu.querySelector('#dtm-settings').addEventListener('click', () => {
          closeTitleMenu()
          openDeckSettings(
            el, deck,
            { ...settingsOps, exportJson: () => openJsonPanel(el, deck.name, toImportJson(cards)) },
            async (changes) => {
              if (changes.deleted) { deckId = null; await refreshNavPane() }
              else { await refreshNavPane() }
              await loadDeck()
            }
          )
        })
        menu.querySelector('#dtm-edit').addEventListener('click', () => {
          closeTitleMenu()
          screenEl.dataset.editMode = ''
        })
        setTimeout(() => document.addEventListener('click', closeTitleMenu, { once: true, capture: true }), 0)
      }

      const titleBtn = screenEl.querySelector('#btn-deck-title')
      if (isLangView) {
        titleBtn.addEventListener('click', () => navPane.open())
      } else {
        titleBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          if (document.getElementById('deck-title-menu')) { closeTitleMenu(); return }
          showTitleMenu(titleBtn)
        })
        screenEl.querySelector('#btn-deck-done').addEventListener('click', () => {
          delete screenEl.dataset.editMode
        })
      }

      if (!isLangView) {
        screenEl.querySelector('#btn-deck-add').addEventListener('click', () => {
          openTranslationPanel(el, deck, { importCards }, (addedCard) => {
            cards.push(addedCard)
            const list = screenEl.querySelector('.deck-view-list')
            if (list) {
              // Remove empty state if present
              const empty = list.querySelector('.deck-view-empty')
              if (empty) empty.remove()
              const tmp = document.createElement('div')
              tmp.innerHTML = renderCardRow(addedCard, deck.readingDisplay)
              list.appendChild(tmp.firstElementChild)
            }
          })
        })
      }
    }

    await loadDeck()
  }

  init()
}
