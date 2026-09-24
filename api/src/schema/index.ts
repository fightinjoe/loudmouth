export const SCHEMA_VERSION = 2 as const;

export type Lang = 'zh' | 'ja' | 'es' | 'cs';
export type ReadingToken = [string, string | null];
export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'determiner'
  | 'preposition'
  | 'postposition'
  | 'conjunction'
  | 'particle'
  | 'interjection'
  | 'numeral'
  | 'expression'
  | 'other';

export type Form = {
  text: string;
  reading?: ReadingToken[];
  romanization?: string;
};

export type Snapshot = Form & {
  lang: Lang;
  translation: string;
};

export type SourceRef = {
  cardId?: string;
  occurrenceId?: string;
};

export type PhraseSource = {
  snapshot: Snapshot;
  ref?: SourceRef;
};

export type Evidence = PhraseSource & {
  span: {
    start: number;
    end: number;
  };
};

export type CommonCard = Form & {
  lang: Lang;
  translation: string;
  definition?: string;
  formality?: 'casual' | 'polite' | 'formal' | 'slang' | 'vulgar';
  notes?: string;
  example?: Form & { translation?: string };
};

export type Word = CommonCard & {
  type: 'word';
  partOfSpeech: PartOfSpeech;
  senseKey: string;
};

export type Phrase = CommonCard & {
  type: 'phrase';
};

export type Chunk = CommonCard & {
  type: 'chunk';
  source: Evidence;
  role: string;
  explanation: string;
};

export type Card = Word | Phrase | Chunk;

export type Candidate = {
  card: Card;
  sources?: Evidence[];
};

export type ExistingUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  durationMs: number;
};

export type PhrasebookPhrase = {
  id: string;
  card: Phrase;
  speaker: 'you' | 'partner';
  alternative?: true;
};

export type PhrasebookGroup = {
  id: string;
  title: string;
  phrases: PhrasebookPhrase[];
  vocab: Candidate[];
};

export type PhrasebookFlag = {
  code: 'vocab-source-missing';
  groupIndex: number;
  vocabIndex: number;
  reason: 'omitted' | 'unresolved';
};

export type PhrasebookResponse = {
  schemaVersion: typeof SCHEMA_VERSION;
  title: string;
  groups: PhrasebookGroup[];
  flags: PhrasebookFlag[];
  usage: ExistingUsage;
};

export type BreakdownGenerationContext = {
  seed: string;
  ability: 'none' | 'basics' | 'conversational';
  answers: Record<string, string>;
};

export type BreakdownContext = {
  generation?: BreakdownGenerationContext;
  groupTitle?: string;
  speaker?: 'you' | 'partner';
};

export type BreakdownRequest = {
  schemaVersion: typeof SCHEMA_VERSION;
  source: PhraseSource;
  context?: BreakdownContext;
};

export type BreakdownWordTarget = {
  kind: 'word';
  index: number;
};

export type BreakdownChunkTarget = {
  kind: 'chunk';
  card: Chunk;
};

export type BreakdownChunk = {
  start: number;
  end: number;
  text: string;
  gloss: string;
  role: string;
  explanation: string;
  words: Candidate[];
  target: BreakdownWordTarget | BreakdownChunkTarget;
};

export type BreakdownResponse = {
  schemaVersion: typeof SCHEMA_VERSION;
  chunks: BreakdownChunk[];
  usage: ExistingUsage;
};

export type CardBatch = {
  schemaVersion: typeof SCHEMA_VERSION;
  cards: Candidate[];
};

const LANGS: readonly Lang[] = ['zh', 'ja', 'es', 'cs'];
export const PARTS_OF_SPEECH: readonly PartOfSpeech[] = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'determiner',
  'preposition',
  'postposition',
  'conjunction',
  'particle',
  'interjection',
  'numeral',
  'expression',
  'other',
];
const FORMALITIES = ['casual', 'polite', 'formal', 'slang', 'vulgar'] as const;
const SPEAKERS = ['you', 'partner'] as const;
const ABILITIES = ['none', 'basics', 'conversational'] as const;
const CARD_TYPES = ['word', 'phrase', 'chunk'] as const;
const MAX_CONTENT_STRING = 2_000;
const MAX_ROLE = 200;
const MAX_EXPLANATION = 1_000;
const MAX_GLOSS = 500;
const MAX_SENSE_KEY = 120;
const MAX_GROUP_TITLE = 120;
const MAX_PHRASEBOOK_TITLE = 200;
const MAX_GROUPS = 8;
const MIN_PHRASES = 2;
const MAX_PHRASES = 10;
const MIN_VOCAB = 3;
const MAX_VOCAB = 6;
const MAX_CHUNKS = 32;
const MAX_WORDS_PER_CHUNK = 32;
const SENSE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MEANINGFUL_PATTERN = /[^\p{P}\p{White_Space}]/u;
const IGNORABLE_PATTERN = /^[\p{P}\p{White_Space}]*$/u;

