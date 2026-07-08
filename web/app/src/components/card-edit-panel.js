import { openJsonPanel, toImportJson } from './json-panel.js'

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getPlainReading(reading) {
  if (typeof reading === 'string') return reading;
  if (!Array.isArray(reading)) return '';
  return reading.map(([base, annotation]) => annotation || base).join('');
}

export function openCardEditPanel(appEl, card, { updateCard, deleteCard }, onSave, onDelete, onDismiss) {
  const panel = document.createElement('div')
  panel.className = 'card-edit-panel pane-full fixed-inset bg-primary flex-col transition-sheet overflow-y-auto'
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
    <div class="pane-header flex items-center">
      <button class="icon-button fg-accent text-icon flex items-center justify-center shrink-0" aria-label="Cancel">‹</button>
      <span class="pane-header-title flex-1 text-center text-header font-semibold fg-body bg-none no-tap-highlight">Edit Card</span>
      <button class="icon-button fg-accent text-icon flex items-center justify-center shrink-0 pane-action-text card-edit-save-btn" id="btn-save-card">Save</button>
    </div>
    <div class="card-edit-body flex-col">
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-text">Text</label>
        <input class="card-edit-input surface-field text-body1 font-inherit" id="edit-text" type="text"
          value="${esc(card.text)}" autocorrect="off" autocapitalize="none" spellcheck="false" />
      </div>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-translation">Translation</label>
        <input class="card-edit-input surface-field text-body1 font-inherit" id="edit-translation" type="text"
          value="${esc(card.translation)}" />
      </div>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-reading">Reading</label>
        <input class="card-edit-input surface-field text-body1 font-inherit" id="edit-reading" type="text"
          value="${esc(getPlainReading(card.reading))}" autocorrect="off" autocapitalize="none" spellcheck="false" />
      </div>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-romanization">Romanization</label>
        <input class="card-edit-input surface-field text-body1 font-inherit" id="edit-romanization" type="text"
          value="${esc(card.romanization)}" autocorrect="off" autocapitalize="none" spellcheck="false" />
      </div>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-notes">Notes</label>
        <textarea class="card-edit-input card-edit-textarea surface-field text-area text-body1 font-inherit" id="edit-notes"
          autocorrect="off">${esc(card.notes)}</textarea>
      </div>
      <div class="card-edit-field flex-col">
        <label class="section-label card-edit-label" for="edit-example">Example</label>
        <textarea class="card-edit-input card-edit-textarea surface-field text-area text-body1 font-inherit" id="edit-example"
          autocorrect="off">${esc(card.example?.text ?? card.example)}</textarea>
      </div>
      <div class="card-edit-export">
        <button class="btn btn-secondary" id="btn-view-json">View JSON</button>
      </div>
      <div class="card-edit-danger flex-col">
        <p class="section-label card-edit-danger-label">Danger zone</p>
        <button class="btn card-edit-delete-btn fg-danger bg-transparent" id="btn-delete-card">Delete Card</button>
      </div>
    </div>
  `

  panel.querySelector('.icon-button').addEventListener('click', close)

  panel.querySelector('#btn-view-json').addEventListener('click', () => {
    openJsonPanel(appEl, 'Card JSON', toImportJson([card]))
  })

  panel.querySelector('#btn-save-card').addEventListener('click', async () => {
    const text = panel.querySelector('#edit-text').value.trim()
    const translation = panel.querySelector('#edit-translation').value.trim()

    if (!text) { panel.querySelector('#edit-text').focus(); return }
    if (!translation) { panel.querySelector('#edit-translation').focus(); return }

    const exampleText = panel.querySelector('#edit-example').value.trim()
    // Preserve any existing example subfields (reading, translation) while
    // updating only the text. If example was a plain string, upgrade to object.
    const existingExample = typeof card.example === 'object' && card.example !== null ? card.example : {}
    const example = exampleText ? { ...existingExample, text: exampleText } : undefined

    const fields = {
      text,
      translation,
      reading: panel.querySelector('#edit-reading').value.trim(),
      romanization: panel.querySelector('#edit-romanization').value.trim(),
      notes: panel.querySelector('#edit-notes').value.trim(),
      example,
    }

    await updateCard(card.id, fields)
    close()
    onSave({ ...card, ...fields })
  })

  panel.querySelector('#btn-delete-card').addEventListener('click', async () => {
    const confirmed = confirm('Delete this card? This cannot be undone.')
    if (!confirmed) return
    await deleteCard(card.id)
    close()
    onDelete(card.id)
  })

  return { close }
}
