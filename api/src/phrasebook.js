'use strict';

const { buildUsageReport } = require('./pricing');
const { getBackendName } = require('./llm-config');
const {
  parsePhrasebookRequest,
  validateGenerationResponse,
  validateTranslationResponse,
  assemblePhrasebook,
} = require('./phrasebook-parse');
const {
  buildPhrasebookGenerationPrompt,
  buildPhrasebookTranslationPrompt,
} = require('./phrasebook-prompt');

const PHRASEBOOK_GENERATION_MAX_TOKENS = 6000;
const PHRASEBOOK_TRANSLATION_MAX_TOKENS = 4000;
const PHRASEBOOK_CALL_TIMEOUT_MS = 15000;

// The slow adapters advertise a 60-second timeout. In the maximum validation
// path, generation is called twice and the parallel translation stage has two
// serial rounds, for 4 x 60s = 240s. Backoff happens inside each logical call's
// timeout. Five seconds of orchestration headroom keeps the request bounded.
const PHRASEBOOK_DEADLINE_MS = 245000;
const GENERATION_VALIDATION_RETRIES = 1;
const TRANSLATION_VALIDATION_RETRIES = 1;
const RATE_LIMIT_RETRY_DELAYS_MS = Object.freeze([2000, 4000, 8000]);

class PhrasebookTimeoutError extends Error {}
class PhrasebookCancelledError extends Error {}
class PhrasebookValidationError extends Error {}

function reasonForAbort(signal, fallbackMessage) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new PhrasebookCancelledError(fallbackMessage);
}

function linkAbortSignal(source, controller) {
  if (!source) return () => {};
  const forward = () => {
    if (!controller.signal.aborted) {
      controller.abort(reasonForAbort(source, 'Phrasebook request cancelled'));
    }
  };
  if (source.aborted) {
    forward();
    return () => {};
  }
  source.addEventListener('abort', forward, { once: true });
  return () => source.removeEventListener('abort', forward);
}

function abortRace(signal) {
  let listener;
  const promise = new Promise((resolve, reject) => {
    listener = () => reject(reasonForAbort(signal, 'LLM request cancelled'));
    if (signal.aborted) listener();
    else signal.addEventListener('abort', listener, { once: true });
  });
  return {
    promise,
    dispose() {
      if (listener) signal.removeEventListener('abort', listener);
    },
  };
}

async function sleepWithAbort(delayMs, signal) {
  if (signal.aborted) throw reasonForAbort(signal, 'LLM request cancelled');
  const aborted = abortRace(signal);
  let timer;
  try {
    await Promise.race([
      new Promise((resolve) => { timer = setTimeout(resolve, delayMs); }),
      aborted.promise,
    ]);
  } finally {
    clearTimeout(timer);
    aborted.dispose();
  }
}

function isRateLimitError(error) {
  let current = error;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const status = current.status ?? current.statusCode ?? current.response?.status;
    if (Number(status) === 429 || current.code === 429 || current.code === '429') return true;
    if (/\b429\b|rate[ -]?limit|resource exhausted/iu.test(String(current.message || ''))) return true;
    current = current.cause;
  }
  return false;
}

function createUsageAccumulator() {
  let model;
  let inputTokens = 0;
  let outputTokens = 0;

  return {
    add(reply) {
      if (!model && typeof reply?.model === 'string') model = reply.model;
      const input = reply?.usage?.inputTokens;
      const output = reply?.usage?.outputTokens;
      if (Number.isFinite(input) && input > 0) inputTokens += input;
      if (Number.isFinite(output) && output > 0) outputTokens += output;
    },
    snapshot(fallbackModel) {
      return {
        model: model || fallbackModel,
        usage: { inputTokens, outputTokens },
      };
    },
  };
}

/**
 * Runs one logical LLM call. Rate-limit retries share the one call timeout,
 * rather than resetting it, so 429s cannot stretch the endpoint indefinitely.
 */
