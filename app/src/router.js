import { renderDeckView, getLastDeckId } from './screens/deck-view.js'

const LEGACY_ROUTES = new Set(['home', 'browse', 'review', 'card', 'import', 'export'])

export function navigate(hash) {
  window.location.hash = hash
}

export function initRouter(appEl) {
  function route() {
    const raw = window.location.hash.slice(1) || 'deck'
    const [name, qparams] = raw.split('?')
    const params = Object.fromEntries(new URLSearchParams(qparams || ''))

    if (LEGACY_ROUTES.has(name)) {
      // Redirect legacy routes to #deck, preserving lastDeckId from localStorage
      const lastId = getLastDeckId()
      window.location.hash = lastId ? `deck?id=${lastId}` : 'deck'
      return
    }

    // #deck is the only route; anything else also falls back to it
    renderDeckView(appEl, params)
  }

  window.addEventListener('hashchange', route)
  route()
}
