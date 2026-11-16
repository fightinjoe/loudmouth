'use strict';

const { randomUUID } = require('node:crypto');
const {
  PARTS_OF_SPEECH,
  PHRASEBOOK_SCHEMA_VERSION,
  phrasebookCountOverruns,
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
const log = require('../log');

const MAX_SEED_LENGTH = 200;
const MAX_ANSWERS = 5;
const MAX_ANSWER_LABEL_LENGTH = 200;
const MAX_ANSWER_VALUE_LENGTH = 500;
const MIN_CHECKLIST_ITEMS = 1;
const MAX_CHECKLIST_ITEMS = 8;
const MAX_CHECKLIST_ITEM_LENGTH = 120;

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

const GENERATION_SECTIONS = Object.freeze(['thingsToSay', 'likelyExchanges', 'words', 'exampleConversation']);
const isBoundedString = value => typeof value === 'string' && value.trim() !== '' && value.length <= 2000;
const isBoundedTitle = value => isBoundedString(value) && value.length <= MAX_CHECKLIST_ITEM_LENGTH;
const hasOnlyFields = (value, allowed) => isObject(value) && Object.keys(value).every(field => allowed.includes(field));

/**
 * Keeps alternating or repeated turns; returns the kept turns and a flag for each repeated speaker. An
 * exchange turn (`options`) is `say` plus optional `or` alternatives, read as one ordered response array.
 */
function readTurns(lines, section, options, dropped, exchangeIndex) {
  const kept = [];
  for (const line of lines) {
    const usable = hasOnlyFields(line, options ? ['speaker', 'say', 'or'] : ['speaker', 'text'])
      && (line.speaker === 'you' || line.speaker === 'partner');
    if (usable && options && (line.or === undefined || Array.isArray(line.or))) {
      const responses = [line.say, ...(line.or ?? [])];
      const text = responses.filter(isBoundedString);
      // A turn with no usable response is one dropped entry; otherwise each invalid response is.
      const drops = text.length > 0 ? responses.length - text.length : 1;
      for (let index = 0; index < drops; index++) dropped(section, 'invalid-entry');
      if (text.length > 0) kept.push({ speaker: line.speaker, text });
    } else if (usable && !options && isBoundedString(line.text)) {
      kept.push({ speaker: line.speaker, text: line.text });
    } else dropped(section, 'invalid-entry');
  }
  const repeats = [];
  kept.forEach((line, lineIndex) => {
    if (lineIndex > 0 && line.speaker === kept[lineIndex - 1].speaker) {
      repeats.push({ code: 'speaker-repeated', section, ...(exchangeIndex === undefined ? {} : { exchangeIndex }), lineIndex });
    }
  });
  return { lines: kept, repeats };
}

function readThingsToSay(value) {
  if (!Array.isArray(value)) return null;
  const flags = [];
  const kept = value.filter(isBoundedString);
  for (let index = kept.length; index < value.length; index++) flags.push({ code: 'content-dropped', section: 'thingsToSay', reason: 'invalid-entry' });
  return kept.length > 0 ? { value: kept, flags } : null;
}

function readLikelyExchanges(value) {
  if (!Array.isArray(value)) return null;
  const flags = [];
  const dropped = (section, reason) => flags.push({ code: 'content-dropped', section, reason });
  const kept = [];
  for (const exchange of value) {
    if (!hasOnlyFields(exchange, ['title', 'turns']) || !isBoundedTitle(exchange.title) || !Array.isArray(exchange.turns)) {
      dropped('likelyExchanges', 'invalid-entry');
      continue;
    }
    const { lines, repeats } = readTurns(exchange.turns, 'likelyExchanges', true, dropped, kept.length);
    if (lines.length < 2) {
      dropped('likelyExchanges', 'too-few-turns');
      continue;
    }
    kept.push({ title: exchange.title, lines });
    flags.push(...repeats);
  }
  return kept.length > 0 ? { value: kept, flags } : null;
}

/** Invalid words are dropped; a family left with one word gives it to another family, or is dropped when none remains. */
function readWords(value) {
  if (!Array.isArray(value)) return null;
  const flags = [];
  const dropped = reason => flags.push({ code: 'content-dropped', section: 'words', reason });
  const families = [];
  for (const family of value) {
    if (!hasOnlyFields(family, ['title', 'items']) || !isBoundedTitle(family.title) || !Array.isArray(family.items)) {
      dropped('invalid-entry');
      continue;
    }
    const items = family.items.filter(isBoundedString);
    for (let index = items.length; index < family.items.length; index++) dropped('invalid-entry');
    if (items.length > 0) families.push({ title: family.title, items });
  }
  const singles = families.filter(family => family.items.length === 1);
  let kept = families.filter(family => family.items.length > 1);
  if (kept.length === 0 && singles.length > 1) kept = [singles.shift()];
  for (const single of singles) {
    if (kept.length === 0) {
      dropped('single-word-family');
      continue;
    }
    // The nearest earlier kept family in reply order, else the first later one.
    const position = families.indexOf(single);
    const target = [...kept].reverse().find(family => families.indexOf(family) < position) ?? kept[0];
    target.items.push(single.items[0]);
    flags.push({ code: 'word-family-merged', section: 'words', target });
  }
  kept.sort((a, b) => families.indexOf(a) - families.indexOf(b));
  for (const flag of flags) {
    if (flag.code === 'word-family-merged') {
      flag.familyIndex = kept.indexOf(flag.target);
      delete flag.target;
    }
  }
  return { value: kept, flags };
}

function readExampleConversation(value) {
  if (!Array.isArray(value)) return null;
  const flags = [];
  const { lines, repeats } = readTurns(value, 'exampleConversation', false, (section, reason) => flags.push({ code: 'content-dropped', section, reason }));
  return lines.length >= 2 ? { value: lines, flags: [...flags, ...repeats] } : null;
}

/**
 * Reads one English reply (one untitled topic; code owns the title) item by item. Throws only when the reply
 * cannot be used at all: invalid JSON or a wrong set of top-level fields. Otherwise each section is its
 * repaired content with flags, or null when it is unusable (missing, wrong type, or below its minimum after
 * drops) and needs another attempt. Counts have minimums only here: overruns are kept and flagged during
 * assembly (PHRASEBOOK_COUNT_LIMITS); the response schema sent to the provider is what caps them.
 */
function readGenerationReply(raw, title) {
  if (typeof title !== 'string' || !title.trim() || title.length > MAX_CHECKLIST_ITEM_LENGTH) {
    throw new Error('title must be a bounded, nonblank topic title');
  }
  const parsed = parseModelJson(raw);
  assertExactFields(parsed, GENERATION_SECTIONS, 'response');
  return {
    title,
    sections: {
      thingsToSay: readThingsToSay(parsed.thingsToSay),
      likelyExchanges: readLikelyExchanges(parsed.likelyExchanges),
      words: readWords(parsed.words),
      exampleConversation: readExampleConversation(parsed.exampleConversation),
    },
  };
}

/** Sections no attempt could use; another attempt can fill them. */
function unusableSections(attempts) {
  return GENERATION_SECTIONS.filter(section => attempts.every(attempt => attempt.sections[section] === null));
}

/**
 * Builds one topic from read attempts of the same topic: each section comes from the earliest attempt that
 * could use it, with that attempt's flags. A section no attempt could use is left empty with `section-missing`.
 */
function combineGenerationAttempts(attempts) {
  const topic = { title: attempts[0].title };
  const flags = [];
  for (const section of GENERATION_SECTIONS) {
    const found = attempts.map(attempt => attempt.sections[section]).find(Boolean);
    topic[section] = found ? found.value : [];
    flags.push(...(found ? found.flags : [{ code: 'section-missing', section }]));
  }
  return { topic, flags };
}

/**
 * One attempt for one topic: the repaired topic, its flags (without group indexes), and failure level 1 when
 * anything was repaired. Evaluation tools use it; the route combines attempts itself.
 */
function validateGenerationResponse(raw, title) {
  const { topic, flags } = combineGenerationAttempts([readGenerationReply(raw, title)]);
  return { topic, flags, failureLevel: flags.length > 0 ? 1 : 0 };
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
        log.warn({
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

/** `generationFlags[i]` holds topic i's English repair flags from combineGenerationAttempts. */
function assemblePhrasebook({ seed, language, topics, generationFlags = [], translations }) {
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
    for (const { code, ...flag } of generationFlags[topicIndex] ?? []) flags.push({ code, groupIndex: topicIndex, ...flag });
    for (const flag of translated.flags || []) flags.push({ ...flag, groupIndex: topicIndex });
    const group = { id: randomUUID(), title: topic.title, thingsToSay, likelyExchanges, words, exampleConversation };
    for (const overrun of phrasebookCountOverruns(group)) flags.push({ code: 'count-overrun', groupIndex: topicIndex, ...overrun });
    return group;
  });
  return { schemaVersion: PHRASEBOOK_SCHEMA_VERSION, title: seed, groups, flags };
}

module.exports = {
  parsePhrasebookRequest,
  readGenerationReply,
  unusableSections,
  combineGenerationAttempts,
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
};
