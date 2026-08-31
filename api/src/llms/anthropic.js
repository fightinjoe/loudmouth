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

async function callAnthropic(prompt, { maxOutputTokens = 1024 } = {}) {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    temperature: 0.2,
    max_tokens: maxOutputTokens,
    messages: [{ role: 'user', content: prompt }],
  });

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
// Claude Haiku 4.5 accepts at most 8,192 output tokens. The route handlers
// read this capability to avoid sending the shared 30,000-token ceiling,
// which Anthropic rejects before generation.
callAnthropic.maxOutputTokens = 8192;

module.exports = { callAnthropic, ANTHROPIC_MODEL };
