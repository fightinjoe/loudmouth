/**
 * Parse layer for /textbook (docs/API_DESIGN.md "Catchphrase guided phrasebook
 * generation (/textbook)", "1. Parse [service]" + Inputs table).
 *
 * Validates every input parameter and applies defaults, exactly like
 * lookup-parse.js does for /lookup, but branches the CALL MODE on whether
 * `context` is present: absent → call 1 (questions + checklist); present
 * (and a JSON object) → call 2 (bulk-generate). Returns `{ error }` on the
 * first violation, or `{ value }` with every field normalized plus a `mode`
 * field ('questions' | 'generate') for the handler to dispatch on.
 */

const LANGUAGES = ['zh', 'ja', 'es', 'cs'];
const ABILITIES = ['none', 'beginner', 'intermediate', 'advanced'];
const LLMS = ['google', 'claude', 'chatgpt'];

const DEFAULTS = {
  ability: 'beginner',
  llm: 'google',
};

const MAX_TOPIC_LENGTH = 200;

/**
 * @param {object} body   parsed request body
 * @returns {{ error: string, supported?: string[] }|{ value: object }}
 */
function parseTextbookRequest(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be a JSON object' };
  }

  const { topic, language, ability, llm, context } = body;

  if (typeof topic !== 'string' || !topic.trim()) {
    return { error: 'Missing or empty field: topic' };
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    return { error: `Field "topic" must be at most ${MAX_TOPIC_LENGTH} characters` };
  }
  if (typeof language !== 'string' || !LANGUAGES.includes(language)) {
    return { error: `Field "language" must be one of ${LANGUAGES.join(', ')}` };
  }

  const resolvedAbility = ability === undefined ? DEFAULTS.ability : ability;
  if (!ABILITIES.includes(resolvedAbility)) {
    return { error: `Field "ability" must be one of ${ABILITIES.join(', ')}` };
  }

  const resolvedLlm = llm === undefined ? DEFAULTS.llm : llm;
  if (!LLMS.includes(resolvedLlm)) {
    return { error: `Unknown LLM: ${resolvedLlm}`, supported: LLMS };
  }

  // Presence (not shape) of `context` selects the call mode. It must be a
  // JSON object when present — not a string, not an array, not null.
  let mode = 'questions';
  let resolvedContext;
  if (context !== undefined) {
    if (typeof context !== 'object' || context === null || Array.isArray(context)) {
      return { error: 'Field "context" must be a JSON object when present' };
    }
    mode = 'generate';
    resolvedContext = context;
  }

  return {
    value: {
      topic: topic.trim(),
      language,
      ability: resolvedAbility,
      llm: resolvedLlm,
      mode,
      ...(mode === 'generate' ? { context: resolvedContext } : {}),
    },
  };
}

module.exports = {
  parseTextbookRequest,
  LANGUAGES,
  ABILITIES,
  LLMS,
  DEFAULTS,
  MAX_TOPIC_LENGTH,
};
