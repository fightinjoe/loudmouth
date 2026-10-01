'use strict';

const {
  PARTS_OF_SPEECH,
  validatePhrasebookResponse,
} = require('../schema');
const { computeCostUsd } = require('../pricing');
const { getBackendName, getPhrasebookGenerationBackendName } = require('../llm-config');
const {
  parsePhrasebookRequest,
  validateGenerationResponse,
  validateTranslationResponse,
  assemblePhrasebook,
} = require('./parse');
const {
  buildPhrasebookGenerationPrompt,
  buildPhrasebookTranslationPrompt,
} = require('./prompt');

const PHRASEBOOK_GENERATION_MAX_TOKENS = 6000;
const PHRASEBOOK_TRANSLATION_MAX_TOKENS = 6000;
const PHRASEBOOK_CALL_TIMEOUT_MS = 15000;

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
  const models = new Set();
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let unknownCost = false;
  return {
    add(reply) {
      if (typeof reply?.model === 'string' && reply.model) models.add(reply.model);
      const input = reply?.usage?.inputTokens;
      const output = reply?.usage?.outputTokens;
      if (Number.isSafeInteger(input) && input >= 0) inputTokens += input;
      if (Number.isSafeInteger(output) && output >= 0) outputTokens += output;
      const reported = reply?.costUsd ?? reply?.usage?.costUsd;
      const cost = Number.isFinite(reported) && reported >= 0 ? reported
        : Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0
          ? computeCostUsd(reply?.model, { inputTokens: input, outputTokens: output }) : null;
      if (cost === null) unknownCost = true;
      else costUsd += cost;
    },
    unknown() { unknownCost = true; },
    report(fallbackModels, durationMs) {
      return {
        model: [...(models.size ? models : new Set(fallbackModels))].sort().join(' + '),
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd: unknownCost ? null : costUsd,
        durationMs: Math.max(0, Math.round(durationMs)),
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
  diagnostics = { failureLevel: 0 },
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
        if (error.reply) usageAccumulator.add(error.reply);
        else usageAccumulator.unknown();
        if (callController.signal.aborted) {
          throw reasonForAbort(callController.signal, 'LLM request cancelled');
        }
        if (!isRateLimitError(error) || attempt >= retryDelaysMs.length) throw error;

        diagnostics.failureLevel = 1;
        const delayMs = retryDelaysMs[attempt];
        console.warn({
          event: 'llm_rate_limit_retry',
          failureLevel: 1,
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

async function generateTopic({
  parsedRequest,
  handler,
  backendName,
  callTimeoutMs,
  signal,
  usageAccumulator,
  retryDelaysMs,
  diagnostics,
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
      diagnostics,
    });
    try {
      const generated = validateGenerationResponse(reply.text, parsedRequest.checklist);
      diagnostics.failureLevel = Math.max(diagnostics.failureLevel, generated.failureLevel);
      return generated;
    } catch (error) {
      console.error({
        event: 'validation_error',
        failureLevel: attempt >= GENERATION_VALIDATION_RETRIES ? 2 : 1,
        route: 'phrasebook:generate',
        llm: backendName,
        attempt: attempt + 1,
        error: error.message,
        raw: reply.text,
      });
      if (attempt >= GENERATION_VALIDATION_RETRIES) {
        throw new PhrasebookValidationError('Invalid response from LLM', { cause: error });
      }
      diagnostics.failureLevel = 1;
      console.warn({
        event: 'phrasebook_generation_retry',
        failureLevel: 1,
        llm: backendName,
        attempt: attempt + 1,
        error: error.message,
      });
    }
  }
}

async function generateConversations(args) {
  const controller = new AbortController();
  const unlink = linkAbortSignal(args.signal, controller);
  const conversations = new Array(args.parsedRequest.checklist.length);
  let nextIndex = 0;
  let failureLevel = 0;
  const worker = async () => {
    try {
      while (nextIndex < conversations.length) {
        if (controller.signal.aborted) throw reasonForAbort(controller.signal, 'Generation cancelled');
        const index = nextIndex++;
        const generated = await generateTopic({
          ...args,
          parsedRequest: { ...args.parsedRequest, checklist: [args.parsedRequest.checklist[index]] },
          signal: controller.signal,
        });
        conversations[index] = generated.conversations[0];
        failureLevel = Math.max(failureLevel, generated.failureLevel);
      }
    } catch (error) {
      if (!controller.signal.aborted) controller.abort(error);
      throw error;
    }
  };
  try {
    const settled = await Promise.allSettled(Array.from({ length: Math.min(4, conversations.length) }, worker));
    const failure = settled.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    return { conversations, failureLevel };
  } finally {
    unlink();
  }
}

/**
 * Native JSON schema for one translation call. Array counts are pinned to the
 * generated English source so providers cannot omit or add translated items.
 */
function buildTranslationResponseJsonSchema(conversation, language) {
  const text = { type: 'string', minLength: 1, maxLength: 2000 };
  const exactArray = (count, items) => ({ type: 'array', minItems: count, maxItems: count, items });
  // Property insertion order is part of the approved native translation request.
  const properties = {
    lines: exactArray(conversation.lines.length, text),
    essentials: exactArray(conversation.essentials.length, text),
    vocab: exactArray(conversation.vocab.length, {
      type: 'object',
      additionalProperties: false,
      required: ['target', 'partOfSpeech', 'senseKey'],
      properties: {
        target: text,
        partOfSpeech: { type: 'string', enum: [...PARTS_OF_SPEECH] },
        senseKey: { type: 'string', minLength: 1, maxLength: 120, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
        source: {
          type: 'object',
          additionalProperties: false,
          required: ['section', 'index', 'surface', 'occurrence'],
          properties: {
            section: { type: 'string', enum: ['essentials', 'dialogue'] },
            index: { type: 'integer', minimum: 0, maximum: Math.max(conversation.essentials.length, conversation.lines.length) - 1 },
            surface: text,
            occurrence: { type: 'integer', minimum: 0 },
          },
        },
      },
    }),
  };
  if (language === 'ja') {
    for (const [field, count] of [
      ['essentialsRomanizations', conversation.essentials.length],
      ['lineRomanizations', conversation.lines.length],
      ['vocabRomanizations', conversation.vocab.length],
    ]) properties[field] = exactArray(count, text);
  }
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
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
  diagnostics,
}) {
  const prompt = buildPhrasebookTranslationPrompt({
    seed: parsedRequest.seed,
    language: parsedRequest.language,
    ability: parsedRequest.ability,
    answers: parsedRequest.answers,
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
      diagnostics,
    });
    try {
      const translated = validateTranslationResponse(reply.text, conversation, parsedRequest.language);
      diagnostics.failureLevel = Math.max(diagnostics.failureLevel, translated.failureLevel);
      return translated;
    } catch (error) {
      console.error({
        event: 'validation_error',
        failureLevel: attempt >= TRANSLATION_VALIDATION_RETRIES ? 2 : 1,
        route: `phrasebook:translate:${conversationIndex}`,
        llm: backendName,
        attempt: attempt + 1,
        error: error.message,
        raw: reply.text,
      });
      if (attempt >= TRANSLATION_VALIDATION_RETRIES) {
        throw new PhrasebookValidationError('Invalid response from LLM', { cause: error });
      }
      diagnostics.failureLevel = 1;
      console.warn({
        event: 'phrasebook_translation_retry',
        failureLevel: 1,
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
    generationBackendName = getPhrasebookGenerationBackendName(),
    signal,
    retryDelaysMs = RATE_LIMIT_RETRY_DELAYS_MS,
  } = {},
) {
  const handler = registry[backendName];
  if (!handler) {
    throw new Error(`Configured LLM backend is not registered: ${backendName}`);
  }
  const generationHandler = registry[generationBackendName];
  if (!generationHandler) {
    throw new Error(`Configured generation backend is not registered: ${generationBackendName}`);
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
  const diagnostics = { failureLevel: 0 };

  try {
    const generated = await generateConversations({
      parsedRequest,
      handler: generationHandler,
      backendName: generationBackendName,
      callTimeoutMs: generationHandler.timeoutMs || timeoutMs,
      signal: pipelineController.signal,
      usageAccumulator,
      retryDelaysMs,
      diagnostics,
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
      diagnostics,
    });
    const response = assemblePhrasebook({
      seed: parsedRequest.seed,
      language: parsedRequest.language,
      conversations: generated.conversations,
      translations,
    });

    const elapsedMs = performance.now() - startedAt;
    const usage = usageAccumulator.report([generationBackendName, backendName], elapsedMs);
    const validatedResponse = validatePhrasebookResponse({ ...response, usage });
    if (validatedResponse.flags.length > 0) diagnostics.failureLevel = 1;
    const cardCount = validatedResponse.groups.reduce(
      (count, group) => count + group.essentials.length + group.dialogue.length + group.vocab.length,
      0,
    );
    console.log({
      event: 'phrasebook_ok',
      failureLevel: diagnostics.failureLevel,
      llm: backendName,
      language: parsedRequest.language,
      groups: response.groups.length,
      cards: cardCount,
      seed: parsedRequest.seed,
    });
    console.log({ event: 'usage', route: 'phrasebook', llm: backendName, ...usage, failureLevel: diagnostics.failureLevel });
    return validatedResponse;
  } catch (error) {
    const elapsedMs = performance.now() - startedAt;
    const usage = usageAccumulator.report([generationBackendName, backendName], elapsedMs);
    console.log({ event: 'usage', route: 'phrasebook:failed', llm: backendName, ...usage, failureLevel: 2 });

    if (error instanceof PhrasebookValidationError) {
      error.status = 502;
      throw error;
    }
    if (error instanceof PhrasebookTimeoutError || error instanceof PhrasebookCancelledError) {
      console.error({ event: 'llm_timeout', route: 'phrasebook', llm: backendName, error: error.message, failureLevel: 2 });
    } else {
      console.error({ event: 'llm_error', route: 'phrasebook', llm: backendName, error: error.message, stack: error.stack, failureLevel: 2 });
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
    console.warn({ event: 'request_invalid', route: 'phrasebook', failureLevel: 2, error: parsed.error });
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
    console.error({ event: 'request_failed', route: 'phrasebook', failureLevel: 2, status: error.status || 500 });
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
