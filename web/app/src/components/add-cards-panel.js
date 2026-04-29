import { parseCardBatch } from '../js/import-parser.js'
import { stripHashParam } from '../js/utils.js'

function detectLang(cards) {
  const counts = {}
  for (const c of cards) counts[c.lang] = (counts[c.lang] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

export function openAddCardsPanel(appEl, closePicker, onImportDone, { getDecks, createDeck, importCards, exportAllData, restoreAllData }, { initialCards, initialErrors, fromUri } = {}) {
  let parsedCards = initialCards || []
  let parseErrors = initialErrors || []

  const panel = document.createElement('div')
  panel.className = 'add-cards-panel pane-screen fixed-inset bg-primary flex-col transition-sheet overflow-y-auto'
  appEl.appendChild(panel)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => panel.classList.add('pane-screen--visible'))
  })

  function close() {
    panel.classList.remove('pane-screen--visible')
    panel.addEventListener('transitionend', () => panel.remove(), { once: true })
  }

  function cancelFromUri() {
    if (fromUri) stripHashParam('cards')
    close()
  }

  function renderStep1() {
    panel.innerHTML = `
      <div class="pane-header flex items-center">
        <button class="icon-button fg-accent text-icon flex items-center justify-center shrink-0" aria-label="Back">‹</button>
        <span class="pane-header-title flex-1 text-center text-header font-semibold fg-body bg-none">Add Cards</span>
        <span class="pane-header-spacer shrink-0"></span>
      </div>
      <div class="add-cards-body flex-col">
        <section class="add-cards-section flex-col">
          <h2 class="add-cards-section-title section-label">Import Cards</h2>
          <textarea id="json-input" class="add-cards-textarea surface-field text-area text-body2 font-mono"
            placeholder='{"cards": [...]}'
            spellcheck="false" autocorrect="off" autocapitalize="none"></textarea>
          <div id="error-msg" class="add-cards-error text-body2 fg-danger"></div>
          <button id="btn-parse" class="btn btn-primary">Parse Cards</button>
        </section>
        <section class="add-cards-section flex-col">
          <h2 class="add-cards-section-title section-label">Backup</h2>
          <button id="btn-export" class="btn btn-secondary">Download Backup</button>
          <button id="btn-restore-pick" class="btn btn-secondary">Restore Backup</button>
          <input id="file-input" type="file" accept=".json,application/json" style="display:none">
          <div id="restore-status" class="add-cards-error text-body2 fg-danger"></div>
        </section>
      </div>
    `

    panel.querySelector('.icon_button').addEventListener('click', close)

    panel.querySelector('#btn-parse').addEventListener('click', () => {
      const raw = panel.querySelector('#json-input').value.trim()
      const errEl = panel.querySelector('#error-msg')
      if (!raw) { errEl.textContent = 'Paste a JSON card batch first.'; return }
      const result = parseCardBatch(raw)
      if (result.cards.length === 0) { errEl.textContent = result.errors.join('\n'); return }
      parsedCards = result.cards
      parseErrors = result.errors
      renderStep2()
    })

    panel.querySelector('#btn-export').addEventListener('click', async () => {
      const btn = panel.querySelector('#btn-export')
      btn.disabled = true
      btn.textContent = 'Preparing…'
      try {
        const data = await exportAllData()
        const json = JSON.stringify(data, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `loudmouth-backup-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
        btn.textContent = 'Download Backup'
      } catch (err) {
        btn.textContent = 'Export failed'
        console.error(err)
      }
      btn.disabled = false
    })

    panel.querySelector('#btn-restore-pick').addEventListener('click', () => {
      panel.querySelector('#file-input').click()
    })

    panel.querySelector('#file-input').addEventListener('change', async e => {
      const file = e.target.files[0]
      if (!file) return
      const status = panel.querySelector('#restore-status')
      status.textContent = 'Reading file…'
      let data
      try {
        data = JSON.parse(await file.text())
      } catch {
        status.textContent = 'Invalid JSON file.'
        return
      }
      if (!Array.isArray(data.cards)) { status.textContent = 'Not a valid Loudmouth backup.'; return }
      const confirmed = confirm(`Restore ${data.cards.length} card(s) and ${(data.decks || []).length} deck(s)?\n\nThis will replace all current data.`)
      if (!confirmed) { status.textContent = ''; return }
      try {
        await restoreAllData(data)
        close()
        closePicker()
        onImportDone(null)
      } catch (err) {
        status.textContent = 'Restore failed — see console.'
        console.error(err)
      }
    })
  }

  async function renderStep2() {
    const lang = detectLang(parsedCards)
    const userDecks = await getDecks(lang)
    const autoNew = userDecks.length === 0

    panel.innerHTML = `
      <div class="pane-header flex items-center">
        <button class="icon-button fg-accent text-icon flex items-center justify-center shrink-0" aria-label="Back">‹</button>
        <span class="pane-header-title flex-1 text-center text-header font-semibold fg-body bg-none">Confirm Import</span>
        <span class="pane-header-spacer shrink-0"></span>
      </div>
      <div class="add-cards-body flex-col">
        <div class="add-cards-summary text-center">
          <div class="add-cards-count text-h1 font-bold fg-body">${parsedCards.length}</div>
          <div class="add-cards-count-label text-body1 fg-secondary">card${parsedCards.length === 1 ? '' : 's'} ready to import</div>
          ${parseErrors.length > 0 ? `<div class="add-cards-skipped text-body2 fg-secondary">${parseErrors.length} skipped</div>` : ''}
        </div>
        <div class="add-cards-deck-selector flex-col">
          <label class="text-body2 fg-secondary" for="deck-select">Add to deck</label>
          <select id="deck-select" class="add-cards-select surface-field text-body1">
            ${userDecks.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
            <option value="__new__"${autoNew ? ' selected' : ''}>New deck…</option>
          </select>
          <div class="add-cards-new-deck${autoNew ? ' visible' : ''}" id="new-deck-wrap">
            <input id="new-deck-input" class="add-cards-input surface-field text-body1" type="text" placeholder="Deck name" autocorrect="off" />
          </div>
          <div id="deck-error" class="add-cards-error text-body2 fg-danger"></div>
        </div>
        <button id="btn-import" class="btn btn-primary">Import</button>
        <button id="btn-step-back" class="btn btn-secondary">Back</button>
      </div>
    `

    panel.querySelector('.icon_button').addEventListener('click', fromUri ? cancelFromUri : close)
    panel.querySelector('#btn-step-back').addEventListener('click', fromUri ? cancelFromUri : renderStep1)

    const select = panel.querySelector('#deck-select')
    const newDeckWrap = panel.querySelector('#new-deck-wrap')
    select.addEventListener('change', () => {
      newDeckWrap.classList.toggle('visible', select.value === '__new__')
    })

    panel.querySelector('#btn-import').addEventListener('click', async () => {
      const errEl = panel.querySelector('#deck-error')
      let deckId = select.value
      if (deckId === '__new__') {
        const name = panel.querySelector('#new-deck-input').value.trim()
        if (!name) { panel.querySelector('#new-deck-input').focus(); return }
        const deck = await createDeck(name, lang)
        deckId = deck.id
      }
      if (!deckId) { errEl.textContent = 'Please select a deck.'; return }
      try {
        await importCards(parsedCards, deckId)
        close()
        closePicker()
        onImportDone(deckId)
      } catch (err) {
        const btn = panel.querySelector('#btn-import')
        btn.textContent = 'Import failed — try again'
        btn.disabled = true
        console.error(err)
      }
    })
  }

  if (initialCards) {
    renderStep2()
  } else {
    renderStep1()
  }
}
