const { buildPrompt } = require('./prompt');
const { validateResponse } = require('./validate');
const { buildCardsPrompt } = require('./cards-prompt');
const { validateCardsResponse } = require('./cards-validate');
const { callAnthropic } = require('./llms/anthropic');
const { callOpenAI } = require('./llms/openai');
const { callGenAI } = require('./llms/genai');

const LLM_REGISTRY = {
  'google': callGenAI,
  'claude': callAnthropic,
  'chatgpt': callOpenAI,
};

const DEFAULT_LLM = 'google';
const DEFAULT_CARD_COUNT = 15;

async function handleTranslate(req, res) {
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
}

async function handleGenerateCards(req, res) {
  const { lang, topic, count: rawCount, llm: rawLlm } = req.body || {};

  if (lang !== 'zh' && lang !== 'ja') {
    return res.status(400).json({ error: 'Field "lang" must be "zh" or "ja"' });
  }
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'Missing or empty field: topic' });
  }

  const count = rawCount !== undefined ? Number(rawCount) : DEFAULT_CARD_COUNT;
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    return res.status(400).json({ error: 'Field "count" must be an integer between 1 and 50' });
  }

  const llm = rawLlm || DEFAULT_LLM;
  const handler = LLM_REGISTRY[llm];
  if (!handler) {
    return res.status(400).json({ error: `Unknown LLM: ${llm}`, supported: Object.keys(LLM_REGISTRY) });
  }

  const prompt = buildCardsPrompt(lang, count, topic);

  let raw;
  try {
    raw = await handler(prompt, { maxOutputTokens: 4096 });
  } catch (err) {
    console.error({ event: 'llm_error', llm, error: err.message, stack: err.stack });
    return res.status(502).json({ error: 'LLM request failed' });
  }

  let parsed;
  try {
    parsed = validateCardsResponse(raw);
  } catch (err) {
    console.error({ event: 'validation_error', llm, raw, error: err.message });
    return res.status(502).json({ error: 'Invalid response from LLM' });
  }

  console.log({ event: 'cards_ok', llm, lang, count: parsed.cards.length, topic });
  return res.status(200).json(parsed);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.translate = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const path = req.path || '/';

  if (path === '/translate' || path === '/') {
    return handleTranslate(req, res);
  }
  if (path === '/generate-cards') {
    return handleGenerateCards(req, res);
  }

  return res.status(404).json({ error: `Unknown path: ${path}` });
};
