/**
 * Validates and parses the raw string returned by any LLM for card generation.
 * Throws a descriptive Error if the response does not match the card batch schema.
 */

/**
 * Validates a ReadingToken array: must be a non-empty array of [base, annotation|null] pairs.
 * base must be a non-empty string; annotation must be a non-empty string or null.
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

function validateCardsResponse(raw) {
  if (typeof raw !== 'string') {
    throw new Error(`Expected string from LLM, got ${typeof raw}`);
  }

  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}. Raw (first 500 chars): ${cleaned.slice(0, 500)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Response is not a JSON object');
  }

  const { cards } = parsed;
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error('"cards" must be a non-empty array');
  }

  cards.forEach((card, i) => {
    const prefix = `cards[${i}]`;

    if (card.lang !== 'zh' && card.lang !== 'ja') {
      throw new Error(`${prefix}.lang must be "zh" or "ja"`);
    }
    if (typeof card.text !== 'string' || !card.text.trim()) {
      throw new Error(`${prefix}.text must be a non-empty string`);
    }
    if (typeof card.translation !== 'string' || !card.translation.trim()) {
      throw new Error(`${prefix}.translation must be a non-empty string`);
    }
    validateReadingTokens(card.reading, `${prefix}.reading`);

    if (card.type !== undefined && !['word', 'phrase', 'sentence'].includes(card.type)) {
      throw new Error(`${prefix}.type must be "word", "phrase", or "sentence" if present`);
    }
    if (card.notes !== undefined && (typeof card.notes !== 'string' || !card.notes.trim())) {
      throw new Error(`${prefix}.notes must be a non-empty string if present`);
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
  });

  return parsed;
}

module.exports = { validateCardsResponse };
