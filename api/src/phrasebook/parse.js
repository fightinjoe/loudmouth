'use strict';

const { randomUUID } = require('node:crypto');
const {
  PARTS_OF_SPEECH,
  SCHEMA_VERSION,
  validateCard,
  validateCandidate,
} = require('../schema');
const {
  parseInlineReading,
  latinRomanization,
  japanesePronunciation,
} = require('../reading');

const LANGUAGES = Object.freeze(['zh', 'ja', 'es', 'cs']);
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
const MIN_VOCAB_PER_CONVERSATION = 3;
const MAX_VOCAB_PER_CONVERSATION = 6;

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

function validateSourceLocation(value, prefix, lineCount) {
  assertExactFields(value, ['lineIndex', 'surface', 'occurrence'], prefix);
  if (!Number.isSafeInteger(value.lineIndex)
    || value.lineIndex < 0
    || value.lineIndex >= lineCount) {
    throw new Error(`${prefix}.lineIndex must reference a translated conversation line`);
  }
  if (typeof value.surface !== 'string'
    || value.surface.length === 0
    || value.surface !== value.surface.trim()) {
    throw new Error(`${prefix}.surface must be a non-empty, unpadded string`);
  }
  if (value.surface.length > 2000) {
    throw new Error(`${prefix}.surface must be at most 2000 characters`);
  }
  if (!/[\p{L}\p{N}]/u.test(value.surface)) {
    throw new Error(`${prefix}.surface must contain content other than punctuation or whitespace`);
  }
  if (!Number.isSafeInteger(value.occurrence) || value.occurrence < 0) {
    throw new Error(`${prefix}.occurrence must be a nonnegative integer`);
  }
  return {
    lineIndex: value.lineIndex,
    surface: value.surface,
    occurrence: value.occurrence,
  };
}

