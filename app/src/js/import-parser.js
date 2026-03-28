/**
 * Migrates an old-schema card (front/back nested) to the flat schema.
 * Cards already in flat schema are returned unchanged.
 */
export function normalizeCard(c) {
  if (c.text) return c
  const out = { ...c }
  if (c.front) {
    out.text = c.front.text
    if (c.front.reading !== undefined) out.reading = c.front.reading
    delete out.front
  }
  if (c.back) {
    out.translation = c.back.translation
    if (c.back.notes !== undefined) out.notes = c.back.notes
    delete out.back
  }
  return out
}

/**
 * Parses a JSON string containing a card batch.
 * Accepts both old-schema (front/back) and new flat schema.
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
    const raw = parsed.cards[i];

    // Detect required fields from either schema shape
    const hasText = raw.text || raw.front?.text
    const hasTranslation = raw.translation || raw.back?.translation

    const missing = [];
    if (!raw.lang) missing.push('lang');
    if (!hasText) missing.push('text');
    if (!hasTranslation) missing.push('translation');

    if (missing.length) {
      errors.push(`Card ${i + 1}: missing ${missing.join(', ')}`);
      continue;
    }

    const c = normalizeCard(raw)

    const card = {
      lang: c.lang,
      text: c.text,
      translation: c.translation,
    }

    if (c.type !== undefined) card.type = c.type
    if (c.reading !== undefined) card.reading = c.reading
    if (c.notes !== undefined) card.notes = c.notes
    if (c.example?.text !== undefined) {
      card.example = { text: c.example.text }
      if (c.example.reading !== undefined) card.example.reading = c.example.reading
      if (c.example.translation !== undefined) card.example.translation = c.example.translation
    }

    cards.push(card);
  }

  return { cards, errors };
}
