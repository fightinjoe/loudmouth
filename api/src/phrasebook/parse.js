'use strict';

const { randomUUID } = require('node:crypto');
const {
  PARTS_OF_SPEECH,
  PHRASEBOOK_SCHEMA_VERSION,
  validateCard,
  validateCandidate,
} = require('../schema');
const {
  parseInlineReading,
  latinRomanization,
  japanesePronunciation,
} = require('../reading');

const LANGUAGES = Object.freeze(['zh', 'ja', 'es', 'cs', 'uk']);
const { ABILITIES, DEFAULT_ABILITY, sanitizeAbility } = require('../ability');

const MAX_SEED_LENGTH = 200;
const MAX_ANSWERS = 5;
const MAX_ANSWER_LABEL_LENGTH = 200;
const MAX_ANSWER_VALUE_LENGTH = 500;
const MIN_CHECKLIST_ITEMS = 1;
const MAX_CHECKLIST_ITEMS = 8;
const MAX_CHECKLIST_ITEM_LENGTH = 120;
const MIN_LINES_PER_CONVERSATION = 2;
const MAX_LINES_PER_CONVERSATION = 10;
const MIN_ESSENTIALS_PER_CONVERSATION = 1;
const MAX_ESSENTIALS_PER_CONVERSATION = 8;
const MIN_VOCAB_PER_CONVERSATION = 0;
const MAX_VOCAB_PER_CONVERSATION = 10;

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
      ability: sanitizeAbility(ability) || DEFAULT_ABILITY,
      answers: normalizedAnswers,
      checklist: normalizedChecklist,
    },
  };
}

function parseModelJson(raw) {
  if (typeof raw !== 'string') {
    throw new Error(`Expected string from LLM, got ${typeof raw}`);
  }
  const cleaned = raw.trim();
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
  if (!Array.isArray(checklist) || checklist.length < MIN_CHECKLIST_ITEMS || checklist.length > MAX_CHECKLIST_ITEMS
    || checklist.some(title => typeof title !== 'string' || !title.trim() || title.length > MAX_CHECKLIST_ITEM_LENGTH)) {
    throw new Error('checklist must contain 1 to 8 bounded, nonblank topic titles');
  }
  const parsed = parseModelJson(raw);
  assertExactFields(parsed, ['conversations'], 'response');
  if (!Array.isArray(parsed.conversations) || parsed.conversations.length !== checklist.length) {
    throw new Error('"conversations" count must match checklist count');
  }
  let failureLevel = 0;
  const conversations = parsed.conversations.map((conversation, conversationIndex) => {
    const prefix = `conversations[${conversationIndex}]`;
    assertExactFields(conversation, ['title', 'essentials', 'vocab', 'lines'], prefix);
    if (conversation.title !== checklist[conversationIndex]) {
      throw new Error(`${prefix}.title must exactly match checklist[${conversationIndex}]`);
    }
    const sections = {};
    for (const [section, minimum, maximum] of [
      ['essentials', MIN_ESSENTIALS_PER_CONVERSATION, MAX_ESSENTIALS_PER_CONVERSATION],
      ['vocab', MIN_VOCAB_PER_CONVERSATION, MAX_VOCAB_PER_CONVERSATION],
    ]) {
      const values = conversation[section];
      if (!Array.isArray(values) || values.length < minimum) {
        throw new Error(`${prefix}.${section} must contain at least ${minimum} items`);
      }
      // Validate every entry before independent-list clamping; bad tails fail.
      values.forEach((value, index) => boundedString(value, `${prefix}.${section}[${index}]`));
      sections[section] = values.slice(0, maximum);
      if (values.length > maximum) {
        failureLevel = 1;
        console.warn({
          event: 'phrasebook_independent_list_clamped', failureLevel: 1,
          conversationIndex, section, received: values.length, retained: maximum,
        });
      }
    }
    if (!Array.isArray(conversation.lines)
      || conversation.lines.length < MIN_LINES_PER_CONVERSATION
      || conversation.lines.length > MAX_LINES_PER_CONVERSATION) {
      throw new Error(`${prefix}.lines must contain ${MIN_LINES_PER_CONVERSATION} to ${MAX_LINES_PER_CONVERSATION} items`);
    }
    const speakers = new Set();
    const lines = conversation.lines.map((line, index) => {
      const linePrefix = `${prefix}.lines[${index}]`;
      assertExactFields(line, ['speaker', 'text'], linePrefix);
      if (line.speaker !== 'you' && line.speaker !== 'partner') {
        throw new Error(`${linePrefix}.speaker must be "you" or "partner"`);
      }
      boundedString(line.text, `${linePrefix}.text`);
      speakers.add(line.speaker);
      return {
        speaker: line.speaker,
        text: line.text,
        ...(index > 0 && conversation.lines[index - 1].speaker === line.speaker ? { alternative: true } : {}),
      };
    });
    if (speakers.size !== 2) throw new Error(`${prefix}.lines must contain both speakers`);
    return { title: conversation.title, ...sections, lines };
  });
  return { conversations, failureLevel };
}

