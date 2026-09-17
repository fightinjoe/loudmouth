'use strict';

const { buildPhraseBreakdownPrompt } = require('./prompt');
const { buildUsageReport } = require('../pricing');
const { getBackendName } = require('../llm-config');

const LANGUAGES = ['zh', 'ja', 'es', 'cs'];
const MAX_TEXT_LENGTH = 2000;
const MAX_TRANSLATION_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 500;
const MAX_CHUNKS = 32;
const PHRASE_BREAKDOWN_MAX_TOKENS = 4096;
const PHRASE_BREAKDOWN_TIMEOUT_MS = 15000;

const FIELD_LIMITS = Object.freeze({
  gloss: 500,
  role: 200,
  explanation: 1000,
  formula: 500,
  noteTitle: 200,
  note: 1000,
  example: 2000,
  exampleTranslation: 2000,
});

class PhraseBreakdownTimeoutError extends Error {}

function callWithTimeout(handler, prompt, opts, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new PhraseBreakdownTimeoutError(`LLM request timed out after ${timeoutMs}ms`);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  const call = Promise.resolve().then(() => handler(prompt, { ...opts, signal: controller.signal }));
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

function parsePhraseBreakdownRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  if (Object.hasOwn(body, 'llm')) {
    return { error: '"llm" is server-controlled and must not be provided' };
  }
  if (!LANGUAGES.includes(body.language)) {
    return { error: `"language" must be one of: ${LANGUAGES.join(', ')}`, supported: LANGUAGES };
  }
  if (typeof body.text !== 'string' || body.text.trim() === '') {
    return { error: '"text" is required and must be a non-empty string' };
  }
  if (body.text.length > MAX_TEXT_LENGTH) {
    return { error: `"text" must be at most ${MAX_TEXT_LENGTH} characters` };
  }
  if (typeof body.translation !== 'string' || body.translation.trim() === '') {
    return { error: '"translation" is required and must be a non-empty string' };
  }
  if (body.translation.length > MAX_TRANSLATION_LENGTH) {
    return { error: `"translation" must be at most ${MAX_TRANSLATION_LENGTH} characters` };
  }

  const hasContext = Object.hasOwn(body, 'context');
  if (hasContext && typeof body.context !== 'string') {
    return { error: '"context" must be a string when provided' };
  }
  if (hasContext && body.context.length > MAX_CONTEXT_LENGTH) {
    return { error: `"context" must be at most ${MAX_CONTEXT_LENGTH} characters` };
  }

  return {
    value: {
      language: body.language,
      text: body.text,
      translation: body.translation,
      ...(hasContext ? { context: body.context } : {}),
    },
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, field, limit) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`"${field}" must be a non-empty string`);
  }
  if (value.length > limit) {
    throw new Error(`"${field}" must be at most ${limit} characters`);
  }
  return value.trim();
}

function splitsSurrogatePair(text, offset) {
  if (offset <= 0 || offset >= text.length) return false;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF;
}

function assertIgnorableGap(gap, label) {
  if (/[^\p{P}\p{White_Space}]/u.test(gap)) {
    throw new Error(`${label} leaves significant source content uncovered`);
  }
}

function alignChunks(source, chunks) {
  let cursor = 0;
  const aligned = chunks.map((chunk, index) => {
    const start = source.indexOf(chunk.text, cursor);
    if (start === -1) {
      throw new Error(`chunks[${index}].text does not occur in source after the preceding chunk`);
    }
    const end = start + chunk.text.length;
    if (splitsSurrogatePair(source, start) || splitsSurrogatePair(source, end)) {
      throw new Error(`chunks[${index}].text splits a UTF-16 surrogate pair`);
    }
    assertIgnorableGap(source.slice(cursor, start), `chunks[${index}]`);
    cursor = end;
    return { start, end, ...chunk };
  });
  assertIgnorableGap(source.slice(cursor), 'chunks');
  return aligned;
}

