function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function openCardEditPanel(appEl, card, { updateCard, deleteCard }, onSave, onDelete) {
  const panel = document.createElement('div')
  panel.className = 'card-edit-panel panel-screen'
  appEl.appendChild(panel)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => panel.classList.add('panel-screen--visible'))
  })

  function close() {
    panel.classList.remove('panel-screen--visible')
    panel.addEventListener('transitionend', () => panel.remove(), { once: true })
  }

  panel.innerHTML = `
    <div class="panel-header">
      <button class="panel-header-back" aria-label="Cancel">‹</button>
      <span class="panel-header-title">Edit Card</span>
      <button class="panel-header-right card-edit-save-btn" id="btn-save-card">Save</button>
    </div>
    <div class="card-edit-body">
      <div class="card-edit-field">
        <label class="section-label card-edit-label" for="edit-text">Text</label>
        <input class="card-edit-input" id="edit-text" type="text"
          value="${esc(card.text)}" autocorrect="off" autocapitalize="none" spellcheck="false" />
      </div>
      <div class="card-edit-field">
        <label class="section-label card-edit-label" for="edit-translation">Translation</label>
        <input class="card-edit-input" id="edit-translation" type="text"
          value="${esc(card.translation)}" />
      </div>
      <div class="card-edit-field">
        <label class="section-label card-edit-label" for="edit-reading">Reading</label>
        <input class="card-edit-input" id="edit-reading" type="text"
          value="${esc(card.reading)}" autocorrect="off" autocapitalize="none" spellcheck="false" />
      </div>
      <div class="card-edit-field">
        <label class="section-label card-edit-label" for="edit-romanization">Romanization</label>
        <input class="card-edit-input" id="edit-romanization" type="text"
          value="${esc(card.romanization)}" autocorrect="off" autocapitalize="none" spellcheck="false" />
      </div>
      <div class="card-edit-field">
        <label class="section-label card-edit-label" for="edit-notes">Notes</label>
        <textarea class="card-edit-input card-edit-textarea" id="edit-notes"
          autocorrect="off">${esc(card.notes)}</textarea>
      </div>
      <div class="card-edit-field">
        <label class="section-label card-edit-label" for="edit-example">Example</label>
        <textarea class="card-edit-input card-edit-textarea" id="edit-example"
          autocorrect="off">${esc(card.example)}</textarea>
      </div>
      <div class="card-edit-danger">
        <p class="section-label card-edit-danger-label">Danger zone</p>
        <button class="btn card-edit-delete-btn" id="btn-delete-card">Delete Card</button>
      </div>
    </div>
  `

  panel.querySelector('.panel-header-back').addEventListener('click', close)

  panel.querySelector('#btn-save-card').addEventListener('click', async () => {
    const text = panel.querySelector('#edit-text').value.trim()
    const translation = panel.querySelector('#edit-translation').value.trim()

    if (!text) { panel.querySelector('#edit-text').focus(); return }
    if (!translation) { panel.querySelector('#edit-translation').focus(); return }

    const fields = {
      text,
      translation,
      reading: panel.querySelector('#edit-reading').value.trim(),
      romanization: panel.querySelector('#edit-romanization').value.trim(),
      notes: panel.querySelector('#edit-notes').value.trim(),
      example: panel.querySelector('#edit-example').value.trim(),
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
}
