const OpenAI = require('openai');

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

async function callOpenAI(prompt) {
  const openai = getClient();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = completion?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('OpenAI returned a response with no text content');
  }

  return text;
}

module.exports = { callOpenAI };
