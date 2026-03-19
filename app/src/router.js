import { renderHome } from './screens/home.js'
import { renderImport } from './screens/import.js'
import { renderReview } from './screens/review.js'
import { renderBrowse } from './screens/browse.js'

const routes = {
  home: renderHome,
  import: renderImport,
  review: renderReview,
  browse: renderBrowse,
}

export function navigate(hash) {
  window.location.hash = hash
}

export function initRouter(appEl) {
  function route() {
    const raw = window.location.hash.slice(1) || 'home'
    const [name] = raw.split('?')
    const params = Object.fromEntries(new URLSearchParams(raw.split('?')[1] || ''))
    const render = routes[name] || routes.home
    render(appEl, params)
  }
  window.addEventListener('hashchange', route)
  route()
}
