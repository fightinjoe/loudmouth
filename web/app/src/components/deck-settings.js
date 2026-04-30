import { MODES as MODES_MAP, MODE_LABELS, DEFAULT_MODE } from '../js/modes.js'
import { wireSheetDismissGesture } from '../js/gestures.js'

const MODES = Object.values(MODES_MAP)

const ORDERS = ['default', 'random', 'reverse']
const ORDER_LABELS = { default: 'Default', random: 'Random', reverse: 'Reverse' }

const READING_DISPLAYS = ['reading', 'romanization']
const READING_DISPLAY_LABELS = { reading: 'Native', romanization: 'Romanized' }

export function openDeckSettings(appEl, deck, { updateDeckMode, updateDeckName, updateDeckOrder, updateDeckReadingDisplay, deleteDeck, exportJson }, onChanged) {
  const scrim = document.createElement('div')
  scrim.className = 'deck-settings-scrim fixed-inset scrim scrim-clear transition-bg'
  appEl.appendChild(scrim)

  const panel = document.createElement('div')
  panel.className = 'deck-settings-panel bottom-sheet bg-primary transition-sheet'
  appEl.appendChild(panel)

  let currentMode = deck.mode || DEFAULT_MODE
  let currentName = deck.name
  let currentOrder = deck.order || 'default'
  let currentReadingDisplay = deck.readingDisplay || 'reading'

  function render() {
    panel.innerHTML = `
      <div class="deck-settings-handle sheet-handle"></div>
      <div class="deck-settings-section-header section-label">General</div>
      <div class="deck-settings-row flex items-center justify-between tappable" id="ds-name-row">
        <span class="deck-settings-label text-body1 font-medium fg-body">Name</span>
        <span class="deck-settings-value flex items-center text-body1 font-medium fg-body" id="ds-name-value">${currentName}</span>
      </div>
      <div class="deck-settings-row flex items-center justify-between tappable" id="ds-mode-row">
        <span class="deck-settings-label text-body1 font-medium fg-body">Card template</span>
        <span class="deck-settings-value deck-settings-value--accent flex items-center text-body1 font-medium fg-accent" id="ds-mode-value">
          ${MODE_LABELS[currentMode]}
          <span class="deck-settings-chevron text-icon-sm">⌃</span>
        </span>
      </div>
      <div class="deck-settings-row flex items-center justify-between tappable" id="ds-order-row">
        <span class="deck-settings-label text-body1 font-medium fg-body">Card order</span>
        <span class="deck-settings-value deck-settings-value--accent flex items-center text-body1 font-medium fg-accent" id="ds-order-value">
          ${ORDER_LABELS[currentOrder]}
          <span class="deck-settings-chevron text-icon-sm">⌃</span>
        </span>
      </div>
      <div class="deck-settings-row flex items-center justify-between tappable" id="ds-reading-display-row">
        <span class="deck-settings-label text-body1 font-medium fg-body">Reading</span>
        <span class="deck-settings-value deck-settings-value--accent flex items-center text-body1 font-medium fg-accent" id="ds-reading-display-value">
          ${READING_DISPLAY_LABELS[currentReadingDisplay]}
          <span class="deck-settings-chevron text-icon-sm">⌃</span>
        </span>
      </div>
      <div class="deck-settings-row flex items-center justify-between tappable" id="ds-export-row">
        <span class="deck-settings-label text-body1 font-medium fg-body">Export JSON</span>
      </div>
      ${!deck.system ? `
      <div class="deck-settings-section-header section-label">Danger zone</div>
      <div class="deck-settings-row deck-settings-row--destructive flex items-center justify-between tappable" id="ds-delete-row">
        <span class="deck-settings-label text-body1 font-medium fg-danger">Delete deck</span>
      </div>` : ''}
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

    panel.querySelector('#ds-order-row').addEventListener('click', async () => {
      const idx = ORDERS.indexOf(currentOrder)
      currentOrder = ORDERS[(idx + 1) % ORDERS.length]
      await updateDeckOrder(deck.id, currentOrder)
      onChanged({ order: currentOrder })
      render()
    })

    panel.querySelector('#ds-reading-display-row').addEventListener('click', async () => {
      const idx = READING_DISPLAYS.indexOf(currentReadingDisplay)
      currentReadingDisplay = READING_DISPLAYS[(idx + 1) % READING_DISPLAYS.length]
      await updateDeckReadingDisplay(deck.id, currentReadingDisplay)
      onChanged({ readingDisplay: currentReadingDisplay })
      render()
    })

    panel.querySelector('#ds-export-row').addEventListener('click', () => {
      exportJson()
    })

    panel.querySelector('#ds-delete-row')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${currentName}"? All cards in this deck will be deleted.`)) return
      await deleteDeck(deck.id)
      onChanged({ deleted: true })
      close()
    })
  }

  render()

  function close() {
    panel.classList.remove('bottom-sheet--visible')
    scrim.classList.remove('scrim-visible')
    panel.addEventListener('transitionend', () => { panel.remove(); scrim.remove() }, { once: true })
  }

  scrim.addEventListener('click', close)
  wireSheetDismissGesture(panel, close)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.classList.add('bottom-sheet--visible')
      scrim.classList.add('scrim-visible')
    })
  })
}
