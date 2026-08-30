/**
 * /lookup handler. See docs/API_DESIGN.md "Internal flow".
 *
 * REQUEST FLOW
 *   POST /lookup { term, language, ability?, formality?, audience?, llm? }
 *        │
 *        │  1. PARSE (lookup-parse.js): validate + apply defaults, split
 *        │     term on first "(" → { term, context }             → 400
 *        ▼
 *   buildLookupPrompt({ term, context, language, ability, formality, audience })
 *        │  2. GENERATE — ONE LLM call, provider-specific maxOutputTokens, 15s timeout
 *        │     LLM-throws and LLM-times-out are distinct code paths, both → 502
 *        ▼
 *   validateLookupResponse(raw, { context })   3. FINISH: parse + validate +
 *        │  clamp caps + set `context`; throw → 502
 *        ▼
 *   200 { blocks: [...] }
 */

const { parseLookupRequest } = require('./lookup-parse');
const { buildLookupPrompt } = require('./lookup-prompt');
const { validateLookupResponse } = require('./lookup-validate');

// Worst case ~124 cards (4 blocks + 8 groups x 15 cards) at ~150 tokens/card ==
// ~18.6k tokens of content; 30000 gives headroom over that ceiling
// (docs/API_DESIGN.md "Output token budget"). The wrapper default (1024)
// truncates well before this → invalid JSON → 502.
const LOOKUP_MAX_TOKENS = 30000;

// Request timeout budget (docs/API_DESIGN.md "Latency budget": target p50 <4s,
// timeout at 15s → 502, same path as a hard LLM error).
const LOOKUP_TIMEOUT_MS = 15000;

/** Distinguishes a timeout from any other LLM failure (both currently map to
 * the same 502, but on separate catch branches so they can diverge later). */
class LookupTimeoutError extends Error {}

function callWithTimeout(handler, prompt, opts, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new LookupTimeoutError(`LLM request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    handler(prompt, opts).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Pure core: runs GENERATE + FINISH for an already-parsed request. Reused by
 * the /lookup route handler and the eval harness (evals/lookup.eval.js).
 * Throws an Error with a `.status` (400/502) on any failure.
 *
 * @param {{ term: string, context: string, language: string, ability: string, formality: string, audience: string, llm: string }} parsedRequest
 * @param {Record<string, Function>} registry   LLM_REGISTRY
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ blocks: object[] }>}
 */
async function performLookup(parsedRequest, registry, { timeoutMs = LOOKUP_TIMEOUT_MS } = {}) {
  const { term, context, language, ability, formality, audience, llm } = parsedRequest;

  const handler = registry[llm];
  if (!handler) {
    const err = new Error(`Unknown LLM: ${llm}`);
    err.status = 400;
    err.supported = Object.keys(registry);
    throw err;
  }
  const effectiveTimeoutMs = handler.timeoutMs || timeoutMs;

  const prompt = buildLookupPrompt({ term, context, language, ability, formality, audience });
  const maxOutputTokens = handler.maxOutputTokens || LOOKUP_MAX_TOKENS;

  let raw;
  try {
    raw = await callWithTimeout(handler, prompt, { maxOutputTokens }, effectiveTimeoutMs);
  } catch (err) {
    if (err instanceof LookupTimeoutError) {
      console.error({ event: 'llm_timeout', route: 'lookup', llm, error: err.message });
    } else {
      console.error({ event: 'llm_error', route: 'lookup', llm, error: err.message, stack: err.stack });
    }
    const wrapped = new Error('LLM request failed');
    wrapped.status = 502;
    throw wrapped;
  }

  let result;
  try {
    result = validateLookupResponse(raw, { context });
  } catch (err) {
    console.error({ event: 'validation_error', route: 'lookup', llm, raw, error: err.message });
    const wrapped = new Error('Invalid response from LLM');
    wrapped.status = 502;
    throw wrapped;
  }

  if (result.warnings.length > 0) {
    console.warn({ event: 'lookup_clamped', llm, term, warnings: result.warnings });
  }

  const { blocks } = result.response;
  const groupCount = blocks.reduce((n, b) => n + b.groups.length, 0);
  console.log({ event: 'lookup_ok', llm, language, blocks: blocks.length, groups: groupCount, term });

  return result.response;
}

/**
 * @param {object} req
 * @param {object} res
 * @param {Record<string, Function>} registry   LLM_REGISTRY
 * @param {{ timeoutMs?: number }} [opts]        override for tests
 */
async function handleLookup(req, res, registry, opts = {}) {
  const body = req.body || {};

  const parsed = parseLookupRequest(body);
  if (parsed.error) {
    return res.status(400).json({
      error: parsed.error,
      ...(parsed.supported ? { supported: parsed.supported } : {}),
    });
  }

  try {
    const response = await performLookup(parsed.value, registry, opts);
    return res.status(200).json(response);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message,
      ...(err.supported ? { supported: err.supported } : {}),
    });
  }
}

module.exports = {
  handleLookup,
  performLookup,
  LOOKUP_MAX_TOKENS,
  LOOKUP_TIMEOUT_MS,
  LookupTimeoutError,
};
