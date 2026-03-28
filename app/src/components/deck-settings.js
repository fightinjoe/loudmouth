const MODES = ['comprehension', 'reading', 'reverse']
const MODE_LABELS = { comprehension: 'Comprehension', reading: 'Reading', reverse: 'Reverse' }

export function openDeckSettings(appEl, deck, { updateDeckMode, updateDeckName }, onChanged) {
  const scrim = document.createElement('div')
  scrim.className = 'deck-settings-scrim'
  appEl.appendChild(scrim)

  const panel = document.createElement('div')
  panel.className = 'deck-settings-panel'
  appEl.appendChild(panel)

  let currentMode = deck.mode || 'comprehension'
  let currentName = deck.name

  function render() {
    panel.innerHTML = `
      <div class="deck-settings-handle"></div>
      <div class="deck-settings-section-header">General</div>
      <div class="deck-settings-row" id="ds-name-row">
        <span class="deck-settings-label">Name</span>
        <span class="deck-settings-value" id="ds-name-value">${currentName}</span>
      </div>
      <div class="deck-settings-row" id="ds-mode-row">
        <span class="deck-settings-label">Card template</span>
        <span class="deck-settings-value deck-settings-value--accent" id="ds-mode-value">
          ${MODE_LABELS[currentMode]}
          <span class="deck-settings-chevron">⌃</span>
        </span>
      </div>
    `

    panel.querySelector('#ds-name-row').addEventListener('click', async () => {
      const newName = prompt('Rename deck', currentName)
      if (!newName || newName.trim() === currentName) return
      currentName = newName.trim()
      await updateDeckName(deck.id, currentName)
      onChanged({ name: currentName })
      render()
    })

    panel.querySelector('#ds-mode-row').addEventListener('click', async () => {
      const idx = MODES.indexOf(currentMode)
      currentMode = MODES[(idx + 1) % MODES.length]
      await updateDeckMode(deck.id, currentMode)
      onChanged({ mode: currentMode })
      render()
    })
  }

  render()

  function close() {
    panel.classList.remove('deck-settings-panel--visible')
    scrim.classList.remove('deck-settings-scrim--visible')
    panel.addEventListener('transitionend', () => { panel.remove(); scrim.remove() }, { once: true })
  }

  scrim.addEventListener('click', close)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('deck-settings-panel--visible')
      scrim.classList.add('deck-settings-scrim--visible')
    })
  })
}
