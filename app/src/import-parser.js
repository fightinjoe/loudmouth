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
    if (!c.front?.text) missing.push('front.text');
    if (!c.back?.translation) missing.push('back.translation');

    if (missing.length) {
      errors.push(`Card ${i + 1}: missing ${missing.join(', ')}`);
      continue;
    }

    const card = {
      lang: c.lang,
      front: { text: c.front.text },
      back: { translation: c.back.translation },
    };

    if (c.type !== undefined) card.type = c.type;
    if (c.front.reading !== undefined) card.front.reading = c.front.reading;
    if (c.back.notes !== undefined) card.back.notes = c.back.notes;
    if (c.example?.text !== undefined) {
      card.example = { text: c.example.text };
      if (c.example.reading !== undefined) card.example.reading = c.example.reading;
      if (c.example.translation !== undefined) card.example.translation = c.example.translation;
    }

    cards.push(card);
  }

  return { cards, errors };
}
