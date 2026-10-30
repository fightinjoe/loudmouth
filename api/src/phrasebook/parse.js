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
const MAX_THINGS_TO_SAY = 8;
const MAX_WORDS = 10;

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
  assertExactFields(parsed, ['topics'], 'response');
  if (!Array.isArray(parsed.topics) || parsed.topics.length !== checklist.length) {
    throw new Error('"topics" count must match checklist count');
  }
  let failureLevel = 0;
  const topics = parsed.topics.map((topic, topicIndex) => {
    const prefix = `topics[${topicIndex}]`;
    assertExactFields(topic, ['title', 'thingsToSay', 'likelyExchanges', 'words', 'exampleConversation'], prefix);
    if (topic.title !== checklist[topicIndex]) {
      throw new Error(`${prefix}.title must exactly match checklist[${topicIndex}]`);
    }
    const clampWarning = (section, received, retained) => {
      failureLevel = 1;
      console.warn({ event: 'phrasebook_independent_list_clamped', failureLevel: 1, topicIndex, section, received, retained });
    };
    if (!Array.isArray(topic.thingsToSay) || topic.thingsToSay.length < 1) {
      throw new Error(`${prefix}.thingsToSay must contain at least 1 item`);
    }
    topic.thingsToSay.forEach((value, index) => boundedString(value, `${prefix}.thingsToSay[${index}]`));
    const thingsToSay = topic.thingsToSay.slice(0, MAX_THINGS_TO_SAY);
    if (thingsToSay.length < topic.thingsToSay.length) clampWarning('thingsToSay', topic.thingsToSay.length, thingsToSay.length);
    const validateTurns = (lines, field, maximum, options) => {
      if (!Array.isArray(lines) || lines.length < 2 || lines.length > maximum) {
        throw new Error(`${field} must contain 2 to ${maximum} turns`);
      }
      return lines.map((line, index) => {
        const linePrefix = `${field}[${index}]`;
        assertExactFields(line, ['speaker', 'text'], linePrefix);
        if (line.speaker !== 'you' && line.speaker !== 'partner') throw new Error(`${linePrefix}.speaker must be you or partner`);
        if (index > 0 && line.speaker === lines[index - 1].speaker) throw new Error(`${field} must alternate speakers`);
        if (options) {
          if (!Array.isArray(line.text) || line.text.length < 1 || line.text.length > 3) {
            throw new Error(`${linePrefix}.text must contain 1 to 3 responses`);
          }
          line.text.forEach((text, option) => boundedString(text, `${linePrefix}.text[${option}]`));
        } else boundedString(line.text, `${linePrefix}.text`);
        return { speaker: line.speaker, text: line.text };
      });
    };
    if (!Array.isArray(topic.likelyExchanges) || topic.likelyExchanges.length < 1 || topic.likelyExchanges.length > 4) {
      throw new Error(`${prefix}.likelyExchanges must contain 1 to 4 exchanges`);
    }
    const likelyExchanges = topic.likelyExchanges.map((exchange, index) => {
      const field = `${prefix}.likelyExchanges[${index}]`;
      assertExactFields(exchange, ['title', 'lines'], field);
      boundedTitle(exchange.title, `${field}.title`);
      return { title: exchange.title, lines: validateTurns(exchange.lines, `${field}.lines`, 4, true) };
    });
    if (!Array.isArray(topic.words)) throw new Error(`${prefix}.words must be an array`);
    // Validate all families, including overflow, before dropping any independent items.
    let received = 0;
    for (const [index, family] of topic.words.entries()) {
      const field = `${prefix}.words[${index}]`;
      assertExactFields(family, ['title', 'items'], field);
      boundedTitle(family.title, `${field}.title`);
      if (!Array.isArray(family.items) || family.items.length < 2) throw new Error(`${field}.items must contain at least 2 words`);
      family.items.forEach((word, item) => boundedString(word, `${field}.items[${item}]`));
      received += family.items.length;
    }
    const words = [];
    let remaining = MAX_WORDS;
    for (const family of topic.words) {
      if (remaining < 2) break;
      const items = family.items.slice(0, remaining);
      words.push({ title: family.title, items });
      remaining -= items.length;
    }
    if (received > MAX_WORDS) clampWarning('words', received, MAX_WORDS - remaining);
    const exampleConversation = validateTurns(topic.exampleConversation, `${prefix}.exampleConversation`, 10, false);
    return { title: topic.title, thingsToSay, likelyExchanges, words, exampleConversation };
  });
  return { topics, failureLevel };
}

function boundedTitle(value, prefix) {
  boundedString(value, prefix);
  if (value.length > MAX_CHECKLIST_ITEM_LENGTH) throw new Error(`${prefix} must be at most ${MAX_CHECKLIST_ITEM_LENGTH} characters`);
}

