'use strict';

const { toRomaji } = require('wanakana');
const { validateCard } = require('../card-validate');

const LANGUAGES = Object.freeze(['zh', 'ja', 'es', 'cs']);
const ABILITIES = Object.freeze(['none', 'basics', 'conversational']);

const MAX_SEED_LENGTH = 200;
const MAX_ANSWERS = 5;
const MAX_ANSWER_LABEL_LENGTH = 200;
const MAX_ANSWER_VALUE_LENGTH = 500;
const MIN_CHECKLIST_ITEMS = 1;
const MAX_CHECKLIST_ITEMS = 8;
const MAX_CHECKLIST_ITEM_LENGTH = 120;
const MIN_LINES_PER_CONVERSATION = 2;
const MAX_LINES_PER_CONVERSATION = 10;
const MIN_VOCAB_PER_CONVERSATION = 3;
const MAX_VOCAB_PER_CONVERSATION = 6;

const CJK_RUN_SOURCE = '[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff々〆ヶ]+';
const INLINE_READING_RE = new RegExp(`(${CJK_RUN_SOURCE})\\[([^\\[\\]]+)\\]`, 'gu');
const STRAY_BRACKET_GROUP_RE = /\[[^\[\]]*\]/gu;
const LONE_BRACKET_RE = /[\[\]]/gu;
const ENGLISH_TOKEN_RE = /[a-z]+(?:['’][a-z]+)*/giu;

const IRREGULAR_FORMS = Object.freeze({
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  become: ['became', 'become', 'becoming'],
  begin: ['began', 'begun', 'beginning'],
  bring: ['brought', 'bringing'],
  buy: ['bought', 'buying'],
  can: ['could'],
  catch: ['caught', 'catching'],
  choose: ['chose', 'chosen', 'choosing'],
  come: ['came', 'coming'],
  do: ['does', 'did', 'done', 'doing'],
  drink: ['drank', 'drunk', 'drinking'],
  eat: ['ate', 'eaten', 'eating'],
  far: ['farther', 'farthest', 'further', 'furthest'],
  feel: ['felt', 'feeling'],
  find: ['found', 'finding'],
  get: ['got', 'gotten', 'getting'],
  give: ['gave', 'given', 'giving'],
  go: ['went', 'gone', 'going'],
  good: ['better', 'best'],
  have: ['has', 'had', 'having'],
  hear: ['heard', 'hearing'],
  know: ['knew', 'known', 'knowing'],
  leave: ['left', 'leaving'],
  make: ['made', 'making'],
  meet: ['met', 'meeting'],
  pay: ['paid', 'paying'],
  read: ['reading'],
  run: ['ran', 'running'],
  say: ['said', 'saying'],
  see: ['saw', 'seen', 'seeing'],
  speak: ['spoke', 'spoken', 'speaking'],
  take: ['took', 'taken', 'taking'],
  teach: ['taught', 'teaching'],
  tell: ['told', 'telling'],
  think: ['thought', 'thinking'],
  understand: ['understood', 'understanding'],
  want: ['wanted', 'wanting'],
  wear: ['wore', 'worn', 'wearing'],
  write: ['wrote', 'written', 'writing'],
});

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePhrasebookRequest(body) {
  if (!isObject(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  if (Object.hasOwn(body, 'llm')) {
    return { error: 'Field "llm" is not accepted; the LLM backend is configured by the server' };
  }

  const { seed, language, ability, answers, checklist } = body;
  if (typeof seed !== 'string' || !seed.trim()) {
    return { error: '"seed" is required and must be a non-empty string' };
  }
  const normalizedSeed = seed.trim();
  if (normalizedSeed.length > MAX_SEED_LENGTH) {
    return { error: `"seed" must be at most ${MAX_SEED_LENGTH} characters` };
  }
  if (!LANGUAGES.includes(language)) {
    return { error: `"language" must be one of: ${LANGUAGES.join(', ')}`, supported: LANGUAGES };
  }
  if (!ABILITIES.includes(ability)) {
    return { error: `"ability" is required and must be one of: ${ABILITIES.join(', ')}`, supported: ABILITIES };
  }
  if (!isObject(answers)) {
    return { error: '"answers" is required and must be a JSON object' };
  }

  const answerEntries = Object.entries(answers);
  if (answerEntries.length > MAX_ANSWERS) {
    return { error: `"answers" must contain at most ${MAX_ANSWERS} entries` };
  }
  const normalizedAnswers = Object.create(null);
  for (const [rawLabel, rawValue] of answerEntries) {
    const label = rawLabel.trim();
    if (!label) {
      return { error: 'Every "answers" key must be non-empty' };
    }
    if (label.length > MAX_ANSWER_LABEL_LENGTH) {
      return { error: `Every "answers" key must be at most ${MAX_ANSWER_LABEL_LENGTH} characters` };
    }
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      return { error: `Answer for "${label}" must be a non-empty string` };
    }
    const value = rawValue.trim();
    if (value.length > MAX_ANSWER_VALUE_LENGTH) {
      return { error: `Answer for "${label}" must be at most ${MAX_ANSWER_VALUE_LENGTH} characters` };
    }
    if (Object.hasOwn(normalizedAnswers, label)) {
      return { error: `Duplicate answer key after trimming: "${label}"` };
    }
    normalizedAnswers[label] = value;
  }

  if (!Array.isArray(checklist)
    || checklist.length < MIN_CHECKLIST_ITEMS
    || checklist.length > MAX_CHECKLIST_ITEMS) {
    return { error: `"checklist" must contain ${MIN_CHECKLIST_ITEMS} to ${MAX_CHECKLIST_ITEMS} topics` };
  }
  const normalizedChecklist = [];
  for (let index = 0; index < checklist.length; index++) {
    const rawTopic = checklist[index];
    if (typeof rawTopic !== 'string' || !rawTopic.trim()) {
      return { error: `"checklist" item ${index} must be a non-empty string` };
    }
    const topic = rawTopic.trim();
    if (topic.length > MAX_CHECKLIST_ITEM_LENGTH) {
      return { error: `"checklist" item ${index} must be at most ${MAX_CHECKLIST_ITEM_LENGTH} characters` };
    }
    normalizedChecklist.push(topic);
  }

  return {
    value: {
      seed: normalizedSeed,
      language,
      ability,
      answers: normalizedAnswers,
      checklist: normalizedChecklist,
    },
  };
}

function parseModelJson(raw) {
  if (typeof raw !== 'string') {
    throw new Error(`Expected string from LLM, got ${typeof raw}`);
  }
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}. Raw (first 500 chars): ${cleaned.slice(0, 500)}`);
  }
  if (!isObject(parsed)) {
    throw new Error('Response must be a JSON object');
  }
  return parsed;
}

function validateGenerationResponse(raw, checklist) {
  const parsed = parseModelJson(raw);
  if (!Array.isArray(parsed.conversations)) {
    throw new Error('"conversations" must be an array');
  }
  if (parsed.conversations.length !== checklist.length) {
    throw new Error(`"conversations" count ${parsed.conversations.length} does not match checklist count ${checklist.length}`);
  }

  const conversations = parsed.conversations.map((conversation, conversationIndex) => {
    const prefix = `conversations[${conversationIndex}]`;
    if (!isObject(conversation)) {
      throw new Error(`${prefix} must be an object`);
    }
    const expectedTitle = checklist[conversationIndex];
    if (conversation.title !== expectedTitle) {
      throw new Error(`${prefix}.title must exactly match checklist[${conversationIndex}]`);
    }
    if (!Array.isArray(conversation.lines)
      || conversation.lines.length < MIN_LINES_PER_CONVERSATION
      || conversation.lines.length > MAX_LINES_PER_CONVERSATION) {
      throw new Error(`${prefix}.lines must contain ${MIN_LINES_PER_CONVERSATION} to ${MAX_LINES_PER_CONVERSATION} items`);
    }

    const seenSpeakers = new Set();
    const lines = conversation.lines.map((line, lineIndex) => {
      const linePrefix = `${prefix}.lines[${lineIndex}]`;
      if (!isObject(line)) {
        throw new Error(`${linePrefix} must be an object`);
      }
      if (line.speaker !== 'you' && line.speaker !== 'partner') {
        throw new Error(`${linePrefix}.speaker must be "you" or "partner"`);
      }
      if (typeof line.text !== 'string' || !line.text.trim()) {
        throw new Error(`${linePrefix}.text must be a non-empty string`);
      }
      const isAlternative = Object.hasOwn(line, 'or');
      if (isAlternative && line.or !== true) {
        throw new Error(`${linePrefix}.or must be true when present`);
      }
      // Accepted conversations can interleave alternatives with the other speaker.
      // The branch needs an earlier line by its speaker, not an adjacent one.
      if (isAlternative && !seenSpeakers.has(line.speaker)) {
        throw new Error(`${linePrefix} cannot be an alternative without an earlier line by its speaker`);
      }
      seenSpeakers.add(line.speaker);
      return {
        speaker: line.speaker,
        text: line.text.trim(),
        ...(isAlternative ? { or: true } : {}),
      };
    });

    if (!Array.isArray(conversation.vocab)
      || conversation.vocab.length < MIN_VOCAB_PER_CONVERSATION
      || conversation.vocab.length > MAX_VOCAB_PER_CONVERSATION) {
      throw new Error(`${prefix}.vocab must contain ${MIN_VOCAB_PER_CONVERSATION} to ${MAX_VOCAB_PER_CONVERSATION} items`);
    }
    const vocab = conversation.vocab.map((word, wordIndex) => {
      if (typeof word !== 'string' || !word.trim()) {
        throw new Error(`${prefix}.vocab[${wordIndex}] must be a non-empty string`);
      }
      return word.trim();
    });

    return { title: expectedTitle, lines, vocab };
  });

  return { conversations };
}

function stripStrayBrackets(text) {
  return text.replace(STRAY_BRACKET_GROUP_RE, '').replace(LONE_BRACKET_RE, '');
}

function appendUnannotated(tokens, text) {
  const cleaned = stripStrayBrackets(text);
  if (!cleaned) return;
  const previous = tokens[tokens.length - 1];
  if (previous?.[1] === null) {
    previous[0] += cleaned;
  } else {
    tokens.push([cleaned, null]);
  }
}

function parseInlineReading(value) {
  const tokens = [];
  let cursor = 0;
  for (const match of value.matchAll(INLINE_READING_RE)) {
    appendUnannotated(tokens, value.slice(cursor, match.index));
    tokens.push([match[1], match[2]]);
    cursor = match.index + match[0].length;
  }
  appendUnannotated(tokens, value.slice(cursor));
  return {
    text: tokens.map(([base]) => base).join(''),
    reading: tokens,
  };
}

function latinRomanization(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return /\p{Script=Latin}/u.test(normalized)
    && /^[\p{Script=Latin}\p{M}\p{N}\p{P}\p{Zs}]+$/u.test(normalized)
    ? normalized : undefined;
}

function validateTranslationResponse(raw, conversation, language) {
  const parsed = parseModelJson(raw);
  if (!Array.isArray(parsed.lines) || parsed.lines.length !== conversation.lines.length) {
    const count = Array.isArray(parsed.lines) ? parsed.lines.length : 'non-array';
    throw new Error(`"lines" count ${count} does not match source count ${conversation.lines.length}`);
  }
  if (!Array.isArray(parsed.vocab) || parsed.vocab.length !== conversation.vocab.length) {
    const count = Array.isArray(parsed.vocab) ? parsed.vocab.length : 'non-array';
    throw new Error(`"vocab" count ${count} does not match source count ${conversation.vocab.length}`);
  }

  const validateStrings = (values, field) => values.map((value, index) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${field}[${index}] must be a non-empty string`);
    }
    const normalized = value.trim();
    if (!parseInlineReading(normalized).text.trim()) {
      throw new Error(`${field}[${index}] is empty after removing stray reading brackets`);
    }
    return normalized;
  });

  const result = {
    lines: validateStrings(parsed.lines, 'lines'),
    vocab: validateStrings(parsed.vocab, 'vocab'),
  };
  if (language === 'ja') {
    for (const [field, targets] of [
      ['lineRomanizations', result.lines],
      ['vocabRomanizations', result.vocab],
    ]) {
      const supplied = parsed[field];
      // A count mismatch makes every index suspect; do not attach a shifted
      // model romanization to the wrong Japanese line.
      const aligned = Array.isArray(supplied) && supplied.length === targets.length;
      result[field] = targets.map((target, index) => {
        const normalized = aligned ? latinRomanization(supplied[index]) : undefined;
        if (normalized) return normalized;
        const kana = parseInlineReading(target).reading
          .map(([base, annotation]) => annotation ? ` ${annotation}` : base).join('');
        const romaji = toRomaji(kana).trim().replace(/ha(?=$|[\s\p{P}])/gu, 'wa');
        const fallback = latinRomanization(field === 'lineRomanizations'
          ? romaji.charAt(0).toUpperCase() + romaji.slice(1)
          : romaji);
        console.warn({
          event: 'phrasebook_romanization_fallback',
          field,
          index,
          reason: aligned ? 'invalid_entry' : 'unaligned_array',
          available: !!fallback,
        });
        // Unannotated kanji cannot be read mechanically. Keep the card rather
        // than return Japanese characters as romanization or fail the chunk.
        return fallback;
      });
    }
  }
  return result;
}

