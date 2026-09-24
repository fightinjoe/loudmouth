'use strict';

const { toRomaji } = require('wanakana');

const CJK_RUN_SOURCE = '[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff々〆ヶ]+';
const INLINE_READING_RE = new RegExp(`(${CJK_RUN_SOURCE})\\[([^\\[\\]]+)\\]`, 'gu');
const STRAY_BRACKET_GROUP_RE = /\[[^\[\]]*\]/gu;
const LONE_BRACKET_RE = /[\[\]]/gu;

function stripStrayBrackets(text) {
  return text.replace(STRAY_BRACKET_GROUP_RE, '').replace(LONE_BRACKET_RE, '');
}

function appendUnannotated(tokens, text) {
  const cleaned = stripStrayBrackets(text);
  if (!cleaned) return;
  const previous = tokens[tokens.length - 1];
  if (previous?.[1] === null) {
    previous[0] += cleaned;
  } else {
    tokens.push([cleaned, null]);
  }
}

function parseInlineReading(value) {
  const tokens = [];
  let cursor = 0;
  for (const match of value.matchAll(INLINE_READING_RE)) {
    appendUnannotated(tokens, value.slice(cursor, match.index));
    tokens.push([match[1], match[2]]);
    cursor = match.index + match[0].length;
  }
  appendUnannotated(tokens, value.slice(cursor));
  return {
    text: tokens.map(([base]) => base).join(''),
    reading: tokens,
  };
}

function latinRomanization(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return /\p{Script=Latin}/u.test(normalized)
    && /^[\p{Script=Latin}\p{M}\p{N}\p{P}\p{Zs}]+$/u.test(normalized)
    ? normalized : undefined;
}

function japanesePronunciation(reading, supplied, { capitalize = false } = {}) {
  const normalized = latinRomanization(supplied);
  if (normalized) return normalized;
  const kana = reading
    .map(([base, annotation]) => annotation ? ` ${annotation}` : base)
    .join('');
  const romaji = toRomaji(kana).trim().replace(/ha(?=$|[\s\p{P}])/gu, 'wa');
  const candidate = capitalize && romaji
    ? romaji.charAt(0).toUpperCase() + romaji.slice(1)
    : romaji;
  return latinRomanization(candidate);
}

module.exports = {
  parseInlineReading,
  latinRomanization,
  japanesePronunciation,
};
