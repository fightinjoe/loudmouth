'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8');

function buildPhraseBreakdownPrompt({ language, text, translation, context }) {
  return {
    instructions: TEMPLATE,
    input: JSON.stringify({
      language,
      text,
      translation,
      ...(context === undefined ? {} : { context }),
    }),
  };
}

module.exports = { buildPhraseBreakdownPrompt };
