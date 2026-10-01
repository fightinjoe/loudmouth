const { handlePhrasebookTitle } = require('./phrasebook-title');
const { handleContext } = require('./context');
const { handlePhrasebook } = require('./phrasebook');
const { handlePhraseBreakdown } = require('./phrase-breakdown');
const { handlePhrasebookImage } = require('./phrasebook-image');
const { getBackendName, getPhrasebookGenerationBackendName, LLM_REGISTRY } = require('./llm-config');

// Fail during process startup rather than on the first request when the
// configured backend name is invalid.
getBackendName();
getPhrasebookGenerationBackendName();

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
    console.warn({ event: 'request_invalid', route: req.path || '/', failureLevel: 2, status: 405 });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const path = req.path || '/';

  if (path === '/phrasebook-title') {
    return handlePhrasebookTitle(req, res, LLM_REGISTRY);
  }
  if (path === '/phrase-breakdown') {
    return handlePhraseBreakdown(req, res, LLM_REGISTRY);
  }

  if (path === '/context') {
    return handleContext(req, res, LLM_REGISTRY);
  }

  if (path === '/phrasebook') {
    return handlePhrasebook(req, res, LLM_REGISTRY);
  }
  if (path === '/phrasebook-image') {
    return handlePhrasebookImage(req, res);
  }

  console.warn({ event: 'request_invalid', route: path, failureLevel: 2, status: 404 });
  return res.status(404).json({ error: `Unknown path: ${path}` });
};
