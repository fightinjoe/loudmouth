/**
 * Shared card-shape validators.
 *
 * Single source of truth for the CARD_SCHEMA term shape (docs/CARD_SCHEMA.md).
 * Used by both the legacy /generate-cards path (cards-validate.js) and the new
 * /lookup path (lookup-validate.js) so the card rules never drift between them.
 *
 * Each validator throws a descriptive Error on the first violation; callers map
 * a throw to a 502 "Invalid response from LLM".
 */

/**
 * Validates a ReadingToken array: a non-empty array of [base, annotation|null] pairs.
 *   - base       must be a non-empty string
 *   - annotation must be a non-empty string or null
 *
 * NOTE: this checks token SHAPE only, never phonetic CORRECTNESS. A wrong pinyin
 * tone or wrong kanji reading is structurally valid and passes here silently —
 * reading correctness is guarded by the eval harness, not at runtime
 * (see docs/API_DESIGN.md §6).
 */
function validateReadingTokens(value, prefix) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${prefix} must be a non-empty ReadingToken array (e.g. [["菜","cài"],["单","dān"]])`);
  }
  for (let i = 0; i < value.length; i++) {
    const token = value[i];
    if (!Array.isArray(token) || token.length < 2) {
      throw new Error(`${prefix}[${i}] must be a [base, annotation|null] pair`);
    }
    if (typeof token[0] !== 'string' || !token[0]) {
      throw new Error(`${prefix}[${i}][0] (base) must be a non-empty string`);
    }
    if (token[1] !== null && (typeof token[1] !== 'string' || !token[1])) {
      throw new Error(`${prefix}[${i}][1] (annotation) must be a non-empty string or null`);
    }
  }
}

/**
 * Validates a single Card object against CARD_SCHEMA (docs/CARD_SCHEMA.md).
 *
 * Required: lang ("zh"|"ja"), text, translation.
 * Optional: type, reading, romanization, definition, context, notes, example.
 * Omitted optional fields are fine; present ones must be well-formed.
 *
 * `prefix` is used to build a locating error message (e.g. "cards[3].primary").
 */
function validateCard(card, prefix) {
  if (typeof card !== 'object' || card === null || Array.isArray(card)) {
    throw new Error(`${prefix} must be an object`);
  }

  if (!['zh', 'ja', 'es', 'cs'].includes(card.lang)) {
    throw new Error(`${prefix}.lang must be one of "zh", "ja", "es", "cs"`);
  }
  if (typeof card.text !== 'string' || !card.text.trim()) {
    throw new Error(`${prefix}.text must be a non-empty string`);
  }
  if (typeof card.translation !== 'string' || !card.translation.trim()) {
    throw new Error(`${prefix}.translation must be a non-empty string`);
  }

  // reading — required by the legacy /generate-cards prompt, but structurally
  // optional per CARD_SCHEMA; validate the token shape whenever present.
  if (card.reading !== undefined) {
    validateReadingTokens(card.reading, `${prefix}.reading`);
  }

  if (card.formality !== undefined
    && !['casual', 'polite', 'formal', 'slang', 'vulgar'].includes(card.formality)) {
    throw new Error(`${prefix}.formality must be one of "casual", "polite", "formal", "slang", "vulgar" if present`);
  }

  if (card.type !== undefined && !['word', 'phrase', 'sentence'].includes(card.type)) {
    throw new Error(`${prefix}.type must be "word", "phrase", or "sentence" if present`);
  }

  // Optional non-empty string fields.
  for (const field of ['romanization', 'definition', 'context', 'notes']) {
    if (card[field] !== undefined && (typeof card[field] !== 'string' || !card[field].trim())) {
      throw new Error(`${prefix}.${field} must be a non-empty string if present`);
    }
  }

  if (card.example !== undefined) {
    if (typeof card.example !== 'object' || card.example === null) {
      throw new Error(`${prefix}.example must be an object if present`);
    }
    if (typeof card.example.text !== 'string' || !card.example.text.trim()) {
      throw new Error(`${prefix}.example.text must be a non-empty string`);
    }
    if (card.example.reading !== undefined) {
      validateReadingTokens(card.example.reading, `${prefix}.example.reading`);
    }
  }
}

module.exports = { validateCard, validateReadingTokens };
