'use strict';
const { serializeInput, readBoundedJson } = require('./bounds');
const { recordProviderReply, isTerminalRejection } = require('../protection/work');

const DEEPSEEK_MODEL = 'deepseek/deepseek-v4.1-flash';
// Last-resort cap: OpenRouter retries failed or timed-out providers, but a slow, still-streaming one only loses later traffic.
const DEEPSEEK_TIMEOUT_MS = 120000;
// OpenRouter routes across every DeepSeek provider: require_parameters keeps only those that support the
// strict response schema, the throughput preference (tokens/s over a rolling 5-minute window) moves slow
// providers to the back, and data_collection excludes providers that may store prompts. Providers that keep
// failing validation or quality are ignored (2026-11-13 live samples): Wafer and Novita write the schema's
// properties in alphabetical order, generating the example conversation first; Wafer then left required
// sections empty (3 of 8 calls failed) and Novita ran away to the 6,000-token limit. OpenInference wrote the
// English source in the target language and 14–35-turn exchanges in 3 of 4 replies.
const DEEPSEEK_PROVIDER_ROUTING = Object.freeze({
  allow_fallbacks: true,
  require_parameters: true,
  data_collection: 'deny',
  ignore: ['wafer', 'novita', 'open-inference'],
  preferred_min_throughput: { p90: 150 },
});

/**
 * One provider attempt; orchestration owns validation and retries. A strict schema fixes the reply's
 * structure; JSON mode alone still let providers misplace brackets inside strings (2026-11-13 live sample).
 */
async function callDeepSeek(prompt, { maxOutputTokens = 6000, signal, responseJsonSchema } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY environment variable is not set');
  const timeout = AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: requestSignal,
    body: serializeInput({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: prompt.instructions },
        { role: 'user', content: prompt.input },
      ],
      max_tokens: maxOutputTokens,
      reasoning: { enabled: false },
      provider: DEEPSEEK_PROVIDER_ROUTING,
      ...(responseJsonSchema ? {
        response_format: { type: 'json_schema', json_schema: { name: 'response', strict: true, schema: responseJsonSchema } },
      } : {}),
      stream: false,
    }),
  });
  let data;
  try {
    data = await readBoundedJson(response);
  } catch (cause) {
    const error = new Error('OpenRouter returned invalid JSON', { cause });
    error.status = cause.providerTerminal && !response.ok ? response.status : 502;
    error.providerTerminal = response.ok
      ? cause.providerTerminal === true : isTerminalRejection(response.status);
    throw error;
  }
  const usage = data?.usage;
  const reply = {
    model: typeof data?.model === 'string' && data.model ? data.model : DEEPSEEK_MODEL,
    ...(typeof data?.provider === 'string' ? { provider: data.provider } : {}),
    ...(usage ? { usage: {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
      ...(Number.isFinite(usage.cost) && usage.cost >= 0 ? { costUsd: usage.cost } : {}),
    } } : {}),
  };
  const choice = data?.choices?.[0];
  const text = choice?.message?.content;
  const upstreamError = data?.error || choice?.error;
  const terminal = response.ok && !upstreamError && choice?.finish_reason !== 'error'
    || isTerminalRejection(response.status)
    || (response.ok && isTerminalRejection(upstreamError?.code));
  recordProviderReply(reply, { terminal });
  if (!response.ok || data?.error || choice?.error || choice?.finish_reason !== 'stop'
    || typeof text !== 'string' || !text.trim()) {
    const error = new Error(!response.ok || upstreamError
      ? 'OpenRouter request failed'
      : 'OpenRouter returned an empty, truncated, or incomplete completion');
    error.status = response.ok ? 502 : response.status;
    if (upstreamError?.code !== undefined) error.code = upstreamError.code;
    // A completed request whose text is unusable (for example cut off at max_tokens) is a bad reply, not a provider failure.
    if (response.ok && !upstreamError) error.incomplete = true;
    error.reply = reply;
    error.providerTerminal = terminal;
    throw error;
  }
  return { ...reply, text };
}

callDeepSeek.timeoutMs = DEEPSEEK_TIMEOUT_MS;

module.exports = { callDeepSeek, DEEPSEEK_MODEL, DEEPSEEK_TIMEOUT_MS };
