/**
 * Prompt text is authored and hand-tested in prompts/context/prompt.txt.
 * context-prompt.txt is the byte-identical deployed copy.
 */

const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'context-prompt.txt'), 'utf8');

/**
 * @param {{ seed: string, language: 'zh'|'ja'|'es'|'cs' }} params
 * @returns {{ instructions: string, input: string }}
 */
function buildContextPrompt({ seed, language }) {
  return {
    instructions: TEMPLATE,
    input: JSON.stringify({ seed, language }),
  };
}

module.exports = { buildContextPrompt };
