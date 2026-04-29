function cardToExportable(card) {
  const c = { lang: card.lang, text: card.text, translation: card.translation }
  if (card.reading) c.reading = card.reading
  if (card.romanization) c.romanization = card.romanization
  if (card.notes) c.notes = card.notes
  if (card.example) c.example = card.example
  return c
}

export function toImportJson(cards) {
  return JSON.stringify({ cards: cards.map(cardToExportable) }, null, 2)
}

export function openJsonPanel(appEl, title, jsonString) {
  const panel = document.createElement('div')
  panel.className = 'json-panel panel-screen bg-primary flex-col'
  appEl.appendChild(panel)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => panel.classList.add('panel-screen--visible'))
  })

  function close() {
    panel.classList.remove('panel-screen--visible')
    panel.addEventListener('transitionend', () => panel.remove(), { once: true })
  }

  panel.innerHTML = `
    <div class="panel-header flex items-center">
      <button class="panel-header-back" aria-label="Back">‹</button>
      <span class="panel-header-title">${title}</span>
      <button class="panel-header-right panel-action-text json-panel-copy-btn" id="btn-copy-json">Copy</button>
    </div>
    <div class="json-panel-body flex-1 flex-col">
      <textarea class="json-panel-textarea flex-1 surface-field text-area-fixed" readonly spellcheck="false"></textarea>
    </div>
  `

  panel.querySelector('.json-panel-textarea').value = jsonString

  panel.querySelector('.panel-header-back').addEventListener('click', close)

  const copyBtn = panel.querySelector('#btn-copy-json')
  copyBtn.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(jsonString).then(() => {
        copyBtn.textContent = 'Copied!'
        setTimeout(() => { copyBtn.textContent = 'Copy' }, 1500)
      })
    } else {
      const ta = panel.querySelector('.json-panel-textarea')
      ta.removeAttribute('readonly')
      ta.select()
      ta.setSelectionRange(0, 99999)
      document.execCommand('copy')
      ta.setSelectionRange(0, 0)
      ta.setAttribute('readonly', '')
      ta.blur()
      copyBtn.textContent = 'Copied!'
      setTimeout(() => { copyBtn.textContent = 'Copy' }, 1500)
    }
  })
}
