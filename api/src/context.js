  /**
 * /context handler. See docs/API_DESIGN.md "/context".
 *
 * First step of the prompt-first guided-creation split: given a seed
 * (situation, activity, or topic) and a target language, one model call
 * returns clarifying questions and a checklist of conversations to prepare.
 * The client's selections feed the /phrasebook endpoint together with the
 * seed.
 *
 * REQUEST FLOW
 *   POST /context { seed, language, llm? }
 *        │  1. PARSE: validate + apply defaults                     → 400
 *        ▼
 *   buildContextPrompt({ seed, language })
 *        │  2. GENERATE — one LLM call, 15s timeout                 → 502
 *        ▼
 *   validateContextResponse(raw)
 *        │  3. FINISH: parse + validate + clamp caps                → 502
 *        ▼
 *   200 { questions, checklist, usage }
 */

const { buildContextPrompt } = require('./context-prompt');
const { buildUsageReport } = require('./pricing');

const LANGUAGES = ['zh', 'ja', 'es', 'cs'];
const DEFAULT_LLM = 'google';
const MAX_SEED_LENGTH = 200;

// v03 hand-tests measured 194-333 output tokens across five seeds; 2,000 is
// ample headroom for the largest plausible questions+checklist response.
const CONTEXT_MAX_TOKENS = 2000;

// Latency is the primary metric (<10s). gemini-3.5-flash-lite measured
// 1.1-1.6s on the v03 baseline; the shared 15s timeout is a hard backstop.
const CONTEXT_TIMEOUT_MS = 15000;

// Prompt asks for 2-5 questions (2-5 options each) and 5-8 checklist items;
// the service clamps overflow rather than failing the call.
const MAX_QUESTIONS = 5;
const MAX_OPTIONS = 5;
const MAX_CHECKLIST = 8;

class ContextTimeoutError extends Error {}

