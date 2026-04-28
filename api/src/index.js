const { buildPrompt } = require('./prompt');
const { validateResponse } = require('./validate');
const { callAnthropic } = require('./llms/anthropic');
const { callOpenAI } = require('./llms/openai');
const { callGenAI } = require('./llms/genai');

const LLM_REGISTRY = {
  'google': callGenAI,
  'claude': callAnthropic,
  'chatgpt': callOpenAI,
};

exports.translate = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, targetLanguage, llm } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing or empty field: text' });
  }
  if (!targetLanguage || typeof targetLanguage !== 'string' || !targetLanguage.trim()) {
    return res.status(400).json({ error: 'Missing or empty field: targetLanguage' });
  }
  if (!llm || typeof llm !== 'string' || !llm.trim()) {
    return res.status(400).json({ error: 'Missing or empty field: llm' });
  }

  const handler = LLM_REGISTRY[llm];
  if (!handler) {
    return res.status(400).json({ error: `Unknown LLM: ${llm}`, supported: Object.keys(LLM_REGISTRY) });
  }

  const prompt = buildPrompt(text, targetLanguage);

  let raw;
  try {
    raw = await handler(prompt);
  } catch (err) {
    console.error({ event: 'llm_error', llm, error: err.message, stack: err.stack });
    return res.status(502).json({ error: 'LLM request failed' });
  }

  let parsed;
  try {
    parsed = validateResponse(raw);
  } catch (err) {
    console.error({ event: 'validation_error', llm, raw, error: err.message });
    return res.status(502).json({ error: 'Invalid response from LLM' });
  }

  console.log({ event: 'translation_ok', llm, targetLanguage, inputLength: text.length });
  return res.status(200).json(parsed);
};