function buildCard({ language, target, romanization, translation, type, context, notes }) {
  const parsed = parseInlineReading(target);
  const card = {
    lang: language,
    text: parsed.text.trim(),
    translation,
    type,
    context,
    ...(notes ? { notes: JSON.stringify(notes) } : {}),
  };

  if (language === 'ja' || language === 'zh') {
    card.reading = parsed.reading;
  }
  if (language === 'ja' && romanization) card.romanization = romanization;

  validateCard(card, `${type} card`);
  return card;
}

function englishTokens(value) {
  return Array.from(value.normalize('NFKC').toLocaleLowerCase('en-US').matchAll(ENGLISH_TOKEN_RE), (match) => (
    match[0].replaceAll('’', "'")
  ));
}

function inflectedForms(word) {
  const forms = new Set([word]);
  for (const form of IRREGULAR_FORMS[word] || []) forms.add(form);

  if (word.endsWith('y') && word.length > 2 && !/[aeiou]y$/u.test(word)) {
    forms.add(`${word.slice(0, -1)}ies`);
    forms.add(`${word.slice(0, -1)}ied`);
  } else {
    forms.add(`${word}s`);
    forms.add(`${word}ed`);
  }
  if (/(?:s|x|z|ch|sh|o)$/u.test(word)) forms.add(`${word}es`);
  if (word.endsWith('e')) {
    forms.add(`${word}d`);
    forms.add(`${word.slice(0, -1)}ing`);
  } else {
    forms.add(`${word}ing`);
  }
  if (/[^aeiou][aeiou][^aeiouwxy]$/u.test(word)) {
    forms.add(`${word}${word.at(-1)}ed`);
    forms.add(`${word}${word.at(-1)}ing`);
  }
  if (word.endsWith('f')) forms.add(`${word.slice(0, -1)}ves`);
  if (word.endsWith('fe')) forms.add(`${word.slice(0, -2)}ves`);
  if (word.length > 2) {
    forms.add(`${word}er`);
    forms.add(`${word}est`);
    if (word.endsWith('e')) {
      forms.add(`${word}r`);
      forms.add(`${word}st`);
    }
  }
  return forms;
}

