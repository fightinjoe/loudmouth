/**
 * /lookup handler (v0 — single LLM call). See docs/API_DESIGN.md §4.
 *
 * REQUEST FLOW
 *   POST /lookup { seed, deck, llm? }
 *        │
 *        │  validate request (400 on bad seed/deck/enum/llm)
 *        │  parseSeed: split seed on FIRST '(' → { input, context }   (§2.A)
 *        ▼
 *   buildLookupPrompt({ input, context, deck })
 *        │  ONE LLM call, maxOutputTokens: 8192   (T2 — avoid 1024 truncation → 502)
 *        ▼
 *   validateLookupResponse(raw)   parse + validate + CLAMP; throw → 502
 *        │  log any clamp/drop warnings
 *        ▼
 *   200 LookupResponse
 */

const { buildLookupPrompt } = require('./lookup-prompt');
const { validateLookupResponse } = require('./lookup-validate');

const DEFAULT_LLM = 'claude';

// Explicit large budget — the single call emits primaries + up to 8 groups × up
// to 10 cards, each with reading-token arrays. callAnthropic defaults to 1024,
// which truncates → invalid JSON → 502 (docs/API_DESIGN.md §2.F).
const LOOKUP_MAX_TOKENS = 8192;

const ABILITIES = ['none', 'beginner', 'intermediate', 'advanced'];
const FORMALITIES = ['casual', 'textbook', 'formal'];
const AUDIENCES = ['stranger', 'staff', 'acquaintance', 'family'];
const LANGS = ['zh', 'ja'];

/**
 * Split a raw seed into the term to translate and its (optional) context, on the
 * FIRST '(' only (docs/API_DESIGN.md §2.A). Anything after a second '(' is ignored;
 * a trailing ')' and surrounding whitespace are stripped from the context.
 *
 *   "dinner"                                  → { input: "dinner",           context: "" }
 *   "surf (v. to ride a wave)"                → { input: "surf",             context: "v. to ride a wave" }
 *   "I'll have this one (ordering at a rest.)" → { input: "I'll have this one", context: "ordering at a rest." }
 *   "a (b) (c)"                               → { input: "a",                context: "b" }
 *
 * @param {string} seed
 * @returns {{ input: string, context: string }}
 */
function parseSeed(seed) {
  const [rawInput, rawContext = ''] = seed.split('(');
  return {
    input: rawInput.trim(),
    context: rawContext.replace(/\)\s*$/, '').trim(),
  };
}

/**
 * @param {object} body   parsed request body
 * @returns {string|null} an error message, or null if valid
 */
function validateRequest(body) {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object';

  const { seed, deck } = body;
  if (typeof seed !== 'string' || !seed.trim()) return 'Missing or empty field: seed';

  if (!deck || typeof deck !== 'object') return 'Missing or invalid deck';
  if (!LANGS.includes(deck.language)) return 'deck.language must be "zh" or "ja"';
  if (!ABILITIES.includes(deck.ability)) return `deck.ability must be one of ${ABILITIES.join(', ')}`;
  if (!FORMALITIES.includes(deck.formality)) return `deck.formality must be one of ${FORMALITIES.join(', ')}`;
  if (!AUDIENCES.includes(deck.audience)) return `deck.audience must be one of ${AUDIENCES.join(', ')}`;
  if (deck.freeText !== undefined && typeof deck.freeText !== 'string') {
    return 'deck.freeText must be a string if present';
  }
  return null;
}

/**
 * @param {object} req
 * @param {object} res
 * @param {Record<string, Function>} registry   LLM_REGISTRY (name → handler(prompt, opts))
 * @param {string} defaultLlm
 */
async function handleLookup(req, res, registry, defaultLlm = DEFAULT_LLM) {
  const body = req.body || {};

  const validationError = validateRequest(body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const llm = body.llm || defaultLlm;
  const handler = registry[llm];
  if (!handler) {
    return res.status(400).json({ error: `Unknown LLM: ${llm}`, supported: Object.keys(registry) });
  }

  const { input, context } = parseSeed(body.seed);
  if (!input) {
    // e.g. seed was "(just context)" — nothing to translate.
    return res.status(400).json({ error: 'Missing or empty field: seed (no term before "(")' });
  }

  const prompt = buildLookupPrompt({ input, context, deck: body.deck });

  let raw;
  try {
    raw = await handler(prompt, { maxOutputTokens: LOOKUP_MAX_TOKENS });
  } catch (err) {
    console.error({ event: 'llm_error', route: 'lookup', llm, error: err.message, stack: err.stack });
    return res.status(502).json({ error: 'LLM request failed' });
  }

  let result;
  try {
    result = validateLookupResponse(raw);
  } catch (err) {
    console.error({ event: 'validation_error', route: 'lookup', llm, raw, error: err.message });
    return res.status(502).json({ error: 'Invalid response from LLM' });
  }

  if (result.warnings.length > 0) {
    console.warn({ event: 'lookup_clamped', llm, seed: body.seed, warnings: result.warnings });
  }

  const blocks = result.response.blocks;
  const groupCount = blocks.reduce((n, b) => n + b.groups.length, 0);
  console.log({ event: 'lookup_ok', llm, lang: body.deck.language, blocks: blocks.length, groups: groupCount, input });

  return res.status(200).json(result.response);
}

module.exports = { handleLookup, parseSeed, validateRequest, LOOKUP_MAX_TOKENS };