function validatePattern(value) {
  if (!isPlainObject(value)) throw new Error('"pattern" must be an object');
  const pattern = {
    formula: boundedString(value.formula, 'pattern.formula', FIELD_LIMITS.formula),
    explanation: boundedString(value.explanation, 'pattern.explanation', FIELD_LIMITS.explanation),
  };

  for (const [first, second] of [['noteTitle', 'note'], ['example', 'exampleTranslation']]) {
    const hasFirst = Object.hasOwn(value, first);
    const hasSecond = Object.hasOwn(value, second);
    if (hasFirst !== hasSecond) {
      throw new Error(`pattern.${first} and pattern.${second} must be provided together`);
    }
    if (hasFirst) {
      pattern[first] = boundedString(value[first], `pattern.${first}`, FIELD_LIMITS[first]);
      pattern[second] = boundedString(value[second], `pattern.${second}`, FIELD_LIMITS[second]);
    }
  }
  return pattern;
}

function validatePhraseBreakdownResponse(raw, source) {
  if (typeof raw !== 'string') throw new Error('Model output must be text');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Model output is not valid JSON: ${err.message}`);
  }
  if (!isPlainObject(data)) throw new Error('Model output must be a JSON object');
  if (!Array.isArray(data.chunks) || data.chunks.length < 1 || data.chunks.length > MAX_CHUNKS) {
    throw new Error(`"chunks" must contain 1–${MAX_CHUNKS} items`);
  }

  const chunks = data.chunks.map((value, index) => {
    if (!isPlainObject(value)) throw new Error(`chunks[${index}] must be an object`);
    if (typeof value.text !== 'string' || value.text.length === 0) {
      throw new Error(`chunks[${index}].text must be a non-empty string`);
    }
    if (value.text.length > MAX_TEXT_LENGTH) {
      throw new Error(`chunks[${index}].text must be at most ${MAX_TEXT_LENGTH} characters`);
    }
    return {
      text: value.text,
      gloss: boundedString(value.gloss, `chunks[${index}].gloss`, FIELD_LIMITS.gloss),
      role: boundedString(value.role, `chunks[${index}].role`, FIELD_LIMITS.role),
      explanation: boundedString(value.explanation, `chunks[${index}].explanation`, FIELD_LIMITS.explanation),
    };
  });

  const response = { chunks: alignChunks(source, chunks) };
  if (Object.hasOwn(data, 'pattern')) response.pattern = validatePattern(data.pattern);
  return response;
}

async function performPhraseBreakdown(
  parsedRequest,
  registry,
  { timeoutMs = PHRASE_BREAKDOWN_TIMEOUT_MS } = {},
) {
  const backendName = getBackendName();
  const handler = registry[backendName];
  if (!handler) throw new Error(`Configured LLM backend is not registered: ${backendName}`);
  const effectiveTimeoutMs = handler.timeoutMs || timeoutMs;
  const prompt = buildPhraseBreakdownPrompt(parsedRequest);

  const startedAt = performance.now();
  let reply;
  try {
    reply = await callWithTimeout(
      handler,
      prompt,
      { maxOutputTokens: PHRASE_BREAKDOWN_MAX_TOKENS },
      effectiveTimeoutMs,
    );
  } catch (err) {
    const event = err instanceof PhraseBreakdownTimeoutError ? 'llm_timeout' : 'llm_error';
    console.error({ event, route: 'phrase-breakdown', llm: backendName, error: err.message, stack: err.stack });
    const wrapped = new Error('LLM request failed');
    wrapped.status = 502;
    throw wrapped;
  }
  const durationMs = performance.now() - startedAt;

  let result;
  try {
    result = validatePhraseBreakdownResponse(reply && reply.text, parsedRequest.text);
  } catch (err) {
    console.error({
      event: 'validation_error',
      route: 'phrase-breakdown',
      llm: backendName,
      raw: reply && reply.text,
      error: err.message,
    });
    const wrapped = new Error('Invalid response from LLM');
    wrapped.status = 502;
    throw wrapped;
  }

  const usage = buildUsageReport(reply.model, reply.usage, durationMs);
  console.log({ event: 'usage', route: 'phrase-breakdown', llm: backendName, ...usage });
  return { ...result, usage };
}

async function handlePhraseBreakdown(req, res, registry, opts = {}) {
  const parsed = parsePhraseBreakdownRequest(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const response = await performPhraseBreakdown(parsed.value, registry, opts);
    return res.status(200).json(response);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = {
  handlePhraseBreakdown,
  performPhraseBreakdown,
  parsePhraseBreakdownRequest,
  validatePhraseBreakdownResponse,
  alignChunks,
  PHRASE_BREAKDOWN_MAX_TOKENS,
  PHRASE_BREAKDOWN_TIMEOUT_MS,
};
