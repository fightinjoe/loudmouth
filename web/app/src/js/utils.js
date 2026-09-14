const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/**
 * Encodes an untrusted value for interpolation into HTML text or a quoted
 * attribute. Callers must not pass pre-escaped content.
 */
export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character])
}

export function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export function stripHashParam(param) {
  const raw = window.location.hash.slice(1) || 'deck'
  const [route, qstring] = raw.split('?')
  const p = new URLSearchParams(qstring || '')
  p.delete(param)
  const remaining = p.toString()
  window.location.hash = remaining ? `${route}?${remaining}` : route
}
