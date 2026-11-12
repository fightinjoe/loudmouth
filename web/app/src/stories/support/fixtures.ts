import {
  PHRASEBOOK_SCHEMA_VERSION, SCHEMA_VERSION, cardIdentity, evidenceIdentity,
  validateCard, validateCandidate, validateContextResult, validatePhrasebookResponse,
  validateBreakdownRequest, validateBreakdownResponse, validatePhrasebookImageResponse,
  type Card, type Lang, type Phrase, type Word, type Snapshot,
  type Evidence, type ContextResponse, type PhrasebookResponse, type BreakdownRequest,
  type BreakdownResponse, type PhrasebookImageResponse, type PhrasebookPhrase,
} from '@catchphrase/card-schema';
import { db, getCards, getCardsByLang, getDecks, getGroups, restoreAllData } from '../../js/db';
import type { Deck, Group, LibraryEntry, LibraryBackup, Occurrence } from '../../js/library-types';

export interface FixtureOptions {
  library?: 'empty' | 'single' | 'multiple' | 'language-only';
  lang?: Lang;
  starred?: boolean;
  illustration?: 'absent' | 'pending' | 'failed' | 'ready';
}
export interface SeededLibrary { decks: Deck[]; deck?: Deck; entries: LibraryEntry[]; groups: Group[] }
export const FIXTURE_DATE = '2026-01-15T12:00:00.000Z';
export const FIXTURE_LANGUAGES: readonly Lang[] = ['ja', 'zh', 'es', 'cs', 'uk'];
export const FIXTURE_TITLE = 'At the café';
export const FIXTURE_TOPICS = ['Ordering drinks', 'Dietary preferences', 'Paying the bill'] as const;
export const HOSTILE_TEXT = '<script>alert("literal text")</script> & "quoted" <img src=x onerror=alert(1)>';
export const LONG_TEXT = 'A quiet café with friends, a very long menu, and enough time to explain exactly what you would like. '.repeat(8).trim();
export const LONG_TITLE = LONG_TEXT.slice(0, 500);
const usage = { model: 'storybook-fixture', inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, durationMs: 0 };
const id = (number: number): string => `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const languageIndex = (lang: Lang): number => FIXTURE_LANGUAGES.indexOf(lang);

// Authored UI specimens, not independently certified language-quality gold labels.
const vocabulary: Record<Lang, { request: Snapshot; alternative: Snapshot; reply: Snapshot; words: [Word, Word] }> = {
  ja: {
    request: { lang: 'ja', text: 'お茶をください。', translation: 'Tea, please.', reading: [['お茶', 'おちゃ'], ['をください。', null]], romanization: 'Ocha o kudasai.' },
    alternative: { lang: 'ja', text: '水をください。', translation: 'Water, please.', reading: [['水', 'みず'], ['をください。', null]], romanization: 'Mizu o kudasai.' },
    reply: { lang: 'ja', text: 'はい、どうぞ。', translation: 'Here you are.', reading: [['はい、どうぞ。', null]], romanization: 'Hai, dōzo.' },
    words: [
      { type: 'word', lang: 'ja', text: 'お茶', reading: [['お茶', 'おちゃ']], romanization: 'ocha', translation: 'tea', partOfSpeech: 'noun', senseKey: 'tea' },
      { type: 'word', lang: 'ja', text: '水', reading: [['水', 'みず']], romanization: 'mizu', translation: 'water', partOfSpeech: 'noun', senseKey: 'water' },
    ],
  },
  zh: {
    request: { lang: 'zh', text: '请给我茶。', translation: 'Tea, please.', reading: [['请', 'qǐng'], ['给', 'gěi'], ['我', 'wǒ'], ['茶', 'chá'], ['。', null]], romanization: 'Qǐng gěi wǒ chá.' },
    alternative: { lang: 'zh', text: '请给我水。', translation: 'Water, please.', reading: [['请', 'qǐng'], ['给', 'gěi'], ['我', 'wǒ'], ['水', 'shuǐ'], ['。', null]], romanization: 'Qǐng gěi wǒ shuǐ.' },
    reply: { lang: 'zh', text: '给你。', translation: 'Here you are.', reading: [['给', 'gěi'], ['你', 'nǐ'], ['。', null]], romanization: 'Gěi nǐ.' },
    words: [
      { type: 'word', lang: 'zh', text: '茶', reading: [['茶', 'chá']], romanization: 'chá', translation: 'tea', partOfSpeech: 'noun', senseKey: 'tea' },
      { type: 'word', lang: 'zh', text: '水', reading: [['水', 'shuǐ']], romanization: 'shuǐ', translation: 'water', partOfSpeech: 'noun', senseKey: 'water' },
    ],
  },
  es: {
    request: { lang: 'es', text: 'Té, por favor.', translation: 'Tea, please.' },
    alternative: { lang: 'es', text: 'Agua, por favor.', translation: 'Water, please.' },
    reply: { lang: 'es', text: 'Aquí tiene.', translation: 'Here you are.' },
    words: [
      { type: 'word', lang: 'es', text: 'té', translation: 'tea', partOfSpeech: 'noun', senseKey: 'tea' },
      { type: 'word', lang: 'es', text: 'agua', translation: 'water', partOfSpeech: 'noun', senseKey: 'water' },
    ],
  },
  cs: {
    request: { lang: 'cs', text: 'Čaj, prosím.', translation: 'Tea, please.' },
    alternative: { lang: 'cs', text: 'Vodu, prosím.', translation: 'Water, please.' },
    reply: { lang: 'cs', text: 'Tady máte.', translation: 'Here you are.' },
    words: [
      { type: 'word', lang: 'cs', text: 'čaj', translation: 'tea', partOfSpeech: 'noun', senseKey: 'tea' },
      { type: 'word', lang: 'cs', text: 'voda', translation: 'water', partOfSpeech: 'noun', senseKey: 'water' },
    ],
  },
  uk: {
    request: { lang: 'uk', text: 'Чай, будь ласка.', translation: 'Tea, please.' },
    alternative: { lang: 'uk', text: 'Воду, будь ласка.', translation: 'Water, please.' },
    reply: { lang: 'uk', text: 'Ось, будь ласка.', translation: 'Here you are.' },
    words: [
      { type: 'word', lang: 'uk', text: 'чай', translation: 'tea', partOfSpeech: 'noun', senseKey: 'tea' },
      { type: 'word', lang: 'uk', text: 'вода', translation: 'water', partOfSpeech: 'noun', senseKey: 'water' },
    ],
  },
};

export function fixtureDeck(lang: Lang = 'ja'): Deck {
  return { id: id(1 + languageIndex(lang)), name: FIXTURE_TITLE, lang, createdAt: FIXTURE_DATE,
    lastAccessedAt: FIXTURE_DATE, mode: 'study', order: 'default', readingDisplay: 'reading',
    generation: { seed: 'Ordering at a café', ability: 'basics', answers: { Company: 'Friends' } } };
}

function wordEvidence(lang: Lang, index: 0 | 1, occurrenceId?: string): Evidence {
  const snapshot = structuredClone(index === 0 ? vocabulary[lang].request : vocabulary[lang].alternative);
  // Inflected water forms in Czech/Ukrainian remain exact encountered evidence.
  const encountered = lang === 'cs' && index === 1 ? 'Vodu' : lang === 'uk' && index === 1 ? 'Воду' : vocabulary[lang].words[index].text;
  const start = snapshot.text.toLocaleLowerCase().indexOf(encountered.toLocaleLowerCase());
  if (start < 0) throw new Error(`Missing fixture evidence: ${lang}/${index}`);
  return { snapshot, span: { start, end: start + encountered.length }, ...(occurrenceId ? { ref: { occurrenceId } } : {}) };
}

export function fixtureEntry(type: Card['type'] = 'phrase', lang: Lang = 'ja'): LibraryEntry {
  const base = 100 + languageIndex(lang) * 100;
  const cardId = id(base + (type === 'phrase' ? 0 : type === 'word' ? 1 : 2));
  const source = wordEvidence(lang, 0);
  let card: Card;
  if (type === 'phrase') card = { type, ...structuredClone(vocabulary[lang].request) };
  else if (type === 'word') card = { ...structuredClone(vocabulary[lang].words[0]), definition: 'A drink prepared by steeping tea leaves in water.' };
  else {
    const snapshot = structuredClone(vocabulary[lang].request);
    card = { type, lang, text: snapshot.text, translation: snapshot.translation,
      ...(snapshot.reading ? { reading: snapshot.reading } : {}),
      ...(snapshot.romanization ? { romanization: snapshot.romanization } : {}),
      source: { snapshot, span: { start: 0, end: snapshot.text.length } }, role: 'Polite request',
      explanation: 'Use this short request when ordering a drink.' };
  }
  validateCandidate(type === 'word' ? { card, sources: [source] } : { card });
  const occurrence = type === 'phrase' ? { id: id(base + 10), deckId: fixtureDeck(lang).id,
    cardId, position: 0, translation: card.translation } : undefined;
  return { key: occurrence?.id ?? cardId, cardId, card,
    membership: { deckId: fixtureDeck(lang).id, cardId, createdAt: FIXTURE_DATE, position: 0, starredAt: null },
    ...(occurrence ? { occurrence } : {}), sources: type === 'word' ? [source] : [] };
}

/** Deliberate layout/escaping specimens; the hostile suffix is literal test text,
 * not a proposed translation. Missing readings intentionally exercise fallback. */
export function textFixtureEntry(kind: 'long' | 'hostile', lang: Lang = 'ja'): LibraryEntry {
  const entry = fixtureEntry('phrase', lang);
  const original = entry.card;
  entry.card = validateCard({ type: 'phrase', lang,
    text: kind === 'long' ? `${original.text} `.repeat(30).trim() : `${original.text} ${HOSTILE_TEXT}`,
    translation: kind === 'long' ? LONG_TEXT : HOSTILE_TEXT,
  });
  if (entry.occurrence) entry.occurrence.translation = entry.card.translation;
  return entry;
}

/** The current real /context validator requires at least one question. A zero-question
 * success is intentionally not manufactured here; that is controller-only test coverage. */
export function contextResponse(): ContextResponse {
  return validateContextResult({ questions: [
    { label: 'Company', options: ['Friends', 'On my own', 'Family'] },
    { label: 'Setting', options: ['A quiet café', 'A busy takeaway counter'] },
  ], checklist: FIXTURE_TOPICS.map((label, index) => ({ label, checked: index < 2 })),
  imagePrompt: 'A warm illustrated café with tea cups and a leafy window, no lettering.', usage: { ...usage } });
}

export function phrasebookResponse(language: Lang, checklist: readonly string[]): PhrasebookResponse {
  const data = vocabulary[language];
  const groups = checklist.map((title, index) => {
    const base = 10000 + languageIndex(language) * 10000 + index * 100;
    const phrase = (offset: number, snapshot: Snapshot): PhrasebookPhrase => ({ id: id(base + offset), card: { type: 'phrase', ...structuredClone(snapshot) } });
    return { id: id(base), title,
      thingsToSay: [phrase(1, data.request), phrase(2, data.alternative)],
      likelyExchanges: [{ id: id(base + 3), title: 'Choosing a drink', lines: [
        { speaker: 'you' as const, responses: [phrase(4, data.request), phrase(5, data.alternative)] },
        { speaker: 'partner' as const, responses: [phrase(6, data.reply)] },
      ] }],
      words: [{ id: id(base + 7), title: 'Drinks', items: data.words.map((card, wordIndex) => ({
        card: structuredClone(card), sources: [wordEvidence(language, wordIndex as 0 | 1, id(base + 1 + wordIndex))],
      })) }],
      exampleConversation: [
        { ...phrase(8, data.request), speaker: 'you' as const },
        { ...phrase(9, data.reply), speaker: 'partner' as const },
      ],
    };
  });
  return validatePhrasebookResponse({ schemaVersion: PHRASEBOOK_SCHEMA_VERSION, title: FIXTURE_TITLE, groups, flags: [], usage: { ...usage } });
}

/** Preserve the actual request snapshot/ref; never return evidence for a different phrase. */
export function breakdownResponse(request: BreakdownRequest): BreakdownResponse {
  validateBreakdownRequest(request);
  const { snapshot } = request.source;
  const text = snapshot.text;
  const meaningful = /[^\p{P}\p{White_Space}]/u;
  const first = text.search(meaningful);
  if (first < 0) throw new Error('A breakdown fixture needs meaningful source text');
  const firstToken = snapshot.reading?.find(([base]) => meaningful.test(base));
  const run = text.slice(first).match(/^[\p{L}\p{M}\p{N}]+/u)?.[0] ?? String.fromCodePoint(text.codePointAt(first)!);
  const wordText = (firstToken && text.startsWith(firstToken[0], first) ? firstToken[0] : run)
    .replace(/[\p{P}\p{White_Space}]+$/u, '');
  const end = first + wordText.length;
  const evidence: Evidence = { ...structuredClone(request.source), span: { start: first, end } };
  const known = vocabulary[snapshot.lang].words.find((word) => word.text.toLocaleLowerCase() === wordText.toLocaleLowerCase());
  const word: Word = { type: 'word', lang: snapshot.lang, text: wordText,
    translation: known?.translation ?? 'Opening expression', partOfSpeech: known?.partOfSpeech ?? 'expression',
    senseKey: known?.senseKey ?? 'opening-expression',
    ...((snapshot.lang === 'ja' || snapshot.lang === 'zh') ? { reading: [[wordText, firstToken?.[1] ?? null]] as Word['reading'] } : {}),
    ...(known?.romanization ? { romanization: known.romanization } : {}),
  };
  const chunks: BreakdownResponse['chunks'] = [{ start: first, end, text: wordText,
    gloss: word.translation, role: 'Opening expression', explanation: 'This is the opening expression in the source phrase.',
    words: [{ card: word, sources: [evidence] }], target: { kind: 'word', index: 0 } }];
  if (meaningful.test(text.slice(end))) {
    const start = end;
    const remaining = text.slice(start);
    const gloss = 'The rest of the expression';
    const role = 'Phrase continuation';
    const explanation = 'Learn this continuation together with the opening expression. This is deterministic workbench teaching, not generated linguistic analysis.';
    chunks.push({ start, end: text.length, text: remaining, gloss, role, explanation, words: [],
      target: { kind: 'chunk', card: { type: 'chunk', lang: snapshot.lang, text: remaining, translation: gloss,
        source: { ...structuredClone(request.source), span: { start, end: text.length } }, role, explanation } } });
  }
  return validateBreakdownResponse({ schemaVersion: SCHEMA_VERSION, chunks, flags: [], usage: { ...usage } }, request);
}

export function imageResponse(): PhrasebookImageResponse {
  // Local 16×9 PNG bytes shared with the existing persistence fixture; no network asset dependency.
  return validatePhrasebookImageResponse({ image: {
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAYAAAA7KqwyAAAAFklEQVR4nGP4sGVaAyWYYdSAUQOAGAAeWIiwsY03XwAAAABJRU5ErkJggg==',
    mediaType: 'image/png', width: 16, height: 9,
  }, usage: { model: 'storybook-fixture', costUsd: 0, durationMs: 0,
    stages: [{ provider: 'local', model: 'storybook-fixture', costUsd: 0, durationMs: 0 }] } });
}

/** A current-v4 backup graph with fixed IDs, times and explicit relationships.
 * restoreAllData performs production validation and the atomic seven-table write. */
export function fixtureBackup(options: FixtureOptions = {}): LibraryBackup {
  const { library = 'single', lang = 'ja', starred = false, illustration = 'absent' } = options;
  const backup: LibraryBackup = { schemaVersion: 4, cards: [], decks: [], groups: [], memberships: [], occurrences: [], topicWords: [], provenance: [] };
  if (library === 'empty') return backup;
  let nextId = 100000;
  const identities = new Map<string, string>();
  const addCard = (card: Card): string => {
    validateCard(card);
    const identityKey = cardIdentity(card);
    const existing = identities.get(identityKey);
    if (existing) return existing;
    const cardId = id(nextId++);
    identities.set(identityKey, cardId);
    backup.cards.push({ id: cardId, identityKey, lang: card.lang, type: card.type, createdAt: FIXTURE_DATE, content: structuredClone(card) });
    return cardId;
  };
  const addSources = (cardId: string, deckId: string, sources: Evidence[]): void => {
    for (const source of sources) {
      const sourceKey = evidenceIdentity(source);
      if (!backup.provenance.some((row) => row.cardId === cardId && row.deckId === deckId && row.sourceKey === sourceKey)) {
        backup.provenance.push({ id: id(nextId++), cardId, deckId, sourceKey, source: structuredClone(source), createdAt: FIXTURE_DATE });
      }
    }
  };
  if (library === 'language-only') {
    for (const type of ['phrase', 'word', 'chunk'] as const) {
      const entry = fixtureEntry(type, lang);
      addSources(addCard(entry.card), '', entry.sources);
    }
    return backup;
  }
  const languages = library === 'multiple' ? [lang, ...FIXTURE_LANGUAGES.filter((value) => value !== lang)] : [lang];
  // Two books in the selected language make independent membership behavior inspectable.
  const books = library === 'multiple' ? [...languages, lang] : languages;
  books.forEach((language, bookIndex) => {
    const deck = fixtureDeck(language);
    if (bookIndex === languages.length) { deck.id = id(50); deck.name = 'Another café visit'; }
    else if (library === 'multiple') deck.name = `${FIXTURE_TITLE} · ${language.toUpperCase()}`;
    if (illustration !== 'absent') deck.illustration = illustration === 'ready'
      ? { state: 'ready', requestId: id(900 + bookIndex), prompt: contextResponse().imagePrompt, image: imageResponse().image }
      : { state: illustration, requestId: id(900 + bookIndex), prompt: contextResponse().imagePrompt };
    backup.decks.push(deck);
    const positions = { phrase: 0, word: 0, chunk: 0 };
    const attach = (card: Card): string => {
      const cardId = addCard(card);
      if (!backup.memberships.some((row) => row.deckId === deck.id && row.cardId === cardId)) {
        backup.memberships.push({ deckId: deck.id, cardId, createdAt: FIXTURE_DATE,
          position: positions[card.type]++, starredAt: starred ? FIXTURE_DATE : null });
      }
      return cardId;
    };
    const response = phrasebookResponse(language, FIXTURE_TOPICS);
    // Remap draft presentation IDs per book, preserving evidence links.
    const presentation = new Map<string, string>();
    const ownedId = (draft: string): string => {
      let value = presentation.get(draft);
      if (!value) { value = id(nextId++); presentation.set(draft, value); }
      return value;
    };
    response.groups.forEach((draft, groupIndex) => {
      const group: Group = { id: ownedId(draft.id), deckId: deck.id, title: draft.title, position: groupIndex,
        exchanges: draft.likelyExchanges.map((exchange, position) => ({ id: ownedId(exchange.id), title: exchange.title, position })),
        wordFamilies: draft.words.map((family, position) => ({ id: ownedId(family.id), title: family.title, position })) };
      backup.groups.push(group);
      const addPhrase = (entry: PhrasebookPhrase, position: number, section: Occurrence['section'], extra: Partial<Occurrence> = {}): void => {
        backup.occurrences.push({ id: ownedId(entry.id), deckId: deck.id, groupId: group.id,
          cardId: attach(entry.card), translation: entry.card.translation, position, section, ...extra });
      };
      draft.thingsToSay.forEach((entry, position) => addPhrase(entry, position, 'thingsToSay'));
      draft.likelyExchanges.forEach((exchange) => exchange.lines.forEach((line, turnIndex) => line.responses.forEach((entry, position) =>
        addPhrase(entry, position, 'likelyExchanges', { exchangeId: ownedId(exchange.id), turnIndex, speaker: line.speaker }))));
      draft.exampleConversation.forEach((entry, position) => addPhrase(entry, position, 'exampleConversation', { speaker: entry.speaker }));
      draft.words.forEach((family) => family.items.forEach((candidate, position) => {
        const cardId = attach(candidate.card);
        backup.topicWords.push({ id: id(nextId++), deckId: deck.id, groupId: group.id, familyId: ownedId(family.id), cardId, position });
        addSources(cardId, deck.id, (candidate.sources ?? []).map((source) => {
          const occurrenceId = ownedId(source.ref!.occurrenceId!);
          const occurrence = backup.occurrences.find((row) => row.id === occurrenceId)!;
          return { ...source, ref: { occurrenceId, cardId: occurrence.cardId } };
        }));
      }));
    });
    // Supplemental entries exercise all three ungrouped sections without fabricating a UI template.
    const supplemental = fixtureEntry('phrase', language).card as Phrase;
    const supplementalId = attach(supplemental);
    const occurrenceId = id(nextId++);
    backup.occurrences.push({ id: occurrenceId, deckId: deck.id, cardId: supplementalId, position: 0, translation: supplemental.translation });
    const chunk = fixtureEntry('chunk', language).card;
    if (chunk.type === 'chunk') {
      chunk.source.ref = { cardId: supplementalId, occurrenceId };
      attach(chunk);
    }
    const extraWord: Word = { ...structuredClone(vocabulary[language].words[0]), senseKey: 'tea-drink', definition: 'Tea as a prepared drink.' };
    const extraId = attach(extraWord);
    addSources(extraId, deck.id, [{ ...wordEvidence(language, 0), ref: { cardId: supplementalId, occurrenceId } }]);
  });
  return backup;
}

export async function seedLibrary(options: FixtureOptions = {}): Promise<SeededLibrary> {
  if (!db.name.startsWith('catchphrase-storybook.')) throw new Error('Refusing to seed outside the isolated Storybook database');
  const backup = fixtureBackup(options);
  await restoreAllData(backup);
  const decks = await getDecks();
  const deck = decks.find((item) => item.id === fixtureDeck(options.lang ?? 'ja').id) ?? decks[0];
  return { decks, ...(deck ? { deck } : {}),
    entries: deck ? await getCards(deck.id) : await getCardsByLang(options.lang ?? 'ja'),
    groups: deck ? await getGroups(deck.id) : [] };
}
