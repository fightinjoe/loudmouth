import '../styles/import.css'
import { parseCardBatch } from '../import-parser.js'
import { getDecks, createDeck, importCards } from '../db.js'
import { navigate } from '../router.js'

function detectLang(cards) {
  const counts = {}
  for (const c of cards) counts[c.lang] = (counts[c.lang] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

export function renderImport(el, params) {
  let parsedCards = []
  let parseErrors = []

  // ── Step 1: Paste ──

  function renderStep1() {
    el.innerHTML = `
      <div class="screen">
        <h1>Import Cards</h1>
        <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:1.25rem">
          Paste a card batch JSON below
        </p>
        <div class="textarea-wrap">
          <textarea id="json-input"
            placeholder='{"cards": [...]}'
            spellcheck="false"
            autocorrect="off"
            autocapitalize="none"></textarea>
          <div id="error-msg" class="error-msg"></div>
        </div>
        <button id="btn-parse" class="btn btn-primary">Parse Cards</button>
      </div>
    `

    el.querySelector('#btn-parse').addEventListener('click', () => {
      const raw = el.querySelector('#json-input').value.trim()
      if (!raw) {
        showError('Paste a JSON card batch first.')
        return
      }

      const result = parseCardBatch(raw)

      if (result.cards.length === 0) {
        showError(result.errors.join('\n'))
        return
      }

      parsedCards = result.cards
      parseErrors = result.errors
      renderStep2()
    })

    function showError(msg) {
      const errEl = el.querySelector('#error-msg')
      errEl.textContent = msg
      errEl.classList.add('visible')
      el.querySelector('#json-input').classList.add('error')
    }
  }

  // ── Step 2: Confirm + deck selection ──

  async function renderStep2() {
    const lang = detectLang(parsedCards)
    const userDecks = await getDecks(lang)

    el.innerHTML = `
      <div class="screen">
        <h1>Confirm Import</h1>
        <div class="confirm-summary">
          <div class="confirm-count">${parsedCards.length}</div>
          <div class="confirm-label">card${parsedCards.length === 1 ? '' : 's'} ready to import</div>
          ${parseErrors.length > 0 ? `
            <div class="confirm-skipped">${parseErrors.length} card${parseErrors.length === 1 ? '' : 's'} skipped</div>
          ` : ''}
        </div>

        <div class="deck-selector">
          <label for="deck-select">Add to deck (optional)</label>
          <select id="deck-select">
            <option value="">None — All deck only</option>
            ${userDecks.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
            <option value="__new__">New deck…</option>
          </select>
          <div class="new-deck-wrap" id="new-deck-wrap">
            <input
              class="new-deck-input"
              id="new-deck-input"
              type="text"
              placeholder="Deck name"
              autocorrect="off"
            />
          </div>
        </div>

        <button id="btn-import" class="btn btn-primary">Import</button>
        <button id="btn-back" class="btn btn-secondary">Back</button>
      </div>
    `

    const select = el.querySelector('#deck-select')
    const newDeckWrap = el.querySelector('#new-deck-wrap')

    select.addEventListener('change', () => {
      newDeckWrap.classList.toggle('visible', select.value === '__new__')
    })

    el.querySelector('#btn-back').addEventListener('click', renderStep1)

    el.querySelector('#btn-import').addEventListener('click', async () => {
      let deckId = select.value === '' ? null : select.value

      if (select.value === '__new__') {
        const name = el.querySelector('#new-deck-input').value.trim()
        if (!name) {
          el.querySelector('#new-deck-input').focus()
          return
        }
        const deck = await createDeck(name, lang)
        deckId = deck.id
      }

      await importCards(parsedCards, deckId)
      navigate('home')
    })
  }

  renderStep1()
}
