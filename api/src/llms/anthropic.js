const Anthropic = require('@anthropic-ai/sdk');

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

async function callAnthropic(prompt) {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    temperature: 0.2,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message?.content?.[0]?.text;

  if (!text) {
    throw new Error('Anthropic returned a response with no text content');
  }

  return text;
}

module.exports = { callAnthropic };