async function callLlmWithRateLimitRetry({
  handler,
  prompt,
  maxOutputTokens,
  responseJsonSchema,
  timeoutMs,
  signal,
  usageAccumulator,
  route,
  backendName,
  retryDelaysMs = RATE_LIMIT_RETRY_DELAYS_MS,
}) {
  const callController = new AbortController();
  const unlink = linkAbortSignal(signal, callController);
  const timeout = setTimeout(() => {
    if (!callController.signal.aborted) {
      callController.abort(new PhrasebookTimeoutError(`LLM request timed out after ${timeoutMs}ms`));
    }
  }, timeoutMs);

  try {
    for (let attempt = 0; ; attempt++) {
      if (callController.signal.aborted) {
        throw reasonForAbort(callController.signal, 'LLM request cancelled');
      }

      const aborted = abortRace(callController.signal);
      try {
        const reply = await Promise.race([
          Promise.resolve().then(() => handler(prompt, {
            maxOutputTokens,
            ...(responseJsonSchema ? { responseJsonSchema } : {}),
            signal: callController.signal,
          })),
          aborted.promise,
        ]);
        usageAccumulator.add(reply);
        return reply;
      } catch (error) {
        if (callController.signal.aborted) {
          throw reasonForAbort(callController.signal, 'LLM request cancelled');
        }
        if (!isRateLimitError(error) || attempt >= retryDelaysMs.length) throw error;

        const delayMs = retryDelaysMs[attempt];
        console.warn({
          event: 'llm_rate_limit_retry',
          route,
          llm: backendName,
          attempt: attempt + 1,
          delayMs,
        });
        await sleepWithAbort(delayMs, callController.signal);
      } finally {
        aborted.dispose();
      }
    }
  } finally {
    clearTimeout(timeout);
    unlink();
  }
}

async function generateConversations({
  parsedRequest,
  handler,
  backendName,
  callTimeoutMs,
  signal,
  usageAccumulator,
  retryDelaysMs,
}) {
  const prompt = buildPhrasebookGenerationPrompt(parsedRequest);
  for (let attempt = 0; ; attempt++) {
    const reply = await callLlmWithRateLimitRetry({
      handler,
      prompt,
      maxOutputTokens: PHRASEBOOK_GENERATION_MAX_TOKENS,
      timeoutMs: callTimeoutMs,
      signal,
      usageAccumulator,
      route: 'phrasebook:generate',
      backendName,
      retryDelaysMs,
    });
    try {
      return validateGenerationResponse(reply.text, parsedRequest.checklist);
    } catch (error) {
      console.error({
        event: 'validation_error',
        route: 'phrasebook:generate',
        llm: backendName,
        attempt: attempt + 1,
        error: error.message,
        raw: reply.text,
      });
      if (attempt >= GENERATION_VALIDATION_RETRIES) {
        throw new PhrasebookValidationError('Invalid response from LLM', { cause: error });
      }
      console.warn({
        event: 'phrasebook_generation_retry',
        llm: backendName,
        attempt: attempt + 1,
        error: error.message,
      });
    }
  }
}

/**
 * Native JSON schema for one translation call. Array counts are pinned to the
 * generated English source so providers cannot omit or add translated items.
 */
function buildTranslationResponseJsonSchema(conversation, language) {
  const responseJsonSchema = {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        items: { type: 'string' },
        minItems: conversation.lines.length,
        maxItems: conversation.lines.length,
      },
      vocab: {
        type: 'array',
        items: { type: 'string' },
        minItems: conversation.vocab.length,
        maxItems: conversation.vocab.length,
      },
    },
    required: ['lines', 'vocab'],
    additionalProperties: false,
  };
  if (language === 'ja') {
    responseJsonSchema.properties.lineRomanizations = responseJsonSchema.properties.lines;
    responseJsonSchema.properties.vocabRomanizations = responseJsonSchema.properties.vocab;
    responseJsonSchema.required.push('lineRomanizations', 'vocabRomanizations');
  }
  return responseJsonSchema;
}

