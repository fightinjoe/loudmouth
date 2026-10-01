'use strict';

const { callAnthropic } = require('./llms/anthropic');
const { callOpenAI } = require('./llms/openai');
const { callGenAI, callGenAIFlash } = require('./llms/genai');
const { callDeepSeek } = require('./llms/openrouter');

const DEFAULT_BACKEND = 'gemini-3.5-flash-lite';

const LLM_REGISTRY = Object.freeze({
  [DEFAULT_BACKEND]: callGenAI,
  'deepseek-v4.1-flash': callDeepSeek,
  'g-flash': callGenAIFlash,
  claude: callAnthropic,
  chatgpt: callOpenAI,
});

function getBackendName() {
  const name = process.env.LLM_BACKEND ?? DEFAULT_BACKEND;
  const accepted = Object.keys(LLM_REGISTRY).filter(name => name !== 'deepseek-v4.1-flash');
  if (!accepted.includes(name)) {
    throw new Error(
      `Invalid LLM_BACKEND: ${name}. Expected one of: ${accepted.join(', ')}`,
    );
  }
  return name;
}

function getPhrasebookGenerationBackendName() {
  const name = process.env.PHRASEBOOK_GENERATION_BACKEND ?? 'deepseek-v4.1-flash';
  const accepted = ['deepseek-v4.1-flash', 'gemini-3.5-flash-lite'];
  if (!accepted.includes(name)) {
    throw new Error(`Invalid PHRASEBOOK_GENERATION_BACKEND: ${name}. Expected one of: ${accepted.join(', ')}`);
  }
  return name;
}

module.exports = {
  getBackendName,
  getPhrasebookGenerationBackendName,
  LLM_REGISTRY,
};
