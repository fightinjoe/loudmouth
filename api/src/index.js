const { handleLookup } = require('./lookup');
const { handleTextbook } = require('./textbook');
const { callAnthropic } = require('./llms/anthropic');
const { callOpenAI } = require('./llms/openai');
const { callGenAI } = require('./llms/genai');

const LLM_REGISTRY = {
  'google': callGenAI,
  'claude': callAnthropic,
  'chatgpt': callOpenAI,
};

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

  if (path === '/lookup') {
    return handleLookup(req, res, LLM_REGISTRY);
  }

  if (path === '/textbook') {
    return handleTextbook(req, res, LLM_REGISTRY);
  }

  return res.status(404).json({ error: `Unknown path: ${path}` });
};
