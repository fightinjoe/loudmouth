/**
 * Prompt layer for /context. Prompt-first: the prompt text is the artifact,
 * authored and hand-tested in prompts/context/ (see its NOTES.md per version).
 * context-prompt.txt is the verbatim deployed copy of the accepted version and
 * must stay byte-identical to prompts/context/<accepted>/prompt.txt.
 */

const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'context-prompt.txt'), 'utf8');

const LANGUAGE_NAMES = {
  zh: 'Chinese',
  ja: 'Japanese',
  es: 'Spanish',
  cs: 'Czech',
};

/**
 * @param {{ seed: string, language: 'zh'|'ja'|'es'|'cs' }} params
 * @returns {string} the filled prompt
 */
function buildContextPrompt({ seed, language }) {
  return TEMPLATE
    .replaceAll('{{LANGUAGE}}', LANGUAGE_NAMES[language])
    .replaceAll('{{SEED}}', seed);
}

module.exports = { buildContextPrompt, LANGUAGE_NAMES };
