const OpenAI = require('openai');
const { serializeInput, checkResponse } = require('./bounds');
const { recordProviderReply, recordProviderFailure } = require('../protection/work');

const OPENAI_MODEL = 'gpt-5.6-luna';

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    client = new OpenAI({ apiKey, maxRetries: 0 });
  }
  return client;
}

/**
 * @param {{ instructions: string, input: string }} prompt
 * @param {{ maxOutputTokens?: number, signal?: AbortSignal }} options
 */
async function callOpenAI(prompt, { maxOutputTokens = 1024, signal } = {}) {
  const openai = getClient();

  const request = {
    model: OPENAI_MODEL,
    max_completion_tokens: maxOutputTokens,
    messages: [
      { role: 'developer', content: prompt.instructions },
      { role: 'user', content: prompt.input },
    ],
  };
  serializeInput(request);
  const completion = await openai.chat.completions.create(request, { signal }).catch(error => {
    recordProviderFailure(error);
    throw error;
  });
  const usage = completion?.usage || {};
  const reply = { model: OPENAI_MODEL, usage: {
    inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens,
  } };
  recordProviderReply(reply);
  checkResponse(completion);

  const text = completion?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('OpenAI returned a response with no text content');
  }

  return { ...reply, text };
}

// GPT-5.6 Luna can exceed the shared 15-second service budget while producing
// large phrasebook JSON responses.
callOpenAI.timeoutMs = 60000;
callOpenAI.maxOutputTokens = 16384;

module.exports = { callOpenAI, OPENAI_MODEL };
