import { describe, it, expect } from 'vitest'
import { encode, decode } from '../js/base64url.js'

describe('base64url encode/decode', () => {
  it('round-trips a simple JSON string', () => {
    const json = JSON.stringify({ cards: [{ lang: 'zh', text: '你好', translation: 'Hello' }] })
    expect(decode(encode(json))).toBe(json)
  })

  it('encode produces URL-safe characters only (no +, /, =)', () => {
    // Run many payloads to catch all alphabet variants
    for (let i = 0; i < 100; i++) {
      const s = JSON.stringify({ x: 'a'.repeat(i) })
      const encoded = encode(s)
      expect(encoded).not.toMatch(/[+/=]/)
    }
  })

  it('round-trips empty string', () => {
    expect(decode(encode(''))).toBe('')
  })

  it('round-trips a large payload (1000 cards)', () => {
    const cards = Array.from({ length: 1000 }, (_, i) => ({
      lang: 'zh',
      text: `字${i}`,
      translation: `meaning ${i}`,
    }))
    const json = JSON.stringify({ cards })
    expect(decode(encode(json))).toBe(json)
  })

  it('returns null for malformed base64 input', () => {
    expect(decode('!!!not-base64!!!')).toBeNull()
  })

  it('returns null for non-base64 garbage input', () => {
    expect(decode('   ')).toBeNull()
    expect(decode('!@#$')).toBeNull()
  })

  it('decode of valid base64url string returns correct value', () => {
    // Manually encode a known string and verify decode
    const original = '{"cards":[]}'
    const encoded = encode(original)
    expect(decode(encoded)).toBe(original)
  })

  it('handles strings requiring padding variants (len % 4 == 1, 2, 3)', () => {
    for (const s of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      expect(decode(encode(s))).toBe(s)
    }
  })
})
