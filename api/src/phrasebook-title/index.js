/** /phrasebook-title: independent, single-call UI naming. See docs/API_DESIGN.md. */
const { buildPhrasebookTitlePrompt } = require('./prompt');
const { buildUsageReport } = require('../pricing');
const { getBackendName } = require('../llm-config');

const PHRASEBOOK_TITLE_MAX_TOKENS = 256;
const PHRASEBOOK_TITLE_TIMEOUT_MS = 15000;
const MAX_TITLE_LENGTH = 80;

class PhrasebookTitleTimeoutError extends Error {}

function callWithTimeout(handler, prompt, opts, timeoutMs) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const error = new PhrasebookTitleTimeoutError(`LLM request timed out after ${timeoutMs}ms`);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
    handler(prompt, { ...opts, signal: controller.signal }).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function parsePhrasebookTitleRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  if (Object.hasOwn(body, 'llm')) {
    return { error: '"llm" is server-controlled and must not be provided' };
  }
  if (typeof body.seed !== 'string' || !body.seed.trim()) {
    return { error: '"seed" is required and must be a non-empty string' };
  }
  if (body.seed.length > 200) {
    return { error: '"seed" must be at most 200 characters' };
  }
  return { value: { seed: body.seed.trim() } };
}

function validatePhrasebookTitleResponse(raw) {
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || typeof data.title !== 'string' || !data.title.trim()) {
    throw new Error('"title" must be a non-empty string');
  }
  const title = data.title.trim();
  if (title.length > MAX_TITLE_LENGTH || /[\r\n]/.test(title)) {
    throw new Error('"title" must be a single line of at most 80 characters');
  }
  return { title };
}

async function performPhrasebookTitle(
  parsedRequest,
  registry,
  { timeoutMs = PHRASEBOOK_TITLE_TIMEOUT_MS } = {},
) {
  const { seed } = parsedRequest;
  const backendName = getBackendName();
  const handler = registry[backendName];
  if (!handler) {
    throw new Error(`Configured LLM backend is not registered: ${backendName}`);
  }
  const effectiveTimeoutMs = handler.timeoutMs || timeoutMs;

  const prompt = buildPhrasebookTitlePrompt({ seed });

  const startedAt = performance.now();
  let reply;
  try {
    reply = await callWithTimeout(handler, prompt, { maxOutputTokens: PHRASEBOOK_TITLE_MAX_TOKENS }, effectiveTimeoutMs);
  } catch (err) {
    if (err instanceof PhrasebookTitleTimeoutError) {
      console.error({ event: 'llm_timeout', route: 'phrasebook-title', llm: backendName, error: err.message });
    } else {
      console.error({ event: 'llm_error', route: 'phrasebook-title', llm: backendName, error: err.message, stack: err.stack });
    }
    const wrapped = new Error('LLM request failed');
    wrapped.status = 502;
    throw wrapped;
  }
  const durationMs = performance.now() - startedAt;

  let result;
  try {
    result = validatePhrasebookTitleResponse(reply.text);
  } catch (err) {
    console.error({ event: 'validation_error', route: 'phrasebook-title', llm: backendName, raw: reply.text, error: err.message });
    const wrapped = new Error('Invalid response from LLM');
    wrapped.status = 502;
    throw wrapped;
  }

  const usageReport = buildUsageReport(reply.model, reply.usage, durationMs);
  const { title } = result;
  console.log({ event: 'usage', route: 'phrasebook-title', llm: backendName, ...usageReport });

  return { title, usage: usageReport };
}

async function handlePhrasebookTitle(req, res, registry, opts = {}) {
  const parsed = parsePhrasebookTitleRequest(req.body || {});
  if (parsed.error) {
    return res.status(400).json({
      error: parsed.error,
    });
  }

  try {
    const response = await performPhrasebookTitle(parsed.value, registry, opts);
    return res.status(200).json(response);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
}

module.exports = {
  handlePhrasebookTitle,
  performPhrasebookTitle,
  parsePhrasebookTitleRequest,
  validatePhrasebookTitleResponse,
  PHRASEBOOK_TITLE_MAX_TOKENS,
  PHRASEBOOK_TITLE_TIMEOUT_MS,
};
