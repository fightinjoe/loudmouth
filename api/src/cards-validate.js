/**
 * Validates and parses the raw string returned by any LLM for card generation.
 * Throws a descriptive Error if the response does not match the card batch schema.
 *
 * The per-card shape checks live in the shared card-validate.js module (used by
 * the /lookup path too); this file owns the /generate-cards batch envelope and
 * the legacy rule that `reading` is mandatory on every generated card.
 */

const { validateCard } = require('./card-validate');

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

    // Shared card-shape validation (lang/text/translation/type/reading/
    // romanization/definition/context/notes/example).
    validateCard(card, prefix);

    // Legacy /generate-cards rule: reading is MANDATORY here (the shared
    // validator treats it as optional per CARD_SCHEMA; this path is stricter
    // because the generation prompt always asks for it).
    if (card.reading === undefined) {
      throw new Error(`${prefix}.reading must be present (e.g. [["菜","cài"],["单","dān"]])`);
    }
  });

  return parsed;
}

module.exports = { validateCardsResponse };
