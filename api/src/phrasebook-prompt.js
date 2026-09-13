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

const LANGUAGE_NAMES = Object.freeze({
  es: 'Spanish',
  ja: 'Japanese',
  zh: 'Chinese',
  cs: 'Czech',
});

const READING_RULES = Object.freeze({
  ja: fs.readFileSync(path.join(__dirname, 'phrasebook-reading-rules-ja.txt'), 'utf8'),
  zh: fs.readFileSync(path.join(__dirname, 'phrasebook-reading-rules-zh.txt'), 'utf8'),
});

function substitute(template, values) {
  // Replace template slots once; client text is literal, including $& and {{...}}.
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (slot, name) => values[name] ?? slot);
}

function buildPhrasebookGenerationPrompt({ seed, language, ability, answers, checklist }) {
  const formattedAnswers = Object.entries(answers)
    .map(([question, answer]) => `- ${question}: ${answer}`)
    .join('\n');
  const formattedTopics = checklist.map((topic) => `- ${topic}`).join('\n');

  return substitute(GENERATION_TEMPLATE, {
    SEED: seed,
    LANGUAGE: LANGUAGE_NAMES[language],
    ANSWERS: formattedAnswers,
    TOPICS: formattedTopics,
    ABILITY: ability,
  });
}

function formatConversationLines(lines) {
  return lines
    .map((line, index) => `${index + 1}. ${line.speaker}${line.or ? ' (or)' : ''}: ${line.text}`)
    .join('\n');
}

function formatVocabulary(vocab) {
  return vocab.map((word, index) => `${index + 1}. ${word}`).join('\n');
}

function buildPhrasebookTranslationPrompt({ seed, language, conversation }) {
  return substitute(TRANSLATION_TEMPLATE, {
    READING_RULES: READING_RULES[language] || '',
    SEED: seed,
    LANGUAGE: LANGUAGE_NAMES[language],
    TITLE: conversation.title,
    LINES: formatConversationLines(conversation.lines),
    WORDS: formatVocabulary(conversation.vocab),
  });
}

module.exports = {
  buildPhrasebookGenerationPrompt,
  buildPhrasebookTranslationPrompt,
  formatConversationLines,
  formatVocabulary,
  LANGUAGE_NAMES,
};
