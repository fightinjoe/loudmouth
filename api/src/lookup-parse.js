/**
 * Parse layer for /lookup (docs/API_DESIGN.md "1. Parse [service]" + Inputs table).
 *
 * Splits the raw `term` request field into `term` + `context` on the FIRST '(',
 * validates every input parameter, and applies defaults — all before any model
 * call. Returns `{ error }` (with an optional `supported` list, for the `llm`
 * enum) on the first violation, or `{ value }` with every field normalized.
 */

const LANGUAGES = ['zh', 'ja', 'es', 'cs'];
const ABILITIES = ['none', 'beginner', 'intermediate', 'advanced'];
const FORMALITIES = ['casual', 'polite', 'formal'];
const AUDIENCES = ['stranger', 'staff', 'acquaintance', 'family'];
const LLMS = ['google', 'claude', 'chatgpt'];

const DEFAULTS = {
  ability: 'beginner',
  formality: 'polite',
  audience: 'staff',
  llm: 'google',
};

const MAX_TERM_LENGTH = 200;

/**
 * Split a raw `term` field into the term to translate and its (optional)
 * context, on the FIRST '(' only (docs/API_DESIGN.md "term and context").
 * A missing closing ')' is not an error; extra/nested parens in the context
 * are stripped, not parsed.
 *
 *   "dinner"                    → { term: "dinner", context: "" }
 *   "surf (v. to ride a wave)"  → { term: "surf",    context: "v. to ride a wave" }
 *   "surf (v. to ride"          → { term: "surf",    context: "v. to ride" }
 *   "term (b (c))"              → { term: "term",    context: "b c" }
 *   "a (b) (c)"                 → { term: "a",       context: "b c" }
 *
 * @param {string} rawTerm
 * @returns {{ term: string, context: string }}
 */
function parseTerm(rawTerm) {
  const idx = rawTerm.indexOf('(');
  if (idx === -1) {
    return { term: rawTerm.trim(), context: '' };
  }
  const term = rawTerm.slice(0, idx).trim();
  const context = rawTerm
    .slice(idx + 1)
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { term, context };
}

/**
 * @param {object} body   parsed request body
 * @returns {{ error: string, supported?: string[] }|{ value: object }}
 */
function parseLookupRequest(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be a JSON object' };
  }

  const { term: rawTerm, language, ability, formality, audience, llm } = body;

  if (typeof rawTerm !== 'string' || !rawTerm.trim()) {
    return { error: 'Missing or empty field: term' };
  }
  if (rawTerm.length > MAX_TERM_LENGTH) {
    return { error: `Field "term" must be at most ${MAX_TERM_LENGTH} characters` };
  }
  if (typeof language !== 'string' || !LANGUAGES.includes(language)) {
    return { error: `Field "language" must be one of ${LANGUAGES.join(', ')}` };
  }

  const resolvedAbility = ability === undefined ? DEFAULTS.ability : ability;
  if (!ABILITIES.includes(resolvedAbility)) {
    return { error: `Field "ability" must be one of ${ABILITIES.join(', ')}` };
  }

  const resolvedFormality = formality === undefined ? DEFAULTS.formality : formality;
  if (!FORMALITIES.includes(resolvedFormality)) {
    return { error: `Field "formality" must be one of ${FORMALITIES.join(', ')}` };
  }

  const resolvedAudience = audience === undefined ? DEFAULTS.audience : audience;
  if (!AUDIENCES.includes(resolvedAudience)) {
    return { error: `Field "audience" must be one of ${AUDIENCES.join(', ')}` };
  }

  const resolvedLlm = llm === undefined ? DEFAULTS.llm : llm;
  if (!LLMS.includes(resolvedLlm)) {
    return { error: `Unknown LLM: ${resolvedLlm}`, supported: LLMS };
  }

  const { term, context } = parseTerm(rawTerm);
  if (!term) {
    return { error: 'Missing or empty field: term (no term before "(")' };
  }

  return {
    value: {
      term,
      context,
      language,
      ability: resolvedAbility,
      formality: resolvedFormality,
      audience: resolvedAudience,
      llm: resolvedLlm,
    },
  };
}

module.exports = {
  parseTerm,
  parseLookupRequest,
  LANGUAGES,
  ABILITIES,
  FORMALITIES,
  AUDIENCES,
  LLMS,
  DEFAULTS,
  MAX_TERM_LENGTH,
};
