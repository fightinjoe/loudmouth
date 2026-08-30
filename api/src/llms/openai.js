const OpenAI = require('openai');

const OPENAI_MODEL = 'gpt-5.6-luna';

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

async function callOpenAI(prompt, { maxOutputTokens = 1024 } = {}) {
  const openai = getClient();

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: maxOutputTokens,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = completion?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('OpenAI returned a response with no text content');
  }

  return text;
}

// GPT-5.6 Luna can exceed the shared 15-second service budget while producing
// large JSON responses, especially for the /textbook generation call.
callOpenAI.timeoutMs = 60000;
callOpenAI.maxOutputTokens = 16384;

module.exports = { callOpenAI, OPENAI_MODEL };
