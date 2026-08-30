/**
 * /textbook handler. See docs/API_DESIGN.md "Catchphrase guided phrasebook
 * generation (/textbook)" "Internal flow".
 *
 * REQUEST FLOW
 *   POST /textbook { topic, language, ability?, llm?, context? }
 *        │
 *        │  1. PARSE (textbook-parse.js): validate + apply defaults, branch
 *        │     call mode on presence of `context`                  → 400
 *        ▼
 *   mode === 'questions'                    mode === 'generate'
 *   buildTextbookQuestionsPrompt(...)        buildTextbookGeneratePrompt(...)
 *        │  2. GENERATE — ONE LLM call, 15s timeout, explicit maxOutputTokens
 *        │     LLM-throws and LLM-times-out are distinct code paths, both → 502
 *        ▼
 *   validateTextbookQuestionsResponse(raw)   validateTextbookGenerateResponse(raw)
 *        │  3. FINISH: parse + validate + clamp caps (+ set card.context   → 502
 *        │     for the generate call)
 *        ▼
 *   200 { questions, checklist }             200 { groups: [...] }
 */

const { parseTextbookRequest } = require('./textbook-parse');
const { buildTextbookQuestionsPrompt, buildTextbookGeneratePrompt } = require('./textbook-prompt');
const { validateTextbookQuestionsResponse, validateTextbookGenerateResponse } = require('./textbook-validate');

// Call 1 returns short label/option strings, not card content — a few
// hundred tokens of headroom is ample (docs/API_DESIGN.md "2a. Generate
// questions" latency/token budget).
const TEXTBOOK_QUESTIONS_MAX_TOKENS = 4000;

// Call 2 worst case is comparable to /lookup's own worst case (8 groups x 15
// cards = 120 cards vs. /lookup's 124) — reuse the same ceiling
// (docs/API_DESIGN.md "2b. Generate phrasebook" token budget).
const TEXTBOOK_GENERATE_MAX_TOKENS = 30000;

// Same latency/timeout posture as /lookup (docs/API_DESIGN.md "Latency
// budget"): target p50 <4s, timeout at 15s → 502, same path as a hard error.
const TEXTBOOK_TIMEOUT_MS = 15000;

/** Distinguishes a timeout from any other LLM failure, same pattern as
 * lookup.js's LookupTimeoutError. */
class TextbookTimeoutError extends Error {}

function callWithTimeout(handler, prompt, opts, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TextbookTimeoutError(`LLM request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    handler(prompt, opts).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function callLlm(handler, llmName, route, prompt, maxOutputTokens, timeoutMs) {
  try {
    return await callWithTimeout(handler, prompt, { maxOutputTokens }, timeoutMs);
  } catch (err) {
    if (err instanceof TextbookTimeoutError) {
      console.error({ event: 'llm_timeout', route, llm: llmName, error: err.message });
    } else {
      console.error({ event: 'llm_error', route, llm: llmName, error: err.message, stack: err.stack });
    }
    const wrapped = new Error('LLM request failed');
    wrapped.status = 502;
    throw wrapped;
  }
}

/**
 * Pure core: runs GENERATE + FINISH for an already-parsed request. Reused by
 * the /textbook route handler and any future eval harness, mirroring
 * lookup.js's performLookup.
 *
 * @param {object} parsedRequest   textbook-parse.js's `.value` shape
 * @param {Record<string, Function>} registry   LLM_REGISTRY
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<object>} { questions, checklist } or { groups }
 */
async function performTextbook(parsedRequest, registry, { timeoutMs = TEXTBOOK_TIMEOUT_MS } = {}) {
  const { topic, language, ability, llm, mode, context } = parsedRequest;
  const effectiveTimeoutMs = registry[llm]?.timeoutMs || timeoutMs;

  const handler = registry[llm];
  if (!handler) {
    const err = new Error(`Unknown LLM: ${llm}`);
    err.status = 400;
    err.supported = Object.keys(registry);
    throw err;
  }

  if (mode === 'questions') {
    const prompt = buildTextbookQuestionsPrompt({ topic, language, ability });
    const raw = await callLlm(handler, llm, 'textbook:questions', prompt, TEXTBOOK_QUESTIONS_MAX_TOKENS, effectiveTimeoutMs);

    let result;
    try {
      result = validateTextbookQuestionsResponse(raw);
    } catch (err) {
      console.error({ event: 'validation_error', route: 'textbook:questions', llm, raw, error: err.message });
      const wrapped = new Error('Invalid response from LLM');
      wrapped.status = 502;
      throw wrapped;
    }

    if (result.warnings.length > 0) {
      console.warn({ event: 'textbook_questions_clamped', llm, topic, warnings: result.warnings });
    }

    const { questions, checklist } = result.response;
    console.log({ event: 'textbook_questions_ok', llm, language, questions: questions.length, checklist: checklist.length, topic });

    return result.response;
  }

  // mode === 'generate'
  const prompt = buildTextbookGeneratePrompt({ topic, language, ability, context });
  const maxOutputTokens = handler.maxOutputTokens || TEXTBOOK_GENERATE_MAX_TOKENS;
  const raw = await callLlm(handler, llm, 'textbook:generate', prompt, maxOutputTokens, effectiveTimeoutMs);

  let result;
  try {
    result = validateTextbookGenerateResponse(raw);
  } catch (err) {
    console.error({ event: 'validation_error', route: 'textbook:generate', llm, raw, error: err.message });
    const wrapped = new Error('Invalid response from LLM');
    wrapped.status = 502;
    throw wrapped;
  }

  if (result.warnings.length > 0) {
    console.warn({ event: 'textbook_generate_clamped', llm, topic, warnings: result.warnings });
  }

  const { groups } = result.response;
  const cardCount = groups.reduce((n, g) => n + g.cards.length, 0);
  console.log({ event: 'textbook_generate_ok', llm, language, groups: groups.length, cards: cardCount, topic });

  return result.response;
}

/**
 * @param {object} req
 * @param {object} res
 * @param {Record<string, Function>} registry   LLM_REGISTRY
 * @param {{ timeoutMs?: number }} [opts]        override for tests
 */
async function handleTextbook(req, res, registry, opts = {}) {
  const body = req.body || {};

  const parsed = parseTextbookRequest(body);
  if (parsed.error) {
    return res.status(400).json({
      error: parsed.error,
      ...(parsed.supported ? { supported: parsed.supported } : {}),
    });
  }

  try {
    const response = await performTextbook(parsed.value, registry, opts);
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
  handleTextbook,
  performTextbook,
  TEXTBOOK_QUESTIONS_MAX_TOKENS,
  TEXTBOOK_GENERATE_MAX_TOKENS,
  TEXTBOOK_TIMEOUT_MS,
  TextbookTimeoutError,
};