function callWithTimeout(handler, prompt, opts, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ContextTimeoutError(`LLM request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    handler(prompt, opts).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * @param {object} body   parsed request body
 * @returns {{ error: string, supported?: string[] }|{ value: { seed: string, language: string, llm: string } }}
 */
function parseContextRequest(body, supportedLlms) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const { seed, language, llm = DEFAULT_LLM } = body;

  if (typeof seed !== 'string' || seed.trim() === '') {
    return { error: '"seed" is required and must be a non-empty string' };
  }
  if (seed.length > MAX_SEED_LENGTH) {
    return { error: `"seed" must be at most ${MAX_SEED_LENGTH} characters` };
  }
  if (!LANGUAGES.includes(language)) {
    return { error: `"language" must be one of: ${LANGUAGES.join(', ')}`, supported: LANGUAGES };
  }
  if (!supportedLlms.includes(llm)) {
    return { error: `Unknown LLM: ${llm}`, supported: supportedLlms };
  }

  return { value: { seed: seed.trim(), language, llm } };
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Parses and validates the model's JSON. Overflow (too many questions,
 * options, or checklist items) is clamped with a warning; structural
 * violations throw.
 *
 * @param {string} raw   model output text
 * @returns {{ response: { questions: object[], checklist: object[] }, warnings: string[] }}
 */
function validateContextResponse(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Model output is not valid JSON: ${err.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Model output must be a JSON object');
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error('"questions" must be a non-empty array');
  }
  if (!Array.isArray(data.checklist) || data.checklist.length === 0) {
    throw new Error('"checklist" must be a non-empty array');
  }

  const warnings = [];

  let questions = data.questions.map((q, i) => {
    if (!q || typeof q !== 'object') throw new Error(`questions[${i}] must be an object`);
    if (!isNonEmptyString(q.label)) throw new Error(`questions[${i}].label must be a non-empty string`);
    if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(isNonEmptyString)) {
      throw new Error(`questions[${i}].options must be an array of at least 2 non-empty strings`);
    }
    let options = q.options.map((o) => o.trim());
    if (options.length > MAX_OPTIONS) {
      warnings.push(`questions[${i}]: clamped ${options.length} options to ${MAX_OPTIONS}`);
      options = options.slice(0, MAX_OPTIONS);
    }
    return { label: q.label.trim(), options };
  });
  if (questions.length > MAX_QUESTIONS) {
    warnings.push(`clamped ${questions.length} questions to ${MAX_QUESTIONS}`);
    questions = questions.slice(0, MAX_QUESTIONS);
  }

  let checklist = data.checklist.map((item, i) => {
    if (!item || typeof item !== 'object') throw new Error(`checklist[${i}] must be an object`);
    if (!isNonEmptyString(item.label)) throw new Error(`checklist[${i}].label must be a non-empty string`);
    if (typeof item.checked !== 'boolean') throw new Error(`checklist[${i}].checked must be a boolean`);
    return { label: item.label.trim(), checked: item.checked };
  });
  if (checklist.length > MAX_CHECKLIST) {
    warnings.push(`clamped ${checklist.length} checklist items to ${MAX_CHECKLIST}`);
    checklist = checklist.slice(0, MAX_CHECKLIST);
  }

  return { response: { questions, checklist }, warnings };
}

/**
 * Pure core: runs GENERATE + FINISH for an already-parsed request. Reused by
 * the route handler and any future eval harness.
 *
 * @param {{ seed: string, language: string, llm: string }} parsedRequest
 * @param {Record<string, Function>} registry   LLM_REGISTRY
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<object>} { questions, checklist, usage }
 */
async function performContext(parsedRequest, registry, { timeoutMs = CONTEXT_TIMEOUT_MS } = {}) {
  const { seed, language, llm } = parsedRequest;
  const handler = registry[llm];
  const effectiveTimeoutMs = handler.timeoutMs || timeoutMs;

  const prompt = buildContextPrompt({ seed, language });

  const startedAt = performance.now();
  let reply;
  try {
    reply = await callWithTimeout(handler, prompt, { maxOutputTokens: CONTEXT_MAX_TOKENS }, effectiveTimeoutMs);
  } catch (err) {
    if (err instanceof ContextTimeoutError) {
      console.error({ event: 'llm_timeout', route: 'context', llm, error: err.message });
    } else {
      console.error({ event: 'llm_error', route: 'context', llm, error: err.message, stack: err.stack });
    }
    const wrapped = new Error('LLM request failed');
    wrapped.status = 502;
    throw wrapped;
  }
  const durationMs = performance.now() - startedAt;

  let result;
  try {
    result = validateContextResponse(reply.text);
  } catch (err) {
    console.error({ event: 'validation_error', route: 'context', llm, raw: reply.text, error: err.message });
    const wrapped = new Error('Invalid response from LLM');
    wrapped.status = 502;
    throw wrapped;
  }

  if (result.warnings.length > 0) {
    console.warn({ event: 'context_clamped', llm, seed, warnings: result.warnings });
  }

  const usageReport = buildUsageReport(reply.model, reply.usage, durationMs);
  const { questions, checklist } = result.response;
  console.log({ event: 'context_ok', llm, language, questions: questions.length, checklist: checklist.length, seed });
  console.log({ event: 'usage', route: 'context', llm, ...usageReport });

  return { questions, checklist, usage: usageReport };
}

/**
 * @param {object} req
 * @param {object} res
 * @param {Record<string, Function>} registry   LLM_REGISTRY
 * @param {{ timeoutMs?: number }} [opts]        override for tests
 */
async function handleContext(req, res, registry, opts = {}) {
  const parsed = parseContextRequest(req.body || {}, Object.keys(registry));
  if (parsed.error) {
    return res.status(400).json({
      error: parsed.error,
      ...(parsed.supported ? { supported: parsed.supported } : {}),
    });
  }

  try {
    const response = await performContext(parsed.value, registry, opts);
    return res.status(200).json(response);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
}

module.exports = {
  handleContext,
  performContext,
  parseContextRequest,
  validateContextResponse,
  CONTEXT_MAX_TOKENS,
  CONTEXT_TIMEOUT_MS,
  ContextTimeoutError,
};
