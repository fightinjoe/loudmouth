import { renderDeckView } from '../screens/deck-view.js'

export function initRouter(appEl) {
  function route() {
    const raw = window.location.hash.slice(1) || 'deck'
    const [, qparams] = raw.split('?')
    const params = Object.fromEntries(new URLSearchParams(qparams || ''))
    renderDeckView(appEl, params)
  }

  window.addEventListener('hashchange', route)
  route()
}
