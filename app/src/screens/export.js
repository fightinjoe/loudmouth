import '../styles/export.css'
import { exportAllData, restoreAllData } from '../db.js'
import { navigate } from '../router.js'

export function renderExport(el) {
  el.innerHTML = `
    <div class="screen" id="export-screen">
      <button class="export-back" id="btn-back">‹ Back</button>
      <h1>Export &amp; Restore</h1>

      <div class="export-section">
        <h2>Export</h2>
        <p>Download all your cards and decks as a JSON backup.</p>
        <button id="btn-export" class="btn btn-primary">Download Backup</button>
      </div>

      <div class="export-section">
        <h2>Restore</h2>
        <p>Restore from a backup file. <strong>This replaces all current data.</strong></p>
        <button id="btn-restore-pick" class="btn btn-secondary">Choose Backup File</button>
        <input id="file-input" type="file" accept=".json,application/json" style="display:none">
        <div id="restore-status" class="restore-status"></div>
      </div>
    </div>
  `

  el.querySelector('#btn-back').addEventListener('click', () => navigate('home'))

  // ── Export ──
  el.querySelector('#btn-export').addEventListener('click', async () => {
    const btn = el.querySelector('#btn-export')
    btn.disabled = true
    btn.textContent = 'Preparing…'
    try {
      const data = await exportAllData()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `loudmouth-backup-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
      btn.textContent = 'Download Backup'
    } catch (err) {
      btn.textContent = 'Export failed'
      console.error('Export failed:', err)
    }
    btn.disabled = false
  })

  // ── Restore ──
  el.querySelector('#btn-restore-pick').addEventListener('click', () => {
    el.querySelector('#file-input').click()
  })

  el.querySelector('#file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const status = el.querySelector('#restore-status')
    status.textContent = 'Reading file…'
    status.className = 'restore-status visible'

    let data
    try {
      const text = await file.text()
      data = JSON.parse(text)
    } catch {
      status.textContent = 'Invalid JSON file.'
      status.className = 'restore-status visible error'
      return
    }

    if (!Array.isArray(data.cards)) {
      status.textContent = 'Not a valid Loudmouth backup.'
      status.className = 'restore-status visible error'
      return
    }

    const confirmed = confirm(
      `Restore ${data.cards.length} card(s) and ${(data.decks || []).length} deck(s)?\n\nThis will replace all current data.`
    )
    if (!confirmed) {
      status.textContent = ''
      status.className = 'restore-status'
      return
    }

    try {
      await restoreAllData(data)
      navigate('home')
    } catch (err) {
      status.textContent = 'Restore failed — see console.'
      status.className = 'restore-status visible error'
      console.error('Restore failed:', err)
    }
  })
}
