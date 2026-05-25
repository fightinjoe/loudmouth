import { MODES as MODES_MAP, MODE_LABELS, DEFAULT_MODE } from '../js/modes.js'
import { openBottomSheet } from './bottom-sheet.js'

const MODES = Object.values(MODES_MAP)
const ORDERS = ['default', 'random', 'reverse']
const ORDER_LABELS = { default: 'Default', random: 'Random', reverse: 'Reverse' }
const READING_DISPLAYS = ['reading', 'romanization']
const READING_DISPLAY_LABELS = { reading: 'Native', romanization: 'Romanized' }

function renderBody({ name, mode, order, readingDisplay }, systemDeck) {
  return `
    <div class="deck-settings-section-header section-label">General</div>
    <div class="deck-settings-row flex items-center justify-between tappable" id="ds-name-row">
      <span class="deck-settings-label text-body1 font-medium fg-body">Name</span>
      <span class="deck-settings-value flex items-center text-body1 font-medium fg-body" id="ds-name-value">${name}</span>
    </div>
    <div class="deck-settings-row flex items-center justify-between tappable" id="ds-mode-row">
      <span class="deck-settings-label text-body1 font-medium fg-body">Card template</span>
      <span class="deck-settings-value deck-settings-value--accent flex items-center text-body1 font-medium fg-accent" id="ds-mode-value">
        ${MODE_LABELS[mode]}
        <span class="deck-settings-chevron text-icon-sm">⌃</span>
      </span>
    </div>
    <div class="deck-settings-row flex items-center justify-between tappable" id="ds-order-row">
      <span class="deck-settings-label text-body1 font-medium fg-body">Card order</span>
      <span class="deck-settings-value deck-settings-value--accent flex items-center text-body1 font-medium fg-accent" id="ds-order-value">
        ${ORDER_LABELS[order]}
        <span class="deck-settings-chevron text-icon-sm">⌃</span>
      </span>
    </div>
    <div class="deck-settings-row flex items-center justify-between tappable" id="ds-reading-display-row">
      <span class="deck-settings-label text-body1 font-medium fg-body">Reading</span>
      <span class="deck-settings-value deck-settings-value--accent flex items-center text-body1 font-medium fg-accent" id="ds-reading-display-value">
        ${READING_DISPLAY_LABELS[readingDisplay]}
        <span class="deck-settings-chevron text-icon-sm">⌃</span>
      </span>
    </div>
    <div class="deck-settings-row flex items-center justify-between tappable" id="ds-export-row">
      <span class="deck-settings-label text-body1 font-medium fg-body">Export JSON</span>
    </div>
    ${!systemDeck ? `
    <div class="deck-settings-section-header section-label">Danger zone</div>
    <div class="deck-settings-row deck-settings-row--destructive flex items-center justify-between tappable" id="ds-delete-row">
      <span class="deck-settings-label text-body1 font-medium fg-danger">Delete deck</span>
    </div>` : ''}
  `
}

export function openDeckSettings(appEl, deck, { updateDeckMode, updateDeckName, updateDeckOrder, updateDeckReadingDisplay, deleteDeck, exportJson }, onChanged) {
  const state = {
    name: deck.name,
    mode: deck.mode || DEFAULT_MODE,
    order: deck.order || 'default',
    readingDisplay: deck.readingDisplay || 'reading',
  }

  const sheet = openBottomSheet(appEl, {
    kind: 'settings',
    bodyHTML: renderBody(state, deck.system),
    onMount: (panel) => bind(panel),
  })

  function rerender() {
    // Replace the body inside the panel — keep the sheet handle. The handle
    // is the first child appended by openBottomSheet; replace the rest.
    const handle = sheet.panel.firstElementChild
    sheet.panel.innerHTML = ''
    sheet.panel.appendChild(handle)
    sheet.panel.insertAdjacentHTML('beforeend', renderBody(state, deck.system))
    bind(sheet.panel)
  }

  function bind(panel) {
    panel.querySelector('#ds-name-row').addEventListener('click', async () => {
      const newName = prompt('Rename deck', state.name)
      if (!newName || newName.trim() === state.name) return
      state.name = newName.trim()
      await updateDeckName(deck.id, state.name)
      onChanged({ name: state.name })
      rerender()
    })

    panel.querySelector('#ds-mode-row').addEventListener('click', async () => {
      const idx = MODES.indexOf(state.mode)
      state.mode = MODES[(idx + 1) % MODES.length]
      await updateDeckMode(deck.id, state.mode)
      onChanged({ mode: state.mode })
      rerender()
    })

    panel.querySelector('#ds-order-row').addEventListener('click', async () => {
      const idx = ORDERS.indexOf(state.order)
      state.order = ORDERS[(idx + 1) % ORDERS.length]
      await updateDeckOrder(deck.id, state.order)
      onChanged({ order: state.order })
      rerender()
    })

    panel.querySelector('#ds-reading-display-row').addEventListener('click', async () => {
      const idx = READING_DISPLAYS.indexOf(state.readingDisplay)
      state.readingDisplay = READING_DISPLAYS[(idx + 1) % READING_DISPLAYS.length]
      await updateDeckReadingDisplay(deck.id, state.readingDisplay)
      onChanged({ readingDisplay: state.readingDisplay })
      rerender()
    })

    panel.querySelector('#ds-export-row').addEventListener('click', exportJson)

    panel.querySelector('#ds-delete-row')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${state.name}"? All cards in this deck will be deleted.`)) return
      await deleteDeck(deck.id)
      onChanged({ deleted: true })
      sheet.close()
    })
  }
}
