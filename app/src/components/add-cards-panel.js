import { parseCardBatch } from '../js/import-parser.js'

function detectLang(cards) {
  const counts = {}
  for (const c of cards) counts[c.lang] = (counts[c.lang] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function stripCardsParam() {
  const raw = window.location.hash.slice(1) || 'deck'
  const [route, qstring] = raw.split('?')
  const p = new URLSearchParams(qstring || '')
  p.delete('cards')
  const remaining = p.toString()
  window.location.hash = remaining ? `${route}?${remaining}` : route
}

export function openAddCardsPanel(appEl, closePicker, onImportDone, { getDecks, createDeck, importCards, exportAllData, restoreAllData }, { initialCards, initialErrors, fromUri } = {}) {
  let parsedCards = initialCards || []
  let parseErrors = initialErrors || []

  const panel = document.createElement('div')
  panel.className = 'add-cards-panel panel-screen'
  appEl.appendChild(panel)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => panel.classList.add('panel-screen--visible'))
  })

  function close() {
    panel.classList.remove('panel-screen--visible')
    panel.addEventListener('transitionend', () => panel.remove(), { once: true })
  }

  function cancelFromUri() {
    if (fromUri) stripCardsParam()
    close()
  }

  function renderStep1() {
    panel.innerHTML = `
      <div class="panel-header">
        <button class="panel-header-back" aria-label="Back">‹</button>
        <span class="panel-header-title">Add Cards</span>
        <span class="panel-header-spacer"></span>
      </div>
      <div class="add-cards-body">
        <section class="add-cards-section">
          <h2 class="add-cards-section-title">Import Cards</h2>
          <textarea id="json-input" class="add-cards-textarea"
            placeholder='{"cards": [...]}'
            spellcheck="false" autocorrect="off" autocapitalize="none"></textarea>
          <div id="error-msg" class="add-cards-error"></div>
          <button id="btn-parse" class="btn btn-primary">Parse Cards</button>
        </section>
        <section class="add-cards-section">
          <h2 class="add-cards-section-title">Backup</h2>
          <button id="btn-export" class="btn btn-secondary">Download Backup</button>
          <button id="btn-restore-pick" class="btn btn-secondary">Restore Backup</button>
          <input id="file-input" type="file" accept=".json,application/json" style="display:none">
          <div id="restore-status" class="add-cards-error"></div>
        </section>
      </div>
    `

    panel.querySelector('.panel-header-back').addEventListener('click', close)

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

    panel.innerHTML = `
      <div class="panel-header">
        <button class="panel-header-back" aria-label="Back">‹</button>
        <span class="panel-header-title">Confirm Import</span>
        <span class="panel-header-spacer"></span>
      </div>
      <div class="add-cards-body">
        <div class="add-cards-summary">
          <div class="add-cards-count">${parsedCards.length}</div>
          <div class="add-cards-count-label">card${parsedCards.length === 1 ? '' : 's'} ready to import</div>
          ${parseErrors.length > 0 ? `<div class="add-cards-skipped">${parseErrors.length} skipped</div>` : ''}
        </div>
        <div class="add-cards-deck-selector">
          <label for="deck-select">Add to deck (optional)</label>
          <select id="deck-select" class="add-cards-select">
            <option value="">None — All deck only</option>
            ${userDecks.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
            <option value="__new__">New deck…</option>
          </select>
          <div class="add-cards-new-deck" id="new-deck-wrap">
            <input id="new-deck-input" class="add-cards-input" type="text" placeholder="Deck name" autocorrect="off" />
          </div>
        </div>
        <button id="btn-import" class="btn btn-primary">Import</button>
        <button id="btn-step-back" class="btn btn-secondary">Back</button>
      </div>
    `

    panel.querySelector('.panel-header-back').addEventListener('click', fromUri ? cancelFromUri : close)
    panel.querySelector('#btn-step-back').addEventListener('click', fromUri ? cancelFromUri : renderStep1)

    const select = panel.querySelector('#deck-select')
    const newDeckWrap = panel.querySelector('#new-deck-wrap')
    select.addEventListener('change', () => {
      newDeckWrap.classList.toggle('visible', select.value === '__new__')
    })

    panel.querySelector('#btn-import').addEventListener('click', async () => {
      let deckId = select.value === '' ? null : select.value
      if (select.value === '__new__') {
        const name = panel.querySelector('#new-deck-input').value.trim()
        if (!name) { panel.querySelector('#new-deck-input').focus(); return }
        const deck = await createDeck(name, lang)
        deckId = deck.id
      }
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
