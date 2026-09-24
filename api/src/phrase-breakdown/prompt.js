'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8');

function buildPhraseBreakdownPrompt(request) {
  return {
    instructions: TEMPLATE,
    input: JSON.stringify({
      source: request.source.snapshot,
      ...(request.context === undefined ? {} : { context: request.context }),
    }),
  };
}

module.exports = { buildPhraseBreakdownPrompt };
