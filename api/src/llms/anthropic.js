const Anthropic = require('@anthropic-ai/sdk');

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * @param {{ instructions: string, input: string }} prompt
 * @param {{ maxOutputTokens?: number, signal?: AbortSignal }} options
 */
async function callAnthropic(prompt, { maxOutputTokens = 1024, signal } = {}) {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    temperature: 0.2,
    max_tokens: maxOutputTokens,
    system: prompt.instructions,
    messages: [{ role: 'user', content: prompt.input }],
  }, { signal });

  const text = message?.content?.[0]?.text;

  if (!text) {
    throw new Error('Anthropic returned a response with no text content');
  }

  const usage = message?.usage || {};
  return {
    text,
    model: ANTHROPIC_MODEL,
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    },
  };
}
// Claude Haiku 4.5 accepts at most 8,192 output tokens. Expose that
// capability so route and evaluation callers never request more.
callAnthropic.maxOutputTokens = 8192;

// Large phrasebook translation responses can exceed the shared 15-second
// request budget on Claude Haiku. Keep the provider timeout aligned with the
// other slower adapters; the route-level deadline still bounds the pipeline.
callAnthropic.timeoutMs = 60000;

module.exports = { callAnthropic, ANTHROPIC_MODEL };