// One shared traversal defines translation indexes and assembly indexes.
function flattenTopic(topic) {
  return {
    phrases: [
      ...topic.thingsToSay,
      ...topic.likelyExchanges.flatMap(exchange => exchange.lines.flatMap(line => line.text)),
      ...topic.exampleConversation.map(line => line.text),
    ],
    words: topic.words.flatMap(family => family.items),
  };
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

function validateSourceLocation(value, prefix, phrases) {
  assertExactFields(value, ['phraseIndex', 'surface', 'occurrence'], prefix);
  if (!Number.isSafeInteger(value.phraseIndex) || value.phraseIndex < 0 || value.phraseIndex >= phrases.length) {
    throw new Error(`${prefix}.phraseIndex must reference a translated phrase`);
  }
  boundedString(value.surface, `${prefix}.surface`);
  if (value.surface !== value.surface.trim() || !/[\p{L}\p{N}]/u.test(value.surface)
    || parseInlineReading(value.surface).text !== value.surface) {
    throw new Error(`${prefix}.surface must be exact, unpadded target content without reading markup`);
  }
  if (!Number.isSafeInteger(value.occurrence) || value.occurrence < 0) {
    throw new Error(`${prefix}.occurrence must be a nonnegative integer`);
  }
  locateSurface(parseInlineReading(phrases[value.phraseIndex]).text, value, prefix);
  return { phraseIndex: value.phraseIndex, surface: value.surface, occurrence: value.occurrence };
}

function validateTranslationResponse(raw, topic, language) {
  const parsed = parseModelJson(raw);
  const english = flattenTopic(topic);
  const romanizationFields = ['phraseRomanizations', 'wordRomanizations'];
  assertExactFields(parsed, ['phrases', 'words', ...(language === 'ja' ? romanizationFields : [])], 'response');
  const result = { failureLevel: 0, flags: [] };
  for (const section of ['phrases', 'words']) {
    if (!Array.isArray(parsed[section]) || parsed[section].length !== english[section].length) {
      throw new Error(`"${section}" count must match source count ${english[section].length}`);
    }
  }
  result.phrases = parsed.phrases.map((value, index) => {
    const target = translatedString(value, `phrases[${index}]`);
    buildCard({ language, target, type: 'phrase', translation: english.phrases[index] });
    return target;
  });
  result.words = parsed.words.map((value, index) => {
    const prefix = `words[${index}]`;
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
      language, target, type: 'word', translation: english.words[index],
      partOfSpeech: value.partOfSpeech, senseKey: value.senseKey,
    });
    let source;
    if (Object.hasOwn(value, 'source')) {
      try {
        source = validateSourceLocation(value.source, `${prefix}.source`, result.phrases);
      } catch {
        result.flags.push({ code: 'vocab-source-missing', wordIndex: index, reason: 'unresolved' });
        result.failureLevel = 1;
      }
    }
    return { target, partOfSpeech: value.partOfSpeech, senseKey: value.senseKey, ...(source === undefined ? {} : { source }) };
  });
  if (language === 'ja') {
    for (const [field, targets, capitalize] of [
      ['phraseRomanizations', result.phrases, true],
      ['wordRomanizations', result.words.map(({ target }) => target), false],
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

function assemblePhrasebook({ seed, language, topics, translations }) {
  if (translations.length !== topics.length) throw new Error('Translation result count does not match topic count');
  const flags = [];
  const groups = topics.map((topic, topicIndex) => {
    const translated = translations[topicIndex];
    const source = flattenTopic(topic);
    const phrases = source.phrases.map((english, index) => ({
      id: randomUUID(),
      card: buildCard({
        language, target: translated.phrases[index], type: 'phrase', translation: english,
        romanization: translated.phraseRomanizations?.[index],
      }),
    }));
    let phraseIndex = 0;
    const thingsToSay = topic.thingsToSay.map(() => phrases[phraseIndex++]);
    const likelyExchanges = topic.likelyExchanges.map(exchange => ({
      id: randomUUID(), title: exchange.title,
      lines: exchange.lines.map(line => ({
        speaker: line.speaker, responses: line.text.map(() => phrases[phraseIndex++]),
      })),
    }));
    const exampleConversation = topic.exampleConversation.map(line => ({
      ...phrases[phraseIndex++], speaker: line.speaker,
    }));
    let wordIndex = 0;
    const words = topic.words.map(family => ({
      id: randomUUID(), title: family.title,
      items: family.items.map(english => {
        const index = wordIndex++;
        const translatedWord = translated.words[index];
        const card = buildCard({
          language, target: translatedWord.target, romanization: translated.wordRomanizations?.[index],
          translation: english, type: 'word', partOfSpeech: translatedWord.partOfSpeech, senseKey: translatedWord.senseKey,
        });
        const hint = translatedWord.source;
        const phrase = hint === undefined ? undefined : phrases[hint.phraseIndex];
        return validateCandidate({
          card,
          ...(hint === undefined ? {} : {
            sources: [{
              snapshot: snapshotForPhrase(phrase.card), ref: { occurrenceId: phrase.id },
              span: locateSurface(phrase.card.text, hint, `words[${index}].source`),
            }],
          }),
        }, `group[${topicIndex}].words[${index}]`);
      }),
    }));
    for (const flag of translated.flags || []) flags.push({ ...flag, groupIndex: topicIndex });
    return { id: randomUUID(), title: topic.title, thingsToSay, likelyExchanges, words, exampleConversation };
  });
  return { schemaVersion: PHRASEBOOK_SCHEMA_VERSION, title: seed, groups, flags };
}

module.exports = {
  parsePhrasebookRequest,
  validateGenerationResponse,
  validateTranslationResponse,
  assemblePhrasebook,
  flattenTopic,
  LANGUAGES,
  ABILITIES,
  MAX_SEED_LENGTH,
  MAX_ANSWERS,
  MAX_ANSWER_LABEL_LENGTH,
  MAX_ANSWER_VALUE_LENGTH,
  MIN_CHECKLIST_ITEMS,
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_ITEM_LENGTH,
  MAX_THINGS_TO_SAY,
  MAX_WORDS,
};
