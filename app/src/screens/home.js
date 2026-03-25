import '../styles/home.css'
import { getDecks, getCards, getLangs } from '../db.js'

const LANG_LABELS = { zh: 'Chinese', ja: 'Japanese' }

function langLabel(lang) {
  return LANG_LABELS[lang] || lang.toUpperCase()
}

export function renderHome(el, params) {
  let lang = null
  let langs = []

  async function render() {
    langs = await getLangs()

    if (langs.length === 0) {
      // No cards at all — empty state
      el.innerHTML = `
        <div class="screen" id="home-screen">
          <div class="home-content">
            <div class="empty-state">
              <div class="empty-icon">📚</div>
              <h2>No decks yet</h2>
              <p>Import a card batch to get started.</p>
            </div>
          </div>
          <a class="home-fab" href="#import" aria-label="Import cards">+</a>
          <a class="home-fab home-fab-export" href="#export" aria-label="Export and restore">↓</a>
        </div>
      `
      return
    }

    if (!lang || !langs.includes(lang)) lang = langs[0]

    const userDecks = await getDecks(lang)

    // Virtual All Cards deck for this language
    const allVirtual = { id: `all-${lang}`, name: `All ${langLabel(lang)} Cards`, system: true }

    const allCards = await getCards(allVirtual.id)
    const sorted = [allVirtual, ...userDecks]
    const counts = [allCards.length, ...await Promise.all(userDecks.map(d => getCards(d.id).then(c => c.length)))]

    el.innerHTML = `
      <div class="screen" id="home-screen">
        <div class="lang-tabs">
          ${langs.map(l => `
            <button class="lang-tab${l === lang ? ' active' : ''}" data-lang="${l}">
              ${langLabel(l)}
            </button>
          `).join('')}
        </div>
        <div class="home-content">
          ${sorted.length === 0 ? `
            <div class="empty-state">
              <div class="empty-icon">📚</div>
              <h2>No ${langLabel(lang)} decks yet</h2>
              <p>Import a card batch to get started.</p>
            </div>
          ` : `
            <div class="deck-list">
              ${sorted.map((d, i) => `
                <div class="deck-card" data-deck-id="${d.id}">
                  <div class="deck-card-body">
                    <div class="deck-name">${d.name}</div>
                    <div class="deck-count">${counts[i]} card${counts[i] === 1 ? '' : 's'}</div>
                  </div>
                  <button class="deck-chevron" data-deck-id="${d.id}" aria-label="Browse ${d.name}">›</button>
                </div>
              `).join('')}
            </div>
          `}
        </div>
        <a class="home-fab" href="#import" aria-label="Import cards">+</a>
        <a class="home-fab home-fab-export" href="#export" aria-label="Export and restore">↓</a>
      </div>
    `

    // Deck card body → review
    el.querySelectorAll('.deck-card-body').forEach(body => {
      body.addEventListener('click', () => {
        const deckId = body.closest('.deck-card').dataset.deckId
        window.location.hash = `review?deckId=${deckId}`
      })
    })

    // Chevron → browse
    el.querySelectorAll('.deck-chevron').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        window.location.hash = `browse?deckId=${btn.dataset.deckId}`
      })
    })

    el.querySelectorAll('.lang-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        lang = btn.dataset.lang
        render()
      })
    })

    const screen = el.querySelector('#home-screen')
    let touchStartX = 0
    screen.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX
    }, { passive: true })
    screen.addEventListener('touchend', e => {
      const delta = e.changedTouches[0].clientX - touchStartX
      if (Math.abs(delta) < 50) return
      const idx = langs.indexOf(lang)
      if (delta < 0 && idx < langs.length - 1) lang = langs[idx + 1]
      else if (delta > 0 && idx > 0) lang = langs[idx - 1]
      render()
    }, { passive: true })
  }

  render()
}