function lineContainsVocabulary(line, vocabulary) {
  const wanted = englishTokens(vocabulary);
  if (wanted.length === 0) return false;
  const actual = englishTokens(line);
  if (actual.length < wanted.length) return false;
  const acceptedByPosition = wanted.map(inflectedForms);

  for (let start = 0; start <= actual.length - wanted.length; start++) {
    if (acceptedByPosition.every((forms, offset) => forms.has(actual[start + offset]))) {
      return true;
    }
  }
  return false;
}

function findVocabularySource(vocabulary, conversations) {
  for (const conversation of conversations) {
    for (const line of conversation.lines) {
      if (lineContainsVocabulary(line.text, vocabulary)) return line.text;
    }
  }
  return undefined;
}

function assemblePhrasebook({ seed, language, conversations, translations }) {
  if (translations.length !== conversations.length) {
    throw new Error('Translation result count does not match conversation count');
  }

  const groups = conversations.map((conversation, conversationIndex) => {
    const translated = translations[conversationIndex];
    const cards = conversation.lines.map((line, lineIndex) => buildCard({
      language,
      target: translated.lines[lineIndex],
      romanization: translated.lineRomanizations?.[lineIndex],
      translation: line.text,
      type: 'phrase',
      context: conversation.title,
      notes: { speaker: line.speaker, ...(line.or ? { or: true } : {}) },
    }));
    const vocab = conversation.vocab.map((english, wordIndex) => {
      const source = findVocabularySource(english, [conversation]);
      const sourceIndex = conversation.lines.findIndex((line) => line.text === source);
      return buildCard({
        language,
        target: translated.vocab[wordIndex],
        romanization: translated.vocabRomanizations?.[wordIndex],
        translation: english,
        type: 'word',
        context: conversation.title,
        ...(sourceIndex < 0 ? {} : { notes: { source: cards[sourceIndex].text } }),
      });
    });

    return { title: conversation.title, cards, vocab };
  });

  return { title: seed, groups };
}

module.exports = {
  parsePhrasebookRequest,
  validateGenerationResponse,
  validateTranslationResponse,
  parseInlineReading,
  lineContainsVocabulary,
  findVocabularySource,
  assemblePhrasebook,
  LANGUAGES,
  ABILITIES,
  MAX_SEED_LENGTH,
  MAX_ANSWERS,
  MAX_ANSWER_LABEL_LENGTH,
  MAX_ANSWER_VALUE_LENGTH,
  MIN_CHECKLIST_ITEMS,
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_ITEM_LENGTH,
  MIN_LINES_PER_CONVERSATION,
  MAX_LINES_PER_CONVERSATION,
  MIN_VOCAB_PER_CONVERSATION,
  MAX_VOCAB_PER_CONVERSATION,
};