function objectValue(value: unknown, prefix: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${prefix} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  prefix: string,
): void {
  const accepted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) throw new Error(`${prefix}.${key} is not allowed`);
  }
}

function requiredString(value: unknown, prefix: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${prefix} must be a nonblank string`);
  }
  if (value.length > maximum) {
    throw new Error(`${prefix} must be at most ${maximum} UTF-16 code units`);
  }
  return value;
}
function nonblankString(value: unknown, prefix: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${prefix} must be a nonblank string`);
  }
  return value;
}

function enumValue<T extends string>(
  value: unknown,
  accepted: readonly T[],
  prefix: string,
): T {
  if (typeof value !== 'string' || !accepted.some((candidate) => candidate === value)) {
    throw new Error(`${prefix} must be one of ${accepted.map((item) => JSON.stringify(item)).join(', ')}`);
  }
  return value as T;
}

function optionalString(
  value: Record<string, unknown>,
  field: string,
  prefix: string,
  maximum: number,
): void {
  if (Object.hasOwn(value, field)) requiredString(value[field], `${prefix}.${field}`, maximum);
}

function nonnegativeInteger(value: unknown, prefix: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${prefix} must be a nonnegative integer`);
  }
  return value;
}

function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

function assertMeaningful(value: string, prefix: string): void {
  if (!MEANINGFUL_PATTERN.test(value)) {
    throw new Error(`${prefix} must contain content other than punctuation or whitespace`);
  }
}

function validateRef(value: unknown, prefix: string): SourceRef {
  const ref = objectValue(value, prefix);
  assertExactFields(ref, ['cardId', 'occurrenceId'], prefix);
  const hasCardId = Object.hasOwn(ref, 'cardId');
  const hasOccurrenceId = Object.hasOwn(ref, 'occurrenceId');
  if (!hasCardId && !hasOccurrenceId) {
    throw new Error(`${prefix} must contain cardId or occurrenceId`);
  }
  if (hasCardId) nonblankString(ref.cardId, `${prefix}.cardId`);
  if (hasOccurrenceId) nonblankString(ref.occurrenceId, `${prefix}.occurrenceId`);
  return value as SourceRef;
}

function validateFormFields(
  value: Record<string, unknown>,
  prefix: string,
  textMaximum = MAX_CONTENT_STRING,
): void {
  const text = requiredString(value.text, `${prefix}.text`, textMaximum);
  if (Object.hasOwn(value, 'reading')) {
    validateReadingTokens(value.reading, text, `${prefix}.reading`);
  }
  optionalString(value, 'romanization', prefix, MAX_CONTENT_STRING);
}

function validateExample(value: unknown, prefix: string): void {
  const example = objectValue(value, prefix);
  assertExactFields(example, ['text', 'reading', 'romanization', 'translation'], prefix);
  validateFormFields(example, prefix);
  optionalString(example, 'translation', prefix, MAX_CONTENT_STRING);
}

function validatePhraseSource(value: unknown, prefix: string): PhraseSource {
  const source = objectValue(value, prefix);
  assertExactFields(source, ['snapshot', 'ref'], prefix);
  validateSnapshot(source.snapshot, `${prefix}.snapshot`);
  if (Object.hasOwn(source, 'ref')) validateRef(source.ref, `${prefix}.ref`);
  return value as PhraseSource;
}

function validateUsage(value: unknown, prefix: string): ExistingUsage {
  const usage = objectValue(value, prefix);
  assertExactFields(
    usage,
    ['model', 'inputTokens', 'outputTokens', 'totalTokens', 'costUsd', 'durationMs'],
    prefix,
  );
  nonblankString(usage.model, `${prefix}.model`);
  const inputTokens = nonnegativeInteger(usage.inputTokens, `${prefix}.inputTokens`);
  const outputTokens = nonnegativeInteger(usage.outputTokens, `${prefix}.outputTokens`);
  const totalTokens = nonnegativeInteger(usage.totalTokens, `${prefix}.totalTokens`);
  if (totalTokens !== inputTokens + outputTokens) {
    throw new Error(`${prefix}.totalTokens must equal inputTokens + outputTokens`);
  }
  if (usage.costUsd !== null
    && (typeof usage.costUsd !== 'number' || !Number.isFinite(usage.costUsd) || usage.costUsd < 0)) {
    throw new Error(`${prefix}.costUsd must be a nonnegative finite number or null`);
  }
  nonnegativeInteger(usage.durationMs, `${prefix}.durationMs`);
  return value as ExistingUsage;
}

function sameReading(left: ReadingToken[] | undefined, right: ReadingToken[] | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length
    && left.every((token, index) => token[0] === right[index]?.[0] && token[1] === right[index]?.[1]);
}

function sameRef(left: SourceRef | undefined, right: SourceRef | undefined): boolean {
  return left?.cardId === right?.cardId
    && left?.occurrenceId === right?.occurrenceId
    && (left === undefined) === (right === undefined);
}

function sameSnapshot(left: Snapshot, right: Snapshot): boolean {
  return left.lang === right.lang
    && left.text === right.text
    && left.translation === right.translation
    && left.romanization === right.romanization
    && sameReading(left.reading, right.reading);
}

function assertSourceMatches(
  actual: PhraseSource,
  expected: PhraseSource,
  prefix: string,
): void {
  if (!sameSnapshot(actual.snapshot, expected.snapshot)) {
    throw new Error(`${prefix}.snapshot must exactly match the request source snapshot`);
  }
  if (!sameRef(actual.ref, expected.ref)) {
    throw new Error(`${prefix}.ref must exactly match the request source ref`);
  }
}

function assertGeneratedWordReading(card: Word, prefix: string): void {
  if ((card.lang === 'ja' || card.lang === 'zh') && card.reading === undefined) {
    throw new Error(`${prefix}.reading is required for generated ${card.lang} words`);
  }
}

export function validateReadingTokens(
  reading: unknown,
  text: string,
  prefix = 'reading',
): ReadingToken[] {
  if (typeof text !== 'string') throw new Error(`${prefix} associated text must be a string`);
  if (!Array.isArray(reading) || reading.length === 0) {
    throw new Error(`${prefix} must be a nonempty ReadingToken array`);
  }
  let joined = '';
  for (let index = 0; index < reading.length; index += 1) {
    const token = reading[index];
    if (!Array.isArray(token) || token.length !== 2) {
      throw new Error(`${prefix}[${index}] must contain exactly [base, annotation]`);
    }
    const base = token[0];
    const annotation = token[1];
    if (typeof base !== 'string' || base.length === 0) {
      throw new Error(`${prefix}[${index}][0] must be a nonempty string`);
    }
    if (annotation !== null && (typeof annotation !== 'string' || annotation.trim() === '')) {
      throw new Error(`${prefix}[${index}][1] must be a nonblank string or null`);
    }
    joined += base;
  }
  if (joined !== text) throw new Error(`${prefix} bases must concatenate exactly to the associated text`);
  return reading as ReadingToken[];
}

export function validateSnapshot(snapshot: unknown, prefix = 'snapshot'): Snapshot {
  const value = objectValue(snapshot, prefix);
  assertExactFields(value, ['lang', 'text', 'reading', 'romanization', 'translation'], prefix);
  enumValue(value.lang, LANGS, `${prefix}.lang`);
  validateFormFields(value, prefix);
  requiredString(value.translation, `${prefix}.translation`, MAX_CONTENT_STRING);
  return snapshot as Snapshot;
}

export function validateEvidence(source: unknown, prefix = 'source'): Evidence {
  const value = objectValue(source, prefix);
  assertExactFields(value, ['snapshot', 'ref', 'span'], prefix);
  const snapshot = validateSnapshot(value.snapshot, `${prefix}.snapshot`);
  if (Object.hasOwn(value, 'ref')) validateRef(value.ref, `${prefix}.ref`);
  const span = objectValue(value.span, `${prefix}.span`);
  assertExactFields(span, ['start', 'end'], `${prefix}.span`);
  const start = nonnegativeInteger(span.start, `${prefix}.span.start`);
  const end = nonnegativeInteger(span.end, `${prefix}.span.end`);
  const text = snapshot.text;
  if (end <= start || end > text.length) {
    throw new Error(`${prefix}.span must be a nonempty [start, end) range within snapshot.text`);
  }
  if (splitsSurrogatePair(text, start) || splitsSurrogatePair(text, end)) {
    throw new Error(`${prefix}.span must not split a UTF-16 surrogate pair`);
  }
  assertMeaningful(text.slice(start, end), `${prefix}.span`);
  return source as Evidence;
}

export function validateCard(card: unknown, prefix = 'card'): Card {
  const value = objectValue(card, prefix);
  const type = enumValue(value.type, CARD_TYPES, `${prefix}.type`);
  const commonFields = [
    'type',
    'lang',
    'text',
    'reading',
    'romanization',
    'translation',
    'definition',
    'formality',
    'notes',
    'example',
  ];
  const variantFields = type === 'word'
    ? ['partOfSpeech', 'senseKey']
    : type === 'chunk'
      ? ['source', 'role', 'explanation']
      : [];
  assertExactFields(value, [...commonFields, ...variantFields], prefix);

  const lang = enumValue(value.lang, LANGS, `${prefix}.lang`);
  validateFormFields(value, prefix);
  requiredString(value.translation, `${prefix}.translation`, MAX_CONTENT_STRING);
  optionalString(value, 'definition', prefix, MAX_CONTENT_STRING);
  optionalString(value, 'notes', prefix, MAX_CONTENT_STRING);
  if (Object.hasOwn(value, 'formality')) {
    enumValue(value.formality, FORMALITIES, `${prefix}.formality`);
  }
  if (Object.hasOwn(value, 'example')) validateExample(value.example, `${prefix}.example`);

  if (type === 'word') {
    enumValue(value.partOfSpeech, PARTS_OF_SPEECH, `${prefix}.partOfSpeech`);
    const senseKey = requiredString(value.senseKey, `${prefix}.senseKey`, MAX_SENSE_KEY);
    if (!SENSE_KEY_PATTERN.test(senseKey)) {
      throw new Error(`${prefix}.senseKey must be a lowercase kebab-case concept identifier`);
    }
  } else if (type === 'chunk') {
    const source = validateEvidence(value.source, `${prefix}.source`);
    if (source.snapshot.lang !== lang) {
      throw new Error(`${prefix}.source.snapshot.lang must equal ${prefix}.lang`);
    }
    if (value.text !== source.snapshot.text.slice(source.span.start, source.span.end)) {
      throw new Error(`${prefix}.text must equal the exact source span`);
    }
    requiredString(value.role, `${prefix}.role`, MAX_ROLE);
    requiredString(value.explanation, `${prefix}.explanation`, MAX_EXPLANATION);
  }
  return card as Card;
}

export function validateCandidate(candidate: unknown, prefix = 'candidate'): Candidate {
  const value = objectValue(candidate, prefix);
  assertExactFields(value, ['card', 'sources'], prefix);
  const card = validateCard(value.card, `${prefix}.card`);
  if (Object.hasOwn(value, 'sources')) {
    if (card.type !== 'word') throw new Error(`${prefix}.sources is allowed only for word cards`);
    if (!Array.isArray(value.sources) || value.sources.length === 0) {
      throw new Error(`${prefix}.sources must be a nonempty Evidence array when present`);
    }
    for (let index = 0; index < value.sources.length; index += 1) {
      const source = validateEvidence(value.sources[index], `${prefix}.sources[${index}]`);
      if (source.snapshot.lang !== card.lang) {
        throw new Error(`${prefix}.sources[${index}].snapshot.lang must equal ${prefix}.card.lang`);
      }
    }
  }
  return candidate as Candidate;
}

export function normalizeIdentityText(text: string): string {
  if (typeof text !== 'string') throw new Error('text must be a string');
  return text.normalize('NFC').trim();
}

export function cardIdentity(card: unknown): string {
  const value = validateCard(card);
  if (value.type === 'word') {
    return JSON.stringify([
      'word',
      value.lang,
      normalizeIdentityText(value.text),
      value.partOfSpeech,
      value.senseKey,
    ]);
  }
  if (value.type === 'phrase') {
    return JSON.stringify(['phrase', value.lang, normalizeIdentityText(value.text)]);
  }
  return JSON.stringify([
    'chunk',
    value.lang,
    value.source.ref?.occurrenceId ?? null,
    value.source.snapshot.text,
    value.source.span.start,
    value.source.span.end,
  ]);
}

export function evidenceIdentity(evidence: unknown): string {
  const value = validateEvidence(evidence, 'evidence');
  return JSON.stringify([
    value.snapshot.lang,
    value.snapshot.text,
    value.snapshot.translation,
    value.ref?.occurrenceId ?? null,
    value.span.start,
    value.span.end,
  ]);
}

export function validatePhrasebookResponse(value: unknown): PhrasebookResponse {
  const response = objectValue(value, 'response');
  assertExactFields(response, ['schemaVersion', 'title', 'groups', 'flags', 'usage'], 'response');
  if (response.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`response.schemaVersion must be ${SCHEMA_VERSION}`);
  }
  requiredString(response.title, 'response.title', MAX_PHRASEBOOK_TITLE);
  if (!Array.isArray(response.groups)
    || response.groups.length < 1
    || response.groups.length > MAX_GROUPS) {
    throw new Error(`response.groups must contain 1 to ${MAX_GROUPS} groups`);
  }

  const groupIds = new Set<string>();
  const phraseIds = new Set<string>();
  let responseLang: Lang | undefined;
  const missingSourceCandidates = new Set<string>();
  for (let groupIndex = 0; groupIndex < response.groups.length; groupIndex += 1) {
    const groupPrefix = `response.groups[${groupIndex}]`;
    const group = objectValue(response.groups[groupIndex], groupPrefix);
    assertExactFields(group, ['id', 'title', 'phrases', 'vocab'], groupPrefix);
    const groupId = nonblankString(group.id, `${groupPrefix}.id`);
    if (!UUID_PATTERN.test(groupId)) throw new Error(`${groupPrefix}.id must be a UUID`);
    if (groupIds.has(groupId)) throw new Error(`${groupPrefix}.id must be unique`);
    groupIds.add(groupId);
    requiredString(group.title, `${groupPrefix}.title`, MAX_GROUP_TITLE);
    if (!Array.isArray(group.phrases)
      || group.phrases.length < MIN_PHRASES
      || group.phrases.length > MAX_PHRASES) {
      throw new Error(`${groupPrefix}.phrases must contain ${MIN_PHRASES} to ${MAX_PHRASES} items`);
    }

    const phrases = new Map<string, Phrase>();
    for (let phraseIndex = 0; phraseIndex < group.phrases.length; phraseIndex += 1) {
      const phrasePrefix = `${groupPrefix}.phrases[${phraseIndex}]`;
      const phrase = objectValue(group.phrases[phraseIndex], phrasePrefix);
      assertExactFields(phrase, ['id', 'card', 'speaker', 'alternative'], phrasePrefix);
      const phraseId = nonblankString(phrase.id, `${phrasePrefix}.id`);
      if (!UUID_PATTERN.test(phraseId)) throw new Error(`${phrasePrefix}.id must be a UUID`);
      if (phraseIds.has(phraseId)) throw new Error(`${phrasePrefix}.id must be globally unique`);
      phraseIds.add(phraseId);
      const card = validateCard(phrase.card, `${phrasePrefix}.card`);
      if (card.type !== 'phrase') throw new Error(`${phrasePrefix}.card.type must be "phrase"`);
      if (responseLang !== undefined && responseLang !== card.lang) {
        throw new Error(`${phrasePrefix}.card.lang must match the other response cards`);
      }
      responseLang = card.lang;
      enumValue(phrase.speaker, SPEAKERS, `${phrasePrefix}.speaker`);
      if (Object.hasOwn(phrase, 'alternative') && phrase.alternative !== true) {
        throw new Error(`${phrasePrefix}.alternative must be true when present`);
      }
      phrases.set(phraseId, card);
    }

    if (!Array.isArray(group.vocab)
      || group.vocab.length < MIN_VOCAB
      || group.vocab.length > MAX_VOCAB) {
      throw new Error(`${groupPrefix}.vocab must contain ${MIN_VOCAB} to ${MAX_VOCAB} items`);
    }
    for (let vocabIndex = 0; vocabIndex < group.vocab.length; vocabIndex += 1) {
      const vocabPrefix = `${groupPrefix}.vocab[${vocabIndex}]`;
      const candidate = validateCandidate(group.vocab[vocabIndex], vocabPrefix);
      if (candidate.card.type !== 'word') throw new Error(`${vocabPrefix}.card.type must be "word"`);
      if (responseLang !== undefined && responseLang !== candidate.card.lang) {
        throw new Error(`${vocabPrefix}.card.lang must match the other response cards`);
      }
      responseLang = candidate.card.lang;
      assertGeneratedWordReading(candidate.card, `${vocabPrefix}.card`);
      if (candidate.sources === undefined) {
        missingSourceCandidates.add(`${groupIndex}:${vocabIndex}`);
      }
      if (candidate.sources !== undefined) {
        for (let sourceIndex = 0; sourceIndex < candidate.sources.length; sourceIndex += 1) {
          const sourcePrefix = `${vocabPrefix}.sources[${sourceIndex}]`;
          const source = candidate.sources[sourceIndex];
          const occurrenceId = source.ref?.occurrenceId;
          if (occurrenceId === undefined) {
            throw new Error(`${sourcePrefix}.ref.occurrenceId is required for phrasebook evidence`);
          }
          if (source.ref?.cardId !== undefined) {
            throw new Error(`${sourcePrefix}.ref.cardId is not valid for an unsaved phrase draft`);
          }
          const phrase = phrases.get(occurrenceId);
          if (phrase === undefined) {
            throw new Error(`${sourcePrefix}.ref.occurrenceId must reference a phrase in its owning group`);
          }
          const expectedSnapshot: Snapshot = {
            lang: phrase.lang,
            text: phrase.text,
            translation: phrase.translation,
            ...(phrase.reading === undefined ? {} : { reading: phrase.reading }),
            ...(phrase.romanization === undefined ? {} : { romanization: phrase.romanization }),
          };
          if (!sameSnapshot(source.snapshot, expectedSnapshot)) {
            throw new Error(`${sourcePrefix}.snapshot must exactly match its referenced phrase`);
          }
        }
      }
    }
  }
  if (!Array.isArray(response.flags)) {
    throw new Error('response.flags must be an array');
  }
  const seenFlags = new Set<string>();
  for (let flagIndex = 0; flagIndex < response.flags.length; flagIndex += 1) {
    const flagPrefix = `response.flags[${flagIndex}]`;
    const flag = objectValue(response.flags[flagIndex], flagPrefix);
    assertExactFields(flag, ['code', 'groupIndex', 'vocabIndex', 'reason'], flagPrefix);
    if (flag.code !== 'vocab-source-missing') {
      throw new Error(`${flagPrefix}.code must be "vocab-source-missing"`);
    }
    const groupIndex = nonnegativeInteger(flag.groupIndex, `${flagPrefix}.groupIndex`);
    const vocabIndex = nonnegativeInteger(flag.vocabIndex, `${flagPrefix}.vocabIndex`);
    const group = response.groups[groupIndex];
    if (group === undefined) {
      throw new Error(`${flagPrefix} must reference vocabulary in this response`);
    }
    const groupValue = objectValue(group, `response.groups[${groupIndex}]`);
    if (!Array.isArray(groupValue.vocab) || vocabIndex >= groupValue.vocab.length) {
      throw new Error(`${flagPrefix} must reference vocabulary in this response`);
    }
    enumValue(flag.reason, ['omitted', 'unresolved'], `${flagPrefix}.reason`);
    const identity = `${groupIndex}:${vocabIndex}:${flag.code}`;
    if (seenFlags.has(identity)) throw new Error(`${flagPrefix} duplicates an earlier flag`);
    seenFlags.add(identity);
    const candidate = objectValue(
      groupValue.vocab[vocabIndex],
      `response.groups[${groupIndex}].vocab[${vocabIndex}]`,
    );
    const missingSourceIdentity = `${groupIndex}:${vocabIndex}`;
    if (!missingSourceCandidates.delete(missingSourceIdentity)) {
      throw new Error(`${flagPrefix} must reference vocabulary without source evidence`);
    }
  }
  if (missingSourceCandidates.size > 0) {
    throw new Error('response.flags must identify every vocabulary item without source evidence');
  }
  validateUsage(response.usage, 'response.usage');
  return value as PhrasebookResponse;
}

export function validateBreakdownRequest(value: unknown): BreakdownRequest {
  const request = objectValue(value, 'request');
  assertExactFields(request, ['schemaVersion', 'source', 'context'], 'request');
  if (request.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`request.schemaVersion must be ${SCHEMA_VERSION}`);
  }
  validatePhraseSource(request.source, 'request.source');
  if (Object.hasOwn(request, 'context')) {
    const context = objectValue(request.context, 'request.context');
    assertExactFields(context, ['generation', 'groupTitle', 'speaker'], 'request.context');
    if (Object.hasOwn(context, 'generation')) {
      const generation = objectValue(context.generation, 'request.context.generation');
      assertExactFields(generation, ['seed', 'ability', 'answers'], 'request.context.generation');
      requiredString(generation.seed, 'request.context.generation.seed', 200);
      enumValue(generation.ability, ABILITIES, 'request.context.generation.ability');
      const answers = objectValue(generation.answers, 'request.context.generation.answers');
      const answerEntries = Object.entries(answers);
      if (answerEntries.length > 5) {
        throw new Error('request.context.generation.answers must contain at most 5 entries');
      }
      for (const [label, answer] of answerEntries) {
        requiredString(label, `request.context.generation.answers key ${JSON.stringify(label)}`, 200);
        requiredString(answer, `request.context.generation.answers[${JSON.stringify(label)}]`, 500);
      }
    }
    optionalString(context, 'groupTitle', 'request.context', 500);
    if (Object.hasOwn(context, 'speaker')) {
      enumValue(context.speaker, SPEAKERS, 'request.context.speaker');
    }
  }
  return value as BreakdownRequest;
}

function assertIgnorableGap(gap: string, prefix: string): void {
  if (!IGNORABLE_PATTERN.test(gap)) {
    throw new Error(`${prefix} leaves meaningful source content uncovered`);
  }
}

function meaningfulBounds(text: string, start: number, end: number): { start: number; end: number } {
  const value = text.slice(start, end);
  const leading = value.match(/^[\p{P}\p{White_Space}]*/u)?.[0].length ?? 0;
  const trailing = value.match(/[\p{P}\p{White_Space}]*$/u)?.[0].length ?? 0;
  return { start: start + leading, end: end - trailing };
}

export function validateBreakdownResponse(
  value: unknown,
  requestValue: unknown,
): BreakdownResponse {
  const request = validateBreakdownRequest(requestValue);
  const response = objectValue(value, 'response');
  assertExactFields(response, ['schemaVersion', 'chunks', 'usage'], 'response');
  if (response.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`response.schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(response.chunks)
    || response.chunks.length < 1
    || response.chunks.length > MAX_CHUNKS) {
    throw new Error(`response.chunks must contain 1 to ${MAX_CHUNKS} items`);
  }

  const sourceText = request.source.snapshot.text;
  let cursor = 0;
  for (let chunkIndex = 0; chunkIndex < response.chunks.length; chunkIndex += 1) {
    const prefix = `response.chunks[${chunkIndex}]`;
    const chunk = objectValue(response.chunks[chunkIndex], prefix);
    assertExactFields(
      chunk,
      ['start', 'end', 'text', 'gloss', 'role', 'explanation', 'words', 'target'],
      prefix,
    );
    const start = nonnegativeInteger(chunk.start, `${prefix}.start`);
    const end = nonnegativeInteger(chunk.end, `${prefix}.end`);
    if (start < cursor || end <= start || end > sourceText.length) {
      throw new Error(`${prefix} must be an ordered, nonoverlapping, nonempty source span`);
    }
    if (splitsSurrogatePair(sourceText, start) || splitsSurrogatePair(sourceText, end)) {
      throw new Error(`${prefix} must not split a UTF-16 surrogate pair`);
    }
    assertIgnorableGap(sourceText.slice(cursor, start), prefix);
    const text = requiredString(chunk.text, `${prefix}.text`, MAX_CONTENT_STRING);
    if (text !== sourceText.slice(start, end)) {
      throw new Error(`${prefix}.text must equal request.source.snapshot.text.slice(start, end)`);
    }
    assertMeaningful(text, `${prefix}.text`);
    cursor = end;
    const gloss = requiredString(chunk.gloss, `${prefix}.gloss`, MAX_GLOSS);
    const role = requiredString(chunk.role, `${prefix}.role`, MAX_ROLE);
    const explanation = requiredString(chunk.explanation, `${prefix}.explanation`, MAX_EXPLANATION);

    if (!Array.isArray(chunk.words) || chunk.words.length > MAX_WORDS_PER_CHUNK) {
      throw new Error(`${prefix}.words must be an array with at most ${MAX_WORDS_PER_CHUNK} items`);
    }
    const words: Candidate[] = [];
    for (let wordIndex = 0; wordIndex < chunk.words.length; wordIndex += 1) {
      const wordPrefix = `${prefix}.words[${wordIndex}]`;
      const candidate = validateCandidate(chunk.words[wordIndex], wordPrefix);
      if (candidate.card.type !== 'word') throw new Error(`${wordPrefix}.card.type must be "word"`);
      if (candidate.card.lang !== request.source.snapshot.lang) {
        throw new Error(`${wordPrefix}.card.lang must equal request.source.snapshot.lang`);
      }
      if (candidate.card.translation.length > MAX_GLOSS) {
        throw new Error(`${wordPrefix}.card.translation must be at most ${MAX_GLOSS} UTF-16 code units`);
      }
      assertGeneratedWordReading(candidate.card, `${wordPrefix}.card`);
      if (candidate.sources === undefined) {
        throw new Error(`${wordPrefix}.sources is required for breakdown words`);
      }
      for (let sourceIndex = 0; sourceIndex < candidate.sources.length; sourceIndex += 1) {
        const sourcePrefix = `${wordPrefix}.sources[${sourceIndex}]`;
        const source = candidate.sources[sourceIndex];
        assertSourceMatches(source, request.source, sourcePrefix);
        if (source.span.start < start || source.span.end > end) {
          throw new Error(`${sourcePrefix}.span must be within its containing chunk`);
        }
      }
      words.push(candidate);
    }

    const target = objectValue(chunk.target, `${prefix}.target`);
    const kind = enumValue(target.kind, ['word', 'chunk'] as const, `${prefix}.target.kind`);
    if (kind === 'word') {
      assertExactFields(target, ['kind', 'index'], `${prefix}.target`);
      const index = nonnegativeInteger(target.index, `${prefix}.target.index`);
      if (index >= words.length) throw new Error(`${prefix}.target.index must index words`);
      const candidate = words[index];
      if (candidate === undefined || candidate.card.type !== 'word' || candidate.sources === undefined) {
        throw new Error(`${prefix}.target.index must index a word candidate with source evidence`);
      }
      const bounds = meaningfulBounds(sourceText, start, end);
      const coversMeaningfulChunk = candidate.sources.some(
        (source) => source.span.start === bounds.start && source.span.end === bounds.end,
      );
      if (!coversMeaningfulChunk) {
        throw new Error(`${prefix}.target word source must cover the chunk except edge punctuation and whitespace`);
      }
      const encountered = sourceText.slice(bounds.start, bounds.end);
      if (normalizeIdentityText(candidate.card.text) !== normalizeIdentityText(encountered)) {
        throw new Error(`${prefix}.target word text must equal the encountered target after edge trimming`);
      }
    } else {
      assertExactFields(target, ['kind', 'card'], `${prefix}.target`);
      const card = validateCard(target.card, `${prefix}.target.card`);
      if (card.type !== 'chunk') throw new Error(`${prefix}.target.card.type must be "chunk"`);
      if (card.lang !== request.source.snapshot.lang) {
        throw new Error(`${prefix}.target.card.lang must equal request.source.snapshot.lang`);
      }
      assertSourceMatches(card.source, request.source, `${prefix}.target.card.source`);
      if (card.source.span.start !== start || card.source.span.end !== end) {
        throw new Error(`${prefix}.target.card.source.span must equal the chunk span`);
      }
      if (card.translation !== gloss) {
        throw new Error(`${prefix}.target.card.translation must equal ${prefix}.gloss`);
      }
      if (card.role !== role) throw new Error(`${prefix}.target.card.role must equal ${prefix}.role`);
      if (card.explanation !== explanation) {
        throw new Error(`${prefix}.target.card.explanation must equal ${prefix}.explanation`);
      }
    }
  }
  assertIgnorableGap(sourceText.slice(cursor), 'response.chunks');
  validateUsage(response.usage, 'response.usage');
  return value as BreakdownResponse;
}

export function validateCardBatch(value: unknown): CardBatch {
  const batch = objectValue(value, 'batch');
  assertExactFields(batch, ['schemaVersion', 'cards'], 'batch');
  if (batch.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`batch.schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(batch.cards)) throw new Error('batch.cards must be an array');
  for (let index = 0; index < batch.cards.length; index += 1) {
    validateCandidate(batch.cards[index], `batch.cards[${index}]`);
  }
  return value as CardBatch;
}
