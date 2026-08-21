/**
 * Parses a JSON string containing a card batch.
 *
 * @param {string} jsonString
 * @returns {{ cards: object[], errors: string[] }}
 */
export function parseCardBatch(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return { cards: [], errors: [`Invalid JSON: ${e.message}`] };
  }

  if (!parsed || !Array.isArray(parsed.cards)) {
    return { cards: [], errors: ['Expected an object with a "cards" array: {"cards": [...]}'] };
  }

  const cards = [];
  const errors = [];

  for (let i = 0; i < parsed.cards.length; i++) {
    const c = parsed.cards[i];

    const missing = [];
    if (!c.lang) missing.push('lang');
    if (!c.text) missing.push('text');
    if (!c.translation) missing.push('translation');

    if (missing.length) {
      errors.push(`Card ${i + 1}: missing ${missing.join(', ')}`);
      continue;
    }

    const card = {
      lang: c.lang,
      text: c.text,
      translation: c.translation,
    };

    if (c.type !== undefined) card.type = c.type;
    if (c.reading !== undefined) card.reading = c.reading;
    if (c.romanization !== undefined) card.romanization = c.romanization;
    if (c.definition !== undefined) card.definition = c.definition;
    if (c.formality !== undefined) card.formality = c.formality;
    if (c.context !== undefined) card.context = c.context;
    if (c.notes !== undefined) card.notes = c.notes;
    if (c.example?.text !== undefined) {
      card.example = { text: c.example.text };
      if (c.example.reading !== undefined) card.example.reading = c.example.reading;
      if (c.example.translation !== undefined) card.example.translation = c.example.translation;
    }

    cards.push(card);
  }

  return { cards, errors };
}
