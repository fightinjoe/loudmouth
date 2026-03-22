import '../styles/home.css'
import { getDecks, getCards } from '../db.js'

const LANGS = ['zh', 'ja']
const LANG_LABELS = { zh: 'Chinese', ja: 'Japanese' }

export function renderHome(el, params) {
  let lang = 'zh'

  async function render() {
    const allDecks = await getDecks(lang, { includeSystem: true })
    const isEmpty = allDecks.length === 0

    // Sort: system (All) deck first, then user decks
    const sorted = [
      ...allDecks.filter(d => d.system),
      ...allDecks.filter(d => !d.system),
    ]

    // Fetch card counts in parallel
    const counts = await Promise.all(sorted.map(d => getCards(d.id).then(c => c.length)))

    el.innerHTML = `
      <div class="screen" id="home-screen">
        <div class="lang-tabs">
          ${LANGS.map(l => `
            <button class="lang-tab${l === lang ? ' active' : ''}" data-lang="${l}">
              ${LANG_LABELS[l]}
            </button>
          `).join('')}
        </div>
        <div class="home-content">
          ${isEmpty ? `
            <div class="empty-state">
              <div class="empty-icon">📚</div>
              <h2>No ${LANG_LABELS[lang]} decks yet</h2>
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
      </div>
    `

    // Deck card body → review
    el.querySelectorAll('.deck-card-body').forEach(body => {
      body.addEventListener('click', () => {
        const deckId = body.closest('.deck-card').dataset.deckId
        window.location.hash = `review?deckId=${deckId}`
      })
    })

    // Chevron → browse (stop propagation so body click doesn't also fire)
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
      const idx = LANGS.indexOf(lang)
      if (delta < 0 && idx < LANGS.length - 1) lang = LANGS[idx + 1]
      else if (delta > 0 && idx > 0) lang = LANGS[idx - 1]
      render()
    }, { passive: true })
  }

  render()
}
