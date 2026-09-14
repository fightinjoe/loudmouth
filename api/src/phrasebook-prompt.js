'use strict';

const fs = require('node:fs');
const path = require('node:path');

const GENERATION_TEMPLATE = fs.readFileSync(
  path.join(__dirname, 'phrasebook-prompt.txt'),
  'utf8',
);
const TRANSLATION_TEMPLATE = fs.readFileSync(
  path.join(__dirname, 'phrasebook-translate-prompt.txt'),
  'utf8',
);

const READING_RULES = Object.freeze({
  ja: fs.readFileSync(path.join(__dirname, 'phrasebook-reading-rules-ja.txt'), 'utf8'),
  zh: fs.readFileSync(path.join(__dirname, 'phrasebook-reading-rules-zh.txt'), 'utf8'),
});

function withReadingRules(template, language) {
  return template.replace('{{READING_RULES}}', READING_RULES[language] || '');
}

/**
 * @param {{ seed: string, language: string, ability: string, answers: object, checklist: string[] }} task
 * @returns {{ instructions: string, input: string }}
 */
function buildPhrasebookGenerationPrompt({ seed, language, ability, answers, checklist }) {
  return {
    instructions: GENERATION_TEMPLATE,
    input: JSON.stringify({ seed, language, ability, answers, checklist }),
  };
}

/**
 * @param {{ seed: string, language: string, conversation: { title: string, lines: object[], vocab: string[] } }} task
 * @returns {{ instructions: string, input: string }}
 */
function buildPhrasebookTranslationPrompt({ seed, language, conversation }) {
  return {
    instructions: withReadingRules(TRANSLATION_TEMPLATE, language),
    input: JSON.stringify({
      seed,
      language,
      conversation: {
        title: conversation.title,
        lines: conversation.lines,
        vocab: conversation.vocab,
      },
    }),
  };
}

module.exports = {
  buildPhrasebookGenerationPrompt,
  buildPhrasebookTranslationPrompt,
};
