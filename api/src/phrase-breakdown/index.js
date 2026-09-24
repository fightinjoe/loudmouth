'use strict';

const { buildPhraseBreakdownPrompt } = require('./prompt');
const { buildUsageReport } = require('../pricing');
const { getBackendName } = require('../llm-config');
const {
  SCHEMA_VERSION,
  normalizeIdentityText,
  validateBreakdownRequest,
  validateBreakdownResponse,
  validateCandidate,
  validateReadingTokens,
} = require('../schema');
const { japanesePronunciation, latinRomanization, parseInlineReading } = require('../reading');

const MAX_TEXT_LENGTH = 2000;
const MAX_CHUNKS = 32;
const MAX_WORDS = 32;
const PHRASE_BREAKDOWN_MAX_TOKENS = 4096;
const PHRASE_BREAKDOWN_TIMEOUT_MS = 15000;

const FIELD_LIMITS = Object.freeze({
  gloss: 500,
  role: 200,
  explanation: 1000,
  wordSurface: 2000,
  wordText: 2000,
  wordTranslation: 500,
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
  try {
    return { value: validateBreakdownRequest(body) };
  } catch (error) {
    return { error: error.message };
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactFields(value, allowed, prefix) {
  const accepted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) throw new Error(`${prefix}.${key} is not allowed`);
  }
}

function boundedString(value, field, limit) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a nonblank string`);
  }
  if (value.length > limit) {
    throw new Error(`${field} must be at most ${limit} UTF-16 code units`);
  }
  return value;
}

function nonnegativeInteger(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a nonnegative integer`);
  }
  return value;
}

function splitsSurrogatePair(text, offset) {
  if (offset <= 0 || offset >= text.length) return false;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF;
}

function hasMeaningfulContent(value) {
  return /[^\p{P}\p{White_Space}]/u.test(value);
}

