'use strict';

const { createHash } = require('node:crypto');
const { PRICING } = require('../pricing');
const { MAX_INPUT_BYTES } = require('../llms/bounds');
const { getBackendName, getPhrasebookGenerationBackendName, LLM_REGISTRY } = require('../llm-config');
const { parseContextRequest, CONTEXT_MAX_TOKENS, CONTEXT_TIMEOUT_MS } = require('../context');
const { parsePhrasebookTitleRequest, PHRASEBOOK_TITLE_MAX_TOKENS, PHRASEBOOK_TITLE_TIMEOUT_MS } = require('../phrasebook-title');
const { parsePhraseBreakdownRequest, PHRASE_BREAKDOWN_MAX_TOKENS, PHRASE_BREAKDOWN_TIMEOUT_MS } = require('../phrase-breakdown');
const { parsePhrasebookRequest } = require('../phrasebook/parse');
const { parsePhrasebookImageRequest } = require('../phrasebook-image');
const { GENAI_MODEL, GENAI_FLASH_MODEL } = require('../llms/genai');
const { ANTHROPIC_MODEL } = require('../llms/anthropic');
const { OPENAI_MODEL } = require('../llms/openai');
const { DEEPSEEK_MODEL } = require('../llms/openrouter');
const MODELS = { 'gemini-3.5-flash-lite': GENAI_MODEL, 'g-flash': GENAI_FLASH_MODEL,
  claude: ANTHROPIC_MODEL, chatgpt: OPENAI_MODEL, 'deepseek-v4.1-flash': DEEPSEEK_MODEL };
const PARSERS = { '/context': parseContextRequest, '/phrasebook-title': parsePhrasebookTitleRequest,
  '/phrase-breakdown': parsePhraseBreakdownRequest, '/phrasebook': parsePhrasebookRequest };

function parseRouteInput(path, body) {
  if (path === '/phrasebook-image') {
    try { return { value: parsePhrasebookImageRequest(body) }; }
    catch (error) { return { error: error.message }; }
  }
  return PARSERS[path] ? PARSERS[path](body) : { error: 'Unknown route' };
}

function knownRate(backend) {
  const rate = PRICING[MODELS[backend]];
  return rate && [rate.inputPer1M, rate.outputPer1M].every(value => Number.isFinite(value) && value >= 0);
}

function getPricingStatus({ now = Date.now() } = {}) {
  const verifiedAt = process.env.PRICING_VERIFIED_AT || '';
  const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(verifiedAt) ? Date.parse(verifiedAt) : NaN;
  const canonical = Number.isFinite(time) && new Date(time).toISOString().replace('.000Z', 'Z')
    === verifiedAt.replace('.000Z', 'Z');
  const expiresAt = canonical ? time + 30 * 86400000 : null;
  let modelsValid = false;
  try { modelsValid = knownRate(getBackendName()) && knownRate(getPhrasebookGenerationBackendName()); } catch { /* Invalid config fails closed. */ }
  const pricingVersion = createHash('sha256').update(JSON.stringify({ rates: PRICING,
    imageReserveMicros: process.env.IMAGE_RESERVE_MICROS || null, verifiedAt })).digest('hex');
  return { pricingVersion, expiresAt, valid: Boolean(modelsValid && expiresAt && time <= now && now < expiresAt) };
}

function unavailable() {
  return Object.assign(new Error('Model admission pricing is unavailable'), {
    status: 503, code: 'ADMISSION_UNAVAILABLE', retryAfterSeconds: 30,
  });
}

function buildWorkPlan(path, parsedRequest) {
  const pricing = getPricingStatus();
  if (!pricing.valid) throw unavailable();
  if (path === '/phrasebook-image') {
    const reserveMicros = Number(process.env.IMAGE_RESERVE_MICROS);
    if (!Number.isSafeInteger(reserveMicros) || reserveMicros <= 0) throw unavailable();
    return { weight: 8, reserveMicros, maxAttempts: 1, deadlineMs: 120000,
      pricingVersion: pricing.pricingVersion, backendLimits: {}, image: true };
  }
  const backend = getBackendName();
  let weight;
  let deadlineMs;
  const backendLimits = {};
  function include(name, attempts, maxOutputTokens) {
    if (!knownRate(name)) throw unavailable();
    const existing = backendLimits[name];
    backendLimits[name] = { maxAttempts: (existing?.maxAttempts || 0) + attempts, maxOutputTokens };
  }
  if (path === '/phrasebook') {
    const count = parsedRequest.checklist.length;
    if (!Number.isInteger(count) || count < 1 || count > 8) throw unavailable();
    weight = 10 * count;
    deadlineMs = 245000;
    include(getPhrasebookGenerationBackendName(), 8 * count, 6000);
    include(backend, 8 * count, 6000);
  } else {
    const routes = { '/context': [10, CONTEXT_MAX_TOKENS, CONTEXT_TIMEOUT_MS],
      '/phrasebook-title': [2, PHRASEBOOK_TITLE_MAX_TOKENS, PHRASEBOOK_TITLE_TIMEOUT_MS],
      '/phrase-breakdown': [5, PHRASE_BREAKDOWN_MAX_TOKENS, PHRASE_BREAKDOWN_TIMEOUT_MS] };
    const route = routes[path];
    if (!route) throw unavailable();
    weight = route[0];
    deadlineMs = Math.min(245000, LLM_REGISTRY[backend].timeoutMs || route[2]);
    include(backend, 1, route[1]);
  }
  let maxAttempts = 0;
  let estimateMicros = 0;
  for (const [name, limit] of Object.entries(backendLimits)) {
    const rate = PRICING[MODELS[name]];
    maxAttempts += limit.maxAttempts;
    estimateMicros += limit.maxAttempts * (MAX_INPUT_BYTES * rate.inputPer1M + limit.maxOutputTokens * rate.outputPer1M);
  }
  const reserveMicros = Math.ceil(estimateMicros * 1.25);
  if (!Number.isSafeInteger(reserveMicros) || reserveMicros <= 0) throw unavailable();
  return { weight, reserveMicros, maxAttempts, deadlineMs, pricingVersion: pricing.pricingVersion, backendLimits };
}

module.exports = { parseRouteInput, buildWorkPlan, getPricingStatus };
