'use strict';

const { callAnthropic } = require('./llms/anthropic');
const { callOpenAI } = require('./llms/openai');
const { callGenAI, callGenAIFlash } = require('./llms/genai');

const DEFAULT_BACKEND = 'gemini-3.5-flash-lite';

const LLM_REGISTRY = Object.freeze({
  [DEFAULT_BACKEND]: callGenAI,
  'g-flash': callGenAIFlash,
  claude: callAnthropic,
  chatgpt: callOpenAI,
});

function getBackendName() {
  const name = process.env.LLM_BACKEND ?? DEFAULT_BACKEND;
  if (!Object.hasOwn(LLM_REGISTRY, name)) {
    throw new Error(
      `Invalid LLM_BACKEND: ${name}. Expected one of: ${Object.keys(LLM_REGISTRY).join(', ')}`,
    );
  }
  return name;
}

module.exports = {
  getBackendName,
  LLM_REGISTRY,
};