async function translateConversation({
  parsedRequest,
  conversation,
  conversationIndex,
  handler,
  backendName,
  callTimeoutMs,
  signal,
  usageAccumulator,
  retryDelaysMs,
}) {
  const prompt = buildPhrasebookTranslationPrompt({
    seed: parsedRequest.seed,
    language: parsedRequest.language,
    conversation,
  });
  const responseJsonSchema = buildTranslationResponseJsonSchema(
    conversation,
    parsedRequest.language,
  );

  for (let attempt = 0; ; attempt++) {
    const reply = await callLlmWithRateLimitRetry({
      handler,
      prompt,
      maxOutputTokens: PHRASEBOOK_TRANSLATION_MAX_TOKENS,
      responseJsonSchema,
      timeoutMs: callTimeoutMs,
      signal,
      usageAccumulator,
      route: `phrasebook:translate:${conversationIndex}`,
      backendName,
      retryDelaysMs,
    });
    try {
      return validateTranslationResponse(reply.text, conversation, parsedRequest.language);
    } catch (error) {
      console.error({
        event: 'validation_error',
        route: `phrasebook:translate:${conversationIndex}`,
        llm: backendName,
        attempt: attempt + 1,
        error: error.message,
        raw: reply.text,
      });
      if (attempt >= TRANSLATION_VALIDATION_RETRIES) {
        throw new PhrasebookValidationError('Invalid response from LLM', { cause: error });
      }
      console.warn({
        event: 'phrasebook_translation_retry',
        llm: backendName,
        conversationIndex,
        attempt: attempt + 1,
        error: error.message,
      });
    }
  }
}

async function translateConversations(args) {
  const fanoutController = new AbortController();
  const unlink = linkAbortSignal(args.signal, fanoutController);
  const jobs = args.conversations.map((conversation, conversationIndex) => (
    translateConversation({
      ...args,
      conversation,
      conversationIndex,
      signal: fanoutController.signal,
    }).catch((error) => {
      if (!fanoutController.signal.aborted) fanoutController.abort(error);
      throw error;
    })
  ));

  try {
    const settled = await Promise.allSettled(jobs);
    const failure = settled.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
    return settled.map((result) => result.value);
  } finally {
    unlink();
  }
}

/**
 * Pure pipeline core: generate English conversations, fan out translations,
 * and assemble CARD_SCHEMA cards by index.
 */
