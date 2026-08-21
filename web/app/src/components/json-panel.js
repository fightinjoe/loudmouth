import { renderPaneHeader, headerIconButton, headerTitle } from './pane-header.js'

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

export function openJsonPanel(appEl, title, jsonString, onDismiss) {
  const panel = document.createElement('div')
  panel.className = 'json-panel pane-full fixed-inset bg-primary flex-col transition-sheet'
  appEl.appendChild(panel)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => panel.classList.add('pane-full--visible'))
  })

  let closed = false
  function close() {
    if (closed) return
    closed = true
    panel.classList.remove('pane-full--visible')
    panel.addEventListener('transitionend', () => { panel.remove(); onDismiss?.() }, { once: true })
  }

  panel.innerHTML = `
    ${renderPaneHeader({
      leading: headerIconButton('back', { label: 'Back', className: 'fg-accent json-pane-back' }),
      title: headerTitle(title, { className: 'font-semibold bg-none no-tap-highlight' }),
      trailing: `<button class="icon-button fg-accent pane-action-text json-pane-copy-btn" id="btn-copy-json">Copy</button>`,
    })}
    <div class="json-pane-body flex-1 flex-col">
      <textarea class="json-pane-textarea flex-1 surface-field text-area-fixed text-body2 font-mono leading-entry" readonly spellcheck="false"></textarea>
    </div>
  `

  panel.querySelector('.json-pane-textarea').value = jsonString

  panel.querySelector('.json-pane-back').addEventListener('click', close)

  const copyBtn = panel.querySelector('#btn-copy-json')
  copyBtn.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(jsonString).then(() => {
        copyBtn.textContent = 'Copied!'
        setTimeout(() => { copyBtn.textContent = 'Copy' }, 1500)
      })
    } else {
      const ta = panel.querySelector('.json-pane-textarea')
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

  return { close }
}
