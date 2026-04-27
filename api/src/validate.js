/**
 * Validates and parses the raw string returned by any LLM.
 * Throws a descriptive Error if the response does not match the expected schema.
 */
function validateResponse(raw) {
  if (typeof raw !== 'string') {
    throw new Error(`Expected string from LLM, got ${typeof raw}`);
  }

  // Strip accidental markdown code fences (```json ... ``` or ``` ... ```)
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

  const { translations } = parsed;
  if (!Array.isArray(translations) || translations.length === 0) {
    throw new Error('"translations" must be a non-empty array');
  }

  translations.forEach((item, i) => {
    const prefix = `translations[${i}]`;

    if (typeof item.english_meaning !== 'string' || !item.english_meaning.trim()) {
      throw new Error(`${prefix}.english_meaning must be a non-empty string`);
    }
    if (typeof item.target_language !== 'string' || !item.target_language.trim()) {
      throw new Error(`${prefix}.target_language must be a non-empty string`);
    }
    if (typeof item.target_text !== 'string' || !item.target_text.trim()) {
      throw new Error(`${prefix}.target_text must be a non-empty string`);
    }
    if (!('ruby_markup' in item)) {
      throw new Error(`${prefix}.ruby_markup key must be present`);
    }
    if (item.ruby_markup !== null && typeof item.ruby_markup !== 'string') {
      throw new Error(`${prefix}.ruby_markup must be a string or null`);
    }
  });

  return parsed;
}

module.exports = { validateResponse };