async function performPhrasebook(
  parsedRequest,
  registry,
  {
    timeoutMs = PHRASEBOOK_CALL_TIMEOUT_MS,
    deadlineMs = PHRASEBOOK_DEADLINE_MS,
    backendName = getBackendName(),
    signal,
    retryDelaysMs = RATE_LIMIT_RETRY_DELAYS_MS,
  } = {},
) {
  const handler = registry[backendName];
  if (!handler) {
    throw new Error(`Configured LLM backend is not registered: ${backendName}`);
  }
  const callTimeoutMs = handler.timeoutMs || timeoutMs;
  const pipelineController = new AbortController();
  const unlink = linkAbortSignal(signal, pipelineController);
  const deadline = setTimeout(() => {
    if (!pipelineController.signal.aborted) {
      pipelineController.abort(new PhrasebookTimeoutError(`Phrasebook request timed out after ${deadlineMs}ms`));
    }
  }, deadlineMs);
  const usageAccumulator = createUsageAccumulator();
  const startedAt = performance.now();

  try {
    const generated = await generateConversations({
      parsedRequest,
      handler,
      backendName,
      callTimeoutMs,
      signal: pipelineController.signal,
      usageAccumulator,
      retryDelaysMs,
    });
    const translations = await translateConversations({
      parsedRequest,
      conversations: generated.conversations,
      handler,
      backendName,
      callTimeoutMs,
      signal: pipelineController.signal,
      usageAccumulator,
      retryDelaysMs,
    });
    const response = assemblePhrasebook({
      seed: parsedRequest.seed,
      language: parsedRequest.language,
      conversations: generated.conversations,
      translations,
    });

    const elapsedMs = performance.now() - startedAt;
    const totals = usageAccumulator.snapshot(backendName);
    const usage = buildUsageReport(totals.model, totals.usage, elapsedMs);
    const cardCount = response.groups.reduce((count, group) => count + group.cards.length, 0);
    console.log({
      event: 'phrasebook_ok',
      llm: backendName,
      language: parsedRequest.language,
      groups: response.groups.length,
      cards: cardCount,
      seed: parsedRequest.seed,
    });
    console.log({ event: 'usage', route: 'phrasebook', llm: backendName, ...usage });
    return { ...response, usage };
  } catch (error) {
    const elapsedMs = performance.now() - startedAt;
    const totals = usageAccumulator.snapshot(backendName);
    const usage = buildUsageReport(totals.model, totals.usage, elapsedMs);
    console.log({ event: 'usage', route: 'phrasebook:failed', llm: backendName, ...usage });

    if (error instanceof PhrasebookValidationError) {
      error.status = 502;
      throw error;
    }
    if (error instanceof PhrasebookTimeoutError || error instanceof PhrasebookCancelledError) {
      console.error({ event: 'llm_timeout', route: 'phrasebook', llm: backendName, error: error.message });
    } else {
      console.error({ event: 'llm_error', route: 'phrasebook', llm: backendName, error: error.message, stack: error.stack });
    }
    const wrapped = new Error('LLM request failed', { cause: error });
    wrapped.status = 502;
    throw wrapped;
  } finally {
    clearTimeout(deadline);
    unlink();
    if (!pipelineController.signal.aborted) {
      pipelineController.abort(new PhrasebookCancelledError('Phrasebook request complete'));
    }
  }
}

/**
 * Express/Cloud Functions handler for POST /phrasebook.
 */
async function handlePhrasebook(req, res, registry, opts = {}) {
  const parsed = parsePhrasebookRequest(req.body || {});
  if (parsed.error) {
    return res.status(400).json({
      error: parsed.error,
      ...(parsed.supported ? { supported: parsed.supported } : {}),
    });
  }

  const requestController = new AbortController();
  const onRequestAborted = () => {
    if (!requestController.signal.aborted) {
      requestController.abort(new PhrasebookCancelledError('Client disconnected'));
    }
  };
  if (typeof req.once === 'function') req.once('aborted', onRequestAborted);
  // IncomingMessage's "aborted" does not fire when the body was already read.
  // A disconnect while generating instead closes the unfinished response.
  const onResponseClosed = () => {
    if (!res.writableEnded) onRequestAborted();
  };
  if (typeof res.once === 'function') res.once('close', onResponseClosed);
  const unlink = linkAbortSignal(opts.signal, requestController);

  try {
    const response = await performPhrasebook(parsed.value, registry, {
      ...opts,
      signal: requestController.signal,
    });
    return res.status(200).json(response);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  } finally {
    unlink();
    if (typeof req.removeListener === 'function') req.removeListener('aborted', onRequestAborted);
    if (typeof res.removeListener === 'function') res.removeListener('close', onResponseClosed);
  }
}

module.exports = {
  handlePhrasebook,
  performPhrasebook,
  callLlmWithRateLimitRetry,
  buildTranslationResponseJsonSchema,
  isRateLimitError,
  PHRASEBOOK_GENERATION_MAX_TOKENS,
  PHRASEBOOK_TRANSLATION_MAX_TOKENS,
  PHRASEBOOK_CALL_TIMEOUT_MS,
  PHRASEBOOK_DEADLINE_MS,
  GENERATION_VALIDATION_RETRIES,
  TRANSLATION_VALIDATION_RETRIES,
  RATE_LIMIT_RETRY_DELAYS_MS,
  PhrasebookTimeoutError,
  PhrasebookCancelledError,
  PhrasebookValidationError,
};
