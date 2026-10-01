'use strict';

const DEEPSEEK_MODEL = 'deepseek/deepseek-v4.1-flash';
const DEEPSEEK_TIMEOUT_MS = 120000;

/** One provider attempt; orchestration owns validation and rate-limit retries. */
async function callDeepSeek(prompt, { maxOutputTokens = 6000, signal } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY environment variable is not set');
  const timeout = AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: requestSignal,
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: prompt.instructions },
        { role: 'user', content: prompt.input },
      ],
      max_tokens: maxOutputTokens,
      reasoning: { enabled: false },
      provider: { only: ['relace'], allow_fallbacks: false, require_parameters: true },
      stream: false,
    }),
  });
  let data;
  try {
    data = await response.json();
  } catch (cause) {
    const error = new Error('OpenRouter returned invalid JSON', { cause });
    error.status = response.status;
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
  if (!response.ok || data?.error || choice?.error || choice?.finish_reason !== 'stop'
    || typeof text !== 'string' || !text.trim()) {
    const upstreamError = data?.error || choice?.error;
    const error = new Error(!response.ok || upstreamError
      ? 'OpenRouter request failed'
      : 'OpenRouter returned an empty, truncated, or incomplete completion');
    error.status = response.ok ? 502 : response.status;
    if (upstreamError?.code !== undefined) error.code = upstreamError.code;
    error.reply = reply;
    throw error;
  }
  return { ...reply, text };
}

callDeepSeek.timeoutMs = DEEPSEEK_TIMEOUT_MS;

module.exports = { callDeepSeek, DEEPSEEK_MODEL, DEEPSEEK_TIMEOUT_MS };