function assertIgnorableGap(gap, label) {
  if (hasMeaningfulContent(gap)) {
    throw new Error(`${label} leaves meaningful source content uncovered`);
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

function parseModelResponse(raw) {
  if (typeof raw !== 'string') throw new Error('Model output must be text');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Model output is not valid JSON: ${error.message}`);
  }
  if (!isPlainObject(data)) throw new Error('Model output must be a JSON object');
  assertExactFields(data, ['chunks'], 'response');
  if (!Array.isArray(data.chunks) || data.chunks.length < 1 || data.chunks.length > MAX_CHUNKS) {
    throw new Error(`response.chunks must contain 1 to ${MAX_CHUNKS} items`);
  }
  return data;
}

function findSurfaceOccurrence(text, surface, occurrence, field) {
  let from = 0;
  for (let current = 0; current <= occurrence; current += 1) {
    const start = text.indexOf(surface, from);
    if (start === -1) {
      throw new Error(`${field} occurrence ${occurrence} does not exist in its containing chunk`);
    }
    if (current === occurrence) {
      const end = start + surface.length;
      if (splitsSurrogatePair(text, start) || splitsSurrogatePair(text, end)) {
        throw new Error(`${field} splits a UTF-16 surrogate pair`);
      }
      return { start, end };
    }
    from = start + 1;
  }
  throw new Error(`${field} occurrence ${occurrence} does not exist in its containing chunk`);
}

function meaningfulBounds(text, start, end) {
  const value = text.slice(start, end);
  const leading = value.match(/^[\p{P}\p{White_Space}]*/u)?.[0].length ?? 0;
  const trailing = value.match(/[\p{P}\p{White_Space}]*$/u)?.[0].length ?? 0;
  return { start: start + leading, end: end - trailing };
}

function buildWordCandidate(item, itemIndex, chunk, request) {
  const prefix = `chunks[${chunk.index}].words[${itemIndex}]`;
  if (!isPlainObject(item)) throw new Error(`${prefix} must be an object`);
  assertExactFields(
    item,
    ['surface', 'occurrence', 'text', 'translation', 'partOfSpeech', 'senseKey', 'reading', 'romanization'],
    prefix,
  );

  const surface = boundedString(item.surface, `${prefix}.surface`, FIELD_LIMITS.wordSurface);
  if (surface !== surface.trim()) {
    throw new Error(`${prefix}.surface must not have surrounding whitespace`);
  }
  if (!hasMeaningfulContent(surface)) {
    throw new Error(`${prefix}.surface must contain content other than punctuation or whitespace`);
  }
  const occurrence = nonnegativeInteger(item.occurrence, `${prefix}.occurrence`);
  const localSpan = findSurfaceOccurrence(chunk.text, surface, occurrence, `${prefix}.surface`);
  const text = boundedString(item.text, `${prefix}.text`, FIELD_LIMITS.wordText);
  if ((request.source.snapshot.lang === 'ja' || request.source.snapshot.lang === 'zh')
    && parseInlineReading(text).text !== text) {
    throw new Error(`${prefix}.text must use the reading field instead of inline reading notation`);
  }
  const translation = boundedString(
    item.translation,
    `${prefix}.translation`,
    FIELD_LIMITS.wordTranslation,
  );

  const card = {
    type: 'word',
    lang: request.source.snapshot.lang,
    text,
    translation,
    partOfSpeech: item.partOfSpeech,
    senseKey: item.senseKey,
  };
  if (Object.hasOwn(item, 'reading')) {
    card.reading = validateReadingTokens(item.reading, text, `${prefix}.reading`);
  } else if (card.lang === 'ja' || card.lang === 'zh') {
    throw new Error(`${prefix}.reading is required for generated ${card.lang} words`);
  }

  let romanization;
  if (card.lang === 'ja' && card.reading !== undefined) {
    romanization = japanesePronunciation(card.reading, item.romanization);
  } else if (Object.hasOwn(item, 'romanization')) {
    romanization = latinRomanization(item.romanization);
  }
  if (romanization !== undefined) card.romanization = romanization;

  const source = {
    snapshot: request.source.snapshot,
    ...(request.source.ref === undefined ? {} : { ref: request.source.ref }),
    span: {
      start: chunk.start + localSpan.start,
      end: chunk.start + localSpan.end,
    },
  };
  const candidate = { card, sources: [source] };
  validateCandidate(candidate, prefix);
  return candidate;
}

function validateEquivalentWord(index, words, chunk, sourceText) {
  if (index >= words.length) {
    throw new Error(`chunks[${chunk.index}].equivalentWordIndex must index words`);
  }
  const bounds = meaningfulBounds(sourceText, chunk.start, chunk.end);
  const word = words[index];
  const coversChunk = word.sources.some(
    (source) => source.span.start === bounds.start && source.span.end === bounds.end,
  );
  if (!coversChunk) {
    throw new Error(`chunks[${chunk.index}].equivalentWordIndex must select a word whose surface covers the chunk except edge punctuation and whitespace`);
  }
  const encountered = sourceText.slice(bounds.start, bounds.end);
  if (normalizeIdentityText(word.card.text) !== normalizeIdentityText(encountered)) {
    throw new Error(`chunks[${chunk.index}].equivalentWordIndex must select the same normalized lexical target as the encountered chunk`);
  }
}

function validatePhraseBreakdownResponse(raw, requestValue) {
  const request = validateBreakdownRequest(requestValue);
  const data = parseModelResponse(raw);
  const sourceText = request.source.snapshot.text;
  const rawChunks = data.chunks.map((value, index) => {
    if (!isPlainObject(value)) throw new Error(`chunks[${index}] must be an object`);
    assertExactFields(
      value,
      ['text', 'gloss', 'role', 'explanation', 'equivalentWordIndex', 'words'],
      `chunks[${index}]`,
    );
    if (typeof value.text !== 'string' || value.text.length === 0) {
      throw new Error(`chunks[${index}].text must be a nonempty string`);
    }
    if (value.text.length > MAX_TEXT_LENGTH) {
      throw new Error(`chunks[${index}].text must be at most ${MAX_TEXT_LENGTH} UTF-16 code units`);
    }
    return { text: value.text, value, index };
  });

  const chunks = [];
  for (const aligned of alignChunks(sourceText, rawChunks)) {
    const { value, index } = aligned;
    if (!Array.isArray(value.words) || value.words.length > MAX_WORDS) {
      throw new Error(`chunks[${index}].words must be an array with at most ${MAX_WORDS} items`);
    }
    if (value.equivalentWordIndex !== null
      && (typeof value.equivalentWordIndex !== 'number'
        || !Number.isSafeInteger(value.equivalentWordIndex)
        || value.equivalentWordIndex < 0)) {
      throw new Error(`chunks[${index}].equivalentWordIndex must be a nonnegative integer or null`);
    }

    if (!hasMeaningfulContent(aligned.text)) {
      if (value.words.length !== 0 || value.equivalentWordIndex !== null) {
        throw new Error(`chunks[${index}] is punctuation-only and cannot have words or a target`);
      }
      continue;
    }

    const gloss = boundedString(value.gloss, `chunks[${index}].gloss`, FIELD_LIMITS.gloss);
    const role = boundedString(value.role, `chunks[${index}].role`, FIELD_LIMITS.role);
    const explanation = boundedString(
      value.explanation,
      `chunks[${index}].explanation`,
      FIELD_LIMITS.explanation,
    );
    const words = value.words.map((item, itemIndex) => (
      buildWordCandidate(item, itemIndex, aligned, request)
    ));

    let target;
    if (value.equivalentWordIndex === null) {
      target = {
        kind: 'chunk',
        card: {
          type: 'chunk',
          lang: request.source.snapshot.lang,
          text: aligned.text,
          translation: gloss,
          source: {
            snapshot: request.source.snapshot,
            ...(request.source.ref === undefined ? {} : { ref: request.source.ref }),
            span: { start: aligned.start, end: aligned.end },
          },
          role,
          explanation,
        },
      };
      validateCandidate({ card: target.card }, `chunks[${index}].target`);
    } else {
      validateEquivalentWord(value.equivalentWordIndex, words, aligned, sourceText);
      target = { kind: 'word', index: value.equivalentWordIndex };
    }

    chunks.push({
      start: aligned.start,
      end: aligned.end,
      text: aligned.text,
      gloss,
      role,
      explanation,
      words,
      target,
    });
  }

  if (chunks.length === 0) {
    throw new Error('response.chunks must contain at least one meaningful chunk');
  }
  return { schemaVersion: SCHEMA_VERSION, chunks };
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
  } catch (error) {
    const event = error instanceof PhraseBreakdownTimeoutError ? 'llm_timeout' : 'llm_error';
    console.error({
      event,
      route: 'phrase-breakdown',
      llm: backendName,
      error: error.message,
      stack: error.stack,
    });
    const wrapped = new Error('LLM request failed');
    wrapped.status = 502;
    throw wrapped;
  }
  const durationMs = performance.now() - startedAt;

  try {
    const result = validatePhraseBreakdownResponse(reply && reply.text, parsedRequest);
    const usage = buildUsageReport(reply.model, reply.usage, durationMs);
    const response = { ...result, usage };
    validateBreakdownResponse(response, parsedRequest);
    console.log({ event: 'usage', route: 'phrase-breakdown', llm: backendName, ...usage });
    return response;
  } catch (error) {
    console.error({
      event: 'validation_error',
      route: 'phrase-breakdown',
      llm: backendName,
      raw: reply && reply.text,
      error: error.message,
    });
    const wrapped = new Error('Invalid response from LLM');
    wrapped.status = 502;
    throw wrapped;
  }
}

async function handlePhraseBreakdown(req, res, registry, opts = {}) {
  const parsed = parsePhraseBreakdownRequest(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const response = await performPhraseBreakdown(parsed.value, registry, opts);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
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