function validateTranslationResponse(raw, conversation, language) {
  const parsed = parseModelJson(raw);
  assertExactFields(
    parsed,
    ['lines', 'vocab', 'lineRomanizations', 'vocabRomanizations'],
    'response',
  );
  if (language !== 'ja'
    && (Object.hasOwn(parsed, 'lineRomanizations')
      || Object.hasOwn(parsed, 'vocabRomanizations'))) {
    throw new Error('Romanization arrays must be omitted for non-Japanese translations');
  }
  if (!Array.isArray(parsed.lines) || parsed.lines.length !== conversation.lines.length) {
    const count = Array.isArray(parsed.lines) ? parsed.lines.length : 'non-array';
    throw new Error(`"lines" count ${count} does not match source count ${conversation.lines.length}`);
  }
  if (!Array.isArray(parsed.vocab) || parsed.vocab.length !== conversation.vocab.length) {
    const count = Array.isArray(parsed.vocab) ? parsed.vocab.length : 'non-array';
    throw new Error(`"vocab" count ${count} does not match source count ${conversation.vocab.length}`);
  }

  const sourceFlags = [];
  const result = {
    lines: parsed.lines.map((value, index) => translatedString(value, `lines[${index}]`)),
    vocab: parsed.vocab.map((value, index) => {
      const prefix = `vocab[${index}]`;
      assertExactFields(value, ['target', 'partOfSpeech', 'senseKey', 'source'], prefix);
      const target = translatedString(value.target, `${prefix}.target`);
      if (!PARTS_OF_SPEECH.includes(value.partOfSpeech)) {
        throw new Error(`${prefix}.partOfSpeech must be a supported part of speech`);
      }
      if (typeof value.senseKey !== 'string'
        || value.senseKey.length > 120
        || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value.senseKey)) {
        throw new Error(`${prefix}.senseKey must be a lowercase kebab-case concept identifier`);
      }
      let source;
      if (!Object.hasOwn(value, 'source')) {
        sourceFlags.push({
          code: 'vocab-source-missing',
          vocabIndex: index,
          reason: 'omitted',
        });
      } else {
        try {
          source = validateSourceLocation(value.source, `${prefix}.source`, parsed.lines.length);
        } catch {
          sourceFlags.push({
            code: 'vocab-source-missing',
            vocabIndex: index,
            reason: 'unresolved',
          });
        }
      }
      return {
        target,
        partOfSpeech: value.partOfSpeech,
        senseKey: value.senseKey,
        ...(source === undefined ? {} : { source }),
      };
    }),
  };

  result.vocab.forEach((word, index) => {
    if (word.source === undefined) return;
    const prefix = `vocab[${index}].source`;
    const lineText = parseInlineReading(result.lines[word.source.lineIndex]).text;
    try {
      word.source = normalizeSourceLocation(lineText, word.source, prefix);
    } catch {
      delete word.source;
      sourceFlags.push({
        code: 'vocab-source-missing',
        vocabIndex: index,
        reason: 'unresolved',
      });
    }
  });
  result.flags = sourceFlags;

  if (language === 'ja') {
    for (const [field, targets, capitalize] of [
      ['lineRomanizations', result.lines, true],
      ['vocabRomanizations', result.vocab.map(({ target }) => target), false],
    ]) {
      const supplied = parsed[field];
      // A count mismatch makes every index suspect; do not attach a shifted
      // model romanization to the wrong Japanese line.
      const aligned = Array.isArray(supplied) && supplied.length === targets.length;
      result[field] = targets.map((target, index) => {
        const suppliedValue = aligned ? supplied[index] : undefined;
        const normalized = latinRomanization(suppliedValue);
        if (normalized) return normalized;
        const fallback = japanesePronunciation(
          parseInlineReading(target).reading,
          undefined,
          { capitalize },
        );
        console.warn({
          event: 'phrasebook_romanization_fallback',
          field,
          index,
          reason: aligned ? 'invalid_entry' : 'unaligned_array',
          available: !!fallback,
        });
        // Unannotated kanji cannot be read mechanically. Keep the phrase rather
        // than return Japanese characters as romanization or fail the translation.
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

function normalizeSourceLocation(text, source, prefix) {
  const surface = parseInlineReading(source.surface).text;
  if (!surface
    || surface !== surface.trim()
    || !/[\p{L}\p{N}]/u.test(surface)) {
    throw new Error(`${prefix}.surface must resolve to non-empty, unpadded content`);
  }

  const first = text.indexOf(surface);
  if (first < 0) {
    throw new Error(`${prefix} does not select an existing surface occurrence`);
  }

  let occurrence = source.occurrence;
  if (occurrence > 0 && text.indexOf(surface, first + 1) < 0) {
    // The location is still exact when the model copies inline readings into
    // the surface or numbers a single match as one instead of zero.
    occurrence = 0;
  }
  const normalized = { ...source, surface, occurrence };
  locateSurface(text, normalized, prefix);
  return normalized;
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
    const phrases = conversation.lines.map((line, lineIndex) => {
      const card = buildCard({
        language,
        target: translated.lines[lineIndex],
        romanization: translated.lineRomanizations?.[lineIndex],
        translation: line.text,
        type: 'phrase',
      });
      return {
        id: randomUUID(),
        card,
        speaker: line.speaker,
        ...(line.or ? { alternative: true } : {}),
      };
    });
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
      if (source === undefined) {
        const translationFlag = translated.flags?.find(flag => flag.vocabIndex === wordIndex);
        flags.push({
          code: 'vocab-source-missing',
          groupIndex: conversationIndex,
          vocabIndex: wordIndex,
          reason: translationFlag?.reason || 'omitted',
        });
      }
      const candidate = {
        card,
        ...(source === undefined ? {} : {
          sources: [{
            snapshot: snapshotForPhrase(phrases[source.lineIndex].card),
            ref: { occurrenceId: phrases[source.lineIndex].id },
            span: locateSurface(
              phrases[source.lineIndex].card.text,
              source,
              `vocab[${wordIndex}].source`,
            ),
          }],
        }),
      };
      return validateCandidate(candidate, `group[${conversationIndex}].vocab[${wordIndex}]`);
    });

    return {
      id: randomUUID(),
      title: conversation.title,
      phrases,
      vocab,
    };
  });

  return { schemaVersion: SCHEMA_VERSION, title: seed, groups, flags };
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
  MIN_VOCAB_PER_CONVERSATION,
  MAX_VOCAB_PER_CONVERSATION,
};
