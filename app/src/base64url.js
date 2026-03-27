/**
 * Base64url encode/decode utility.
 * URL-safe alphabet: standard base64 with + → -, / → _, no padding.
 * Pure JS — no DOM or DB dependencies.
 */

/**
 * Encode a string to base64url.
 * @param {string} str
 * @returns {string}
 */
export function encode(str) {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Decode a base64url string.
 * @param {string} str
 * @returns {string|null} Original string, or null on any failure.
 */
export function decode(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}
