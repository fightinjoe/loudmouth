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

// Haiku streams roughly 125 output tokens/sec, so a /textbook generate call
// (~2.6k-3.1k output tokens) measures 20-26s wall — well past the shared
// 15s default, which made every /textbook Claude request 502 on timeout
// (see evals/budget-report.md: claude FAILED every scene count on latency
// alone, with valid JSON). 60s matches the chatgpt and g-flash posture and
// leaves >2x headroom over the observed worst case.
callAnthropic.timeoutMs = 60000;

module.exports = { callAnthropic, ANTHROPIC_MODEL };
