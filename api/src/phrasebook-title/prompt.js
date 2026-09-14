/** Runtime prompt source for /phrasebook-title. */
const fs = require('node:fs');
const path = require('node:path');
const TEMPLATE = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8');

function buildPhrasebookTitlePrompt({ seed }) {
  return { instructions: TEMPLATE, input: JSON.stringify({ seed }) };
}

module.exports = { buildPhrasebookTitlePrompt };
