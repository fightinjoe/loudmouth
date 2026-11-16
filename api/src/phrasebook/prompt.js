'use strict';

const fs = require('node:fs');
const path = require('node:path');

const GENERATION_TEMPLATE = fs.readFileSync(
  path.join(__dirname, 'prompt.txt'),
  'utf8',
);
const TRANSLATION_TEMPLATE = fs.readFileSync(
  path.join(__dirname, 'translate-prompt.txt'),
  'utf8',
);

const READING_RULES = Object.freeze({
  ja: fs.readFileSync(path.join(__dirname, 'reading-rules-ja.txt'), 'utf8'),
  zh: fs.readFileSync(path.join(__dirname, 'reading-rules-zh.txt'), 'utf8'),
});

function withReadingRules(template, language) {
  return template.replace('{{READING_RULES}}', READING_RULES[language] || '');
}

/**
 * Builds the model request for one topic. `otherTopics` names the phrasebook's
 * other chapters so the model leaves their material to them.
 *
 * @param {{ seed: string, language: string, ability: string, answers: object, topic: string, otherTopics: string[] }} task
 * @returns {{ instructions: string, input: string }}
 */
function buildPhrasebookGenerationPrompt({ seed, language, ability, answers, topic, otherTopics }) {
  return {
    instructions: GENERATION_TEMPLATE,
    input: JSON.stringify({ seed, language, ability, answers, topic, otherTopics }),
  };
}

/**
 * @param {{ seed: string, language: string, ability: string, answers: object, topic: object }} task
 * @returns {{ instructions: string, input: string }}
 */
function buildPhrasebookTranslationPrompt({ seed, language, ability, answers, topic }) {
  return {
    instructions: withReadingRules(TRANSLATION_TEMPLATE, language),
    input: JSON.stringify({
      seed,
      language,
      ability,
      answers,
      topic,
    }),
  };
}

module.exports = {
  buildPhrasebookGenerationPrompt,
  buildPhrasebookTranslationPrompt,
};