function boundedString(value, prefix) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) {
    throw new Error(`${prefix} must be a nonblank string of at most 2000 characters`);
  }
  return value;
}

function assertExactFields(value, allowed, prefix) {
  if (!isObject(value)) throw new Error(`${prefix} must be an object`);
  for (const field of Object.keys(value)) {
    if (!allowed.includes(field)) throw new Error(`${prefix}.${field} is not allowed`);
  }
}

function translatedString(value, prefix) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${prefix} must be a non-empty string`);
  }
  const normalized = value.trim();
  if (normalized.length > 2000) throw new Error(`${prefix} must be at most 2000 characters`);
  if (!parseInlineReading(normalized).text.trim()) {
    throw new Error(`${prefix} is empty after removing stray reading brackets`);
  }
  return normalized;
}

function validateSourceLocation(value, prefix, essentials, lines) {
  assertExactFields(value, ['section', 'index', 'surface', 'occurrence'], prefix);
  if (value.section !== 'essentials' && value.section !== 'dialogue') {
    throw new Error(`${prefix}.section must be essentials or dialogue`);
  }
  const section = value.section === 'essentials' ? essentials : lines;
  if (!Number.isSafeInteger(value.index) || value.index < 0 || value.index >= section.length) {
    throw new Error(`${prefix}.index must reference a translated phrase in its section`);
  }
  boundedString(value.surface, `${prefix}.surface`);
  if (value.surface !== value.surface.trim() || !/[\p{L}\p{N}]/u.test(value.surface)
    || parseInlineReading(value.surface).text !== value.surface) {
    throw new Error(`${prefix}.surface must be exact, unpadded target content without reading markup`);
  }
  if (!Number.isSafeInteger(value.occurrence) || value.occurrence < 0) {
    throw new Error(`${prefix}.occurrence must be a nonnegative integer`);
  }
  locateSurface(parseInlineReading(section[value.index]).text, value, prefix);
  return { section: value.section, index: value.index, surface: value.surface, occurrence: value.occurrence };
}

function validateTranslationResponse(raw, conversation, language) {
  const parsed = parseModelJson(raw);
  const romanizationFields = ['essentialsRomanizations', 'lineRomanizations', 'vocabRomanizations'];
  assertExactFields(parsed, ['lines', 'essentials', 'vocab', ...(language === 'ja' ? romanizationFields : [])], 'response');
  const result = { failureLevel: 0, flags: [] };
  for (const section of ['essentials', 'lines', 'vocab']) {
    if (!Array.isArray(parsed[section]) || parsed[section].length !== conversation[section].length) {
      throw new Error(`"${section}" count must match source count ${conversation[section].length}`);
    }
  }
  for (const section of ['essentials', 'lines']) {
    result[section] = parsed[section].map((value, index) => {
      const target = translatedString(value, `${section}[${index}]`);
      buildCard({
        language, target, type: 'phrase',
        translation: section === 'lines' ? conversation.lines[index].text : conversation.essentials[index],
      });
      return target;
    });
  }
  result.vocab = parsed.vocab.map((value, index) => {
    const prefix = `vocab[${index}]`;
    assertExactFields(value, ['target', 'partOfSpeech', 'senseKey', 'source'], prefix);
    const target = translatedString(value.target, `${prefix}.target`);
    if (!PARTS_OF_SPEECH.includes(value.partOfSpeech)) {
      throw new Error(`${prefix}.partOfSpeech must be a supported part of speech`);
    }
    if (typeof value.senseKey !== 'string' || value.senseKey.length > 120
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value.senseKey)) {
      throw new Error(`${prefix}.senseKey must be a lowercase kebab-case concept identifier`);
    }
    buildCard({
      language, target, type: 'word', translation: conversation.vocab[index],
      partOfSpeech: value.partOfSpeech, senseKey: value.senseKey,
    });
    let source;
    if (Object.hasOwn(value, 'source')) {
      try {
        source = validateSourceLocation(value.source, `${prefix}.source`, result.essentials, result.lines);
      } catch {
        result.flags.push({ code: 'vocab-source-missing', vocabIndex: index, reason: 'unresolved' });
        result.failureLevel = 1;
      }
    }
    return { target, partOfSpeech: value.partOfSpeech, senseKey: value.senseKey, ...(source === undefined ? {} : { source }) };
  });
  if (language === 'ja') {
    for (const [field, targets, capitalize] of [
      ['essentialsRomanizations', result.essentials, true],
      ['lineRomanizations', result.lines, true],
      ['vocabRomanizations', result.vocab.map(({ target }) => target), false],
    ]) {
      const supplied = parsed[field];
      // A count mismatch makes every index suspect; never attach shifted readings.
      const aligned = Array.isArray(supplied) && supplied.length === targets.length;
      if (!aligned) result.failureLevel = 1;
      result[field] = targets.map((target, index) => {
        const suppliedValue = aligned && typeof supplied[index] === 'string' && supplied[index].length <= 2000
          ? supplied[index] : undefined;
        const normalized = latinRomanization(suppliedValue);
        if (normalized) return normalized;
        const fallback = japanesePronunciation(parseInlineReading(target).reading, undefined, { capitalize });
        result.failureLevel = 1;
        console.warn({
          event: 'phrasebook_romanization_fallback', failureLevel: 1, field, index,
          reason: aligned ? 'invalid_entry' : 'unaligned_array', available: !!fallback,
        });
        return fallback;
      });
    }
  }
  return result;
}

function buildCard({
  language,
  target,
  romanization,
  translation,
  type,
  partOfSpeech,
  senseKey,
}) {
  const parsed = parseInlineReading(target);
  const card = {
    type,
    lang: language,
    text: parsed.text,
    translation,
    ...(type === 'word' ? { partOfSpeech, senseKey } : {}),
  };
  if ((language === 'ja' || language === 'zh')
    && type === 'word'
    && parsed.reading.some(([base, annotation]) => (
      annotation === null && /\p{Script=Han}/u.test(base)
    ))) {
    throw new Error(`${type} card.reading must annotate every dictionary-form Han character`);
  }

  if (language === 'ja' || language === 'zh') card.reading = parsed.reading;
  if (language === 'ja' && romanization) card.romanization = romanization;

  return validateCard(card, `${type} card`);
}

function snapshotForPhrase(card) {
  return {
    lang: card.lang,
    text: card.text,
    translation: card.translation,
    ...(card.reading === undefined ? {} : { reading: card.reading }),
    ...(card.romanization === undefined ? {} : { romanization: card.romanization }),
  };
}

function splitsSurrogatePair(text, offset) {
  if (offset <= 0 || offset >= text.length) return false;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff
    && after >= 0xdc00 && after <= 0xdfff;
}


function locateSurface(text, source, prefix) {
  let start = -1;
  let from = 0;
  for (let index = 0; index <= source.occurrence; index++) {
    start = text.indexOf(source.surface, from);
    if (start < 0) {
      throw new Error(`${prefix} does not select an existing surface occurrence`);
    }
    from = start + 1;
  }
  const end = start + source.surface.length;
  if (splitsSurrogatePair(text, start) || splitsSurrogatePair(text, end)) {
    throw new Error(`${prefix} must not split a UTF-16 surrogate pair`);
  }
  return { start, end };
}

function assemblePhrasebook({ seed, language, conversations, translations }) {
  if (translations.length !== conversations.length) {
    throw new Error('Translation result count does not match conversation count');
  }

  const flags = [];
  const groups = conversations.map((conversation, conversationIndex) => {
    const translated = translations[conversationIndex];
    const essentials = conversation.essentials.map((english, index) => ({
      id: randomUUID(),
      card: buildCard({
        language, target: translated.essentials[index], type: 'phrase', translation: english,
        romanization: translated.essentialsRomanizations?.[index],
      }),
    }));
    const dialogue = conversation.lines.map((line, index) => ({
      id: randomUUID(),
      card: buildCard({
        language, target: translated.lines[index], type: 'phrase', translation: line.text,
        romanization: translated.lineRomanizations?.[index],
      }),
      speaker: line.speaker,
      ...(index > 0 && conversation.lines[index - 1].speaker === line.speaker ? { alternative: true } : {}),
    }));
    const vocab = conversation.vocab.map((english, wordIndex) => {
      const translatedWord = translated.vocab[wordIndex];
      const card = buildCard({
        language,
        target: translatedWord.target,
        romanization: translated.vocabRomanizations?.[wordIndex],
        translation: english,
        type: 'word',
        partOfSpeech: translatedWord.partOfSpeech,
        senseKey: translatedWord.senseKey,
      });
      const source = translatedWord.source;
      const phrase = source === undefined ? undefined
        : (source.section === 'essentials' ? essentials : dialogue)[source.index];
      const candidate = {
        card,
        ...(source === undefined ? {} : {
          sources: [{
            snapshot: snapshotForPhrase(phrase.card),
            ref: { occurrenceId: phrase.id },
            span: locateSurface(
              phrase.card.text,
              source,
              `vocab[${wordIndex}].source`,
            ),
          }],
        }),
      };
      return validateCandidate(candidate, `group[${conversationIndex}].vocab[${wordIndex}]`);
    });
    for (const flag of translated.flags || []) {
      flags.push({ ...flag, groupIndex: conversationIndex });
    }

    return {
      id: randomUUID(),
      title: conversation.title,
      essentials,
      vocab,
      dialogue,
    };
  });

  return { schemaVersion: PHRASEBOOK_SCHEMA_VERSION, title: seed, groups, flags };
}

module.exports = {
  parsePhrasebookRequest,
  validateGenerationResponse,
  validateTranslationResponse,
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
  MIN_ESSENTIALS_PER_CONVERSATION,
  MAX_ESSENTIALS_PER_CONVERSATION,
  MIN_VOCAB_PER_CONVERSATION,
  MAX_VOCAB_PER_CONVERSATION,
};
