import Dexie, {
  type DexieOptions,
  type Table,
  type Transaction,
} from "dexie";
import {
  cardIdentity,
  evidenceIdentity,
  validateCandidate,
  validateCard,
  validateEvidence,
  validatePhrasebookImage,
  type Candidate,
  type Card,
  type Evidence,
  type Lang,
  type Phrase,
} from "@catchphrase/card-schema";
import type {
  CardRecord,
  CommitPhrasebookInput,
  Deck,
  DeckMode,
  DeckIllustration,
  DeckOrder,
  Generation,
  Group,
  LibraryBackup,
  LibraryEntry,
  Membership,
  Occurrence,
  PhrasebookDraftGroup,
  PhrasebookDraftEssential,
  PhrasebookDraftDialogueLine,
  Provenance,
  ReadingDisplay,
  TopicWordPlacement,
} from "./library-types";

import { LIBRARY_SCHEMA_VERSION } from "./library-types";
import { uuid } from "./utils";
import { ABILITIES } from "./ability";
import { CONTENT_LANGUAGES } from "./lang";

const DATABASE_NAME = "loudmouth-topic-v3";
const MODES: readonly DeckMode[] = ["study", "review", "reverse"];
const ORDERS: readonly DeckOrder[] = ["default", "random", "reverse"];
const READING_DISPLAYS: readonly ReadingDisplay[] = ["reading", "romanization"];
const MAX_CONTENT_LENGTH = 2_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class LibraryDb extends Dexie {
  cards!: Table<CardRecord, string>;
  decks!: Table<Deck, string>;
  groups!: Table<Group, string>;
  memberships!: Table<Membership, [string, string]>;
  occurrences!: Table<Occurrence, string>;
  provenance!: Table<Provenance, string>;
  topicWords!: Table<TopicWordPlacement, string>;

  constructor(options: DexieOptions = {}) {
    super(DATABASE_NAME, options);
    this.version(1).stores({
      cards: "id, &identityKey, lang, type, createdAt",
      decks: "id, lang, createdAt, lastAccessedAt",
      groups: "id, deckId, [deckId+position]",
      memberships: "[deckId+cardId], deckId, cardId, [deckId+position]",
      occurrences: "id, deckId, groupId, cardId, [groupId+position]",
      provenance: "id, cardId, deckId, &[cardId+deckId+sourceKey]",
      topicWords: "id, deckId, groupId, cardId, [deckId+groupId]",
    });
  }
}

export function createDb(options: DexieOptions = {}): LibraryDb {
  return new LibraryDb(options);
}

export const db = createDb();


function isoNow(): string {
  return new Date().toISOString();
}

function objectValue(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactFields(
  value: Record<string, unknown>,
  accepted: readonly string[],
  path: string,
): void {
  const fields = new Set(accepted);
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) throw new Error(`${path}.${field} is not allowed`);
  }
}

function requiredString(value: unknown, path: string, maximum = MAX_CONTENT_LENGTH): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a nonblank string`);
  }
  if (value.length > maximum) {
    throw new Error(`${path} must be at most ${maximum} UTF-16 code units`);
  }
  return value;
}
function uuidString(value: unknown, path: string): string {
  const id = requiredString(value, path);
  if (!UUID_PATTERN.test(id)) throw new Error(`${path} must be a UUID`);
  return id;
}


function enumValue<const T extends string>(
  value: unknown,
  accepted: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !accepted.some((item) => item === value)) {
    throw new Error(`${path} must be one of ${accepted.join(", ")}`);
  }
  return value as T;
}

function nonnegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a nonnegative integer`);
  }
  return value;
}

function isoTimestamp(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${path} must be an ISO timestamp`);
  }
  return value;
}

function optionalTrue(value: unknown, path: string): true {
  if (value !== true) throw new Error(`${path} must be true when present`);
  return true;
}

function assertAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
}

export async function initializeLibrary(store: LibraryDb = db): Promise<void> {
  await store.open();
  await store.transaction("rw", store.decks, async () => {
    await store.decks.filter((deck) => deck.illustration?.state === "pending")
      .modify((deck) => {
        if (deck.illustration?.state === "pending") {
          deck.illustration = { ...deck.illustration, state: "failed" };
        }
      });
  });
}

function validateDeckIllustration(value: unknown, path: string): DeckIllustration {
  const illustration = objectValue(value, path);
  const state = enumValue(illustration.state, ["pending", "failed", "ready"], `${path}.state`);
  assertExactFields(illustration,
    state === "ready" ? ["requestId", "prompt", "state", "image"] : ["requestId", "prompt", "state"], path);
  const requestId = requiredString(illustration.requestId, `${path}.requestId`);
  const prompt = requiredString(illustration.prompt, `${path}.prompt`);
  if (prompt !== prompt.trim()) throw new Error(`${path}.prompt must be trimmed`);
  return state === "ready"
    ? { requestId, prompt, state, image: validatePhrasebookImage(illustration.image, `${path}.image`) }
    : { requestId, prompt, state };
}

export async function setDeckIllustration(
  deckId: string,
  requestId: string,
  next: DeckIllustration,
  store: LibraryDb = db,
): Promise<boolean> {
  const illustration = structuredClone(validateDeckIllustration(next, "illustration"));
  if (illustration.requestId !== requestId) return false;
  return store.transaction("rw", store.decks, async () => {
    const deck = await store.decks.get(deckId);
    if (!deck || deck.illustration?.requestId !== requestId
      || deck.illustration.prompt !== illustration.prompt
      || (deck.illustration.state === "ready" && illustration.state !== "ready")) return false;
    await store.decks.update(deckId, { illustration });
    return true;
  });
}

function validateGeneration(value: unknown, path: string): Generation {
  const generation = objectValue(value, path);
  assertExactFields(generation, ["seed", "ability", "answers"], path);
  const seed = requiredString(generation.seed, `${path}.seed`, 200);
  const ability = enumValue(generation.ability, ABILITIES, `${path}.ability`);
  const rawAnswers = objectValue(generation.answers, `${path}.answers`);
  const entries = Object.entries(rawAnswers);
  if (entries.length > 5) throw new Error(`${path}.answers must contain at most 5 answers`);
  const answers = Object.fromEntries(entries.map(([label, answer]): [string, string] => {
    requiredString(label, `${path}.answers label`, 200);
    return [label, requiredString(answer, `${path}.answers.${label}`, 500)];
  }));
  return { seed, ability, answers };
}

function validateDraftEssential(
  value: unknown,
  path: string,
  lang: Lang,
  dialogue = false,
): PhrasebookDraftEssential | PhrasebookDraftDialogueLine {
  const phrase = objectValue(value, path);
  assertExactFields(phrase, dialogue ? ["id", "card", "speaker", "alternative"] : ["id", "card"], path);
  const id = requiredString(phrase.id, `${path}.id`);
  const card = validateCard(phrase.card, `${path}.card`);
  if (card.type !== "phrase") throw new Error(`${path}.card.type must be phrase`);
  if (card.lang !== lang) throw new Error(`${path}.card.lang must equal phrasebook lang`);
  if (!dialogue) return { id, card };
  return {
    id,
    card,
    speaker: enumValue(phrase.speaker, ["you", "partner"], `${path}.speaker`),
    ...(Object.hasOwn(phrase, "alternative")
      ? { alternative: optionalTrue(phrase.alternative, `${path}.alternative`) } : {}),
  };
}

function validateDraftGroup(value: unknown, path: string, lang: Lang): PhrasebookDraftGroup {
  const group = objectValue(value, path);
  assertExactFields(group, ["id", "title", "essentials", "vocab", "dialogue"], path);
  const id = requiredString(group.id, `${path}.id`);
  const title = requiredString(group.title, `${path}.title`, 500);
  if (!Array.isArray(group.essentials) || group.essentials.length < 1 || group.essentials.length > 8) {
    throw new Error(`${path}.essentials must contain 1–8 phrases`);
  }
  if (!Array.isArray(group.dialogue) || group.dialogue.length < 2 || group.dialogue.length > 10) {
    throw new Error(`${path}.dialogue must contain 2–10 phrases`);
  }
  if (!Array.isArray(group.vocab) || group.vocab.length > 10) {
    throw new Error(`${path}.vocab must contain 0–10 Words`);
  }
  const essentials = group.essentials.map((phrase, index) =>
    validateDraftEssential(phrase, `${path}.essentials[${index}]`, lang));
  const dialogue = group.dialogue.map((phrase, index) =>
    validateDraftEssential(phrase, `${path}.dialogue[${index}]`, lang, true) as PhrasebookDraftDialogueLine);
  if (new Set(dialogue.map((phrase) => phrase.speaker)).size !== 2) {
    throw new Error(`${path}.dialogue must contain both speakers`);
  }
  for (const [index, line] of dialogue.entries()) {
    if ((line.alternative === true) !== (index > 0 && dialogue[index - 1].speaker === line.speaker)) {
      throw new Error(`${path}.dialogue[${index}].alternative must match adjacent same-speaker lines`);
    }
  }
  const phraseById = new Map<string, PhrasebookDraftEssential>();
  for (const phrase of [...essentials, ...dialogue]) {
    if (phraseById.has(phrase.id)) throw new Error(`${path} contains duplicate phrase id ${phrase.id}`);
    phraseById.set(phrase.id, phrase);
  }
  const vocab = group.vocab.map((candidate, index) => {
    const validated = validateCandidate(candidate, `${path}.vocab[${index}]`);
    if (validated.card.type !== "word") throw new Error(`${path}.vocab[${index}].card.type must be word`);
    if (validated.card.lang !== lang) throw new Error(`${path}.vocab[${index}].card.lang must equal phrasebook lang`);
    for (const [sourceIndex, source] of (validated.sources ?? []).entries()) {
      const draftPhrase = source.ref?.occurrenceId ? phraseById.get(source.ref.occurrenceId) : undefined;
      if (source.ref && (!draftPhrase || Object.hasOwn(source.ref, "cardId"))) {
        throw new Error(`${path}.vocab[${index}].sources[${sourceIndex}].ref must contain only the occurrenceId of a phrase in its group`);
      }
      if (draftPhrase) {
        const snapshot = source.snapshot;
        const card = draftPhrase.card;
        if (snapshot.lang !== card.lang || snapshot.text !== card.text
          || snapshot.translation !== card.translation || snapshot.romanization !== card.romanization
          || JSON.stringify(snapshot.reading) !== JSON.stringify(card.reading)) {
          throw new Error(`${path}.vocab[${index}].sources[${sourceIndex}].snapshot must exactly match its draft phrase`);
        }
      }
    }
    return validated;
  });
  return { id, title, essentials, vocab, dialogue };
}

function validateCommitInput(value: unknown): CommitPhrasebookInput {
  const input = objectValue(value, "input");
  assertExactFields(
    input,
    ["name", "lang", "generation", "ability", "seedId", "illustration", "groups", "selectedIndexes"],
    "input",
  );
  const name = requiredString(input.name, "input.name", 500);
  const lang = enumValue(input.lang, CONTENT_LANGUAGES, "input.lang");
  const generation = Object.hasOwn(input, "generation")
    ? validateGeneration(input.generation, "input.generation")
    : undefined;
  const ability = Object.hasOwn(input, "ability")
    ? enumValue(input.ability, ABILITIES, "input.ability")
    : undefined;
  const seedId = Object.hasOwn(input, "seedId")
    ? requiredString(input.seedId, "input.seedId", 500)
    : undefined;
  const illustration = Object.hasOwn(input, "illustration")
    ? validateDeckIllustration(input.illustration, "input.illustration") : undefined;
  if (!Array.isArray(input.groups) || input.groups.length < 1 || input.groups.length > 8) {
    throw new Error("input.groups must contain 1–8 topics");
  }
  const groups = input.groups.map((group, index) =>
    validateDraftGroup(group, `input.groups[${index}]`, lang));
  const groupIds = new Set<string>();
  const phraseIds = new Set<string>();
  for (const group of groups) {
    if (groupIds.has(group.id)) throw new Error(`input.groups contains duplicate id ${group.id}`);
    groupIds.add(group.id);
    for (const phrase of [...group.essentials, ...group.dialogue]) {
      if (phraseIds.has(phrase.id)) {
        throw new Error(`input.groups contains duplicate phrase id ${phrase.id}`);
      }
      phraseIds.add(phrase.id);
    }
  }
  if (!Array.isArray(input.selectedIndexes) || input.selectedIndexes.length === 0) {
    throw new Error("input.selectedIndexes must be a nonempty array");
  }
  const selectedIndexes = input.selectedIndexes.map((index, position) => {
    const selected = nonnegativeInteger(index, `input.selectedIndexes[${position}]`);
    if (selected >= groups.length) {
      throw new Error(`input.selectedIndexes[${position}] is outside input.groups`);
    }
    return selected;
  });
  if (new Set(selectedIndexes).size !== selectedIndexes.length) {
    throw new Error("input.selectedIndexes must not contain duplicates");
  }
  return {
    name,
    lang,
    ...(generation ? { generation } : {}),
    ...(ability ? { ability } : {}),
    ...(seedId ? { seedId } : {}),
    ...(illustration ? { illustration } : {}),
    groups,
    selectedIndexes: selectedIndexes.sort((left, right) => left - right),
  };
}

async function resolveCard(content: Card, store: LibraryDb, now: string): Promise<CardRecord> {
  const identityKey = cardIdentity(content);
  const existing = await store.cards.where("identityKey").equals(identityKey).first();
  if (existing) {
    if (existing.lang !== existing.content.lang || existing.type !== existing.content.type
      || cardIdentity(existing.content) !== existing.identityKey) {
      throw new Error(`Stored card ${existing.id} violates its identity invariants.`);
    }
    return existing;
  }
  const record: CardRecord = {
    id: uuid(),
    identityKey,
    lang: content.lang,
    type: content.type,
    createdAt: now,
    content,
  };
  await store.cards.add(record);
  return record;
}

async function ensureMembership(
  deckId: string,
  cardId: string,
  position: number,
  now: string,
  store: LibraryDb,
): Promise<Membership> {
  const existing = await store.memberships.get([deckId, cardId]);
  if (existing) return existing;
  const membership: Membership = {
    deckId,
    cardId,
    createdAt: now,
    position,
    starredAt: null,
  };
  await store.memberships.add(membership);
  return membership;
}

async function addProvenance(
  cardId: string,
  deckId: string,
  source: Evidence,
  now: string,
  store: LibraryDb,
): Promise<void> {
  const sourceKey = evidenceIdentity(source);
  const existing = await store.provenance
    .where("[cardId+deckId+sourceKey]")
    .equals([cardId, deckId, sourceKey])
    .first();
  if (existing) return;
  await store.provenance.add({
    id: uuid(),
    cardId,
    deckId,
    sourceKey,
    source,
    createdAt: now,
  });
}

interface PreparedDraftPhrase {
  draft: PhrasebookDraftEssential | PhrasebookDraftDialogueLine;
  occurrenceId: string;
  section: "essentials" | "dialogue";
  position: number;
}

interface PreparedDraftGroup {
  draft: PhrasebookDraftGroup;
  groupId: string;
  phrases: PreparedDraftPhrase[];
}

interface ResolvedDraftRef {
  occurrenceId: string;
  cardId: string;
}

function remapDraftEvidence(
  source: Evidence,
  refs: ReadonlyMap<string, ResolvedDraftRef>,
): Evidence {
  const draftOccurrenceId = source.ref?.occurrenceId;
  if (!draftOccurrenceId) return source;
  const resolved = refs.get(draftOccurrenceId);
  if (!resolved) throw new Error(`Source refers to unselected draft occurrence ${draftOccurrenceId}.`);
  return {
    ...source,
    ref: {
      cardId: resolved.cardId,
      occurrenceId: resolved.occurrenceId,
    },
  };
}

export async function commitPhrasebook(
  value: CommitPhrasebookInput,
  options: { signal?: AbortSignal; store?: LibraryDb } = {},
): Promise<Deck> {
  const input = structuredClone(validateCommitInput(value));
  const store = options.store ?? db;
  const signal = options.signal;
  assertAbort(signal);
  const selected = input.selectedIndexes.map((index) => input.groups[index]);
  const prepared: PreparedDraftGroup[] = selected.map((draft) => ({
    draft,
    groupId: uuid(),
    phrases: [
      ...draft.essentials.map((phrase, position): PreparedDraftPhrase =>
        ({ draft: phrase, occurrenceId: uuid(), section: "essentials", position })),
      ...draft.dialogue.map((phrase, position): PreparedDraftPhrase =>
        ({ draft: phrase, occurrenceId: uuid(), section: "dialogue", position })),
    ],
  }));
  const now = isoNow();
  const deck: Deck = {
    id: uuid(),
    name: input.name,
    lang: input.lang,
    createdAt: now,
    mode: "study",
    order: "default",
    readingDisplay: "reading",
    ...(input.generation ? { generation: input.generation } : {}),
    ...(input.ability ? { ability: input.ability } : {}),
    ...(input.seedId ? { seedId: input.seedId } : {}),
    ...(input.illustration ? { illustration: input.illustration } : {}),
  };

  let activeTransaction: Transaction | undefined;
  const abortTransaction = (): void => activeTransaction?.abort();
  signal?.addEventListener("abort", abortTransaction, { once: true });
  try {
    await store.transaction(
      "rw",
      [
        store.cards,
        store.decks,
        store.groups,
        store.memberships,
        store.occurrences,
        store.provenance,
        store.topicWords,
      ],
      async () => {
        activeTransaction = Dexie.currentTransaction ?? undefined;
        assertAbort(signal);
        await store.decks.add(deck);
        const draftRefs = new Map<string, ResolvedDraftRef>();
        let groupPosition = 0;
        let phraseMembershipPosition = 0;
        const phraseMemberships = new Set<string>();

        for (const group of prepared) {
          await store.groups.add({
            id: group.groupId,
            deckId: deck.id,
            title: group.draft.title,
            position: groupPosition++,
          });
          for (const phrase of group.phrases) {
            const card = await resolveCard(phrase.draft.card, store, now);
            if (!phraseMemberships.has(card.id)) {
              await ensureMembership(
                deck.id,
                card.id,
                phraseMembershipPosition,
                now,
                store,
              );
              phraseMembershipPosition += 1;
              phraseMemberships.add(card.id);
            }
            await store.occurrences.add({
              id: phrase.occurrenceId,
              deckId: deck.id,
              groupId: group.groupId,
              section: phrase.section,
              cardId: card.id,
              position: phrase.position,
              translation: phrase.draft.card.translation,
              ...("speaker" in phrase.draft ? { speaker: phrase.draft.speaker } : {}),
              ...("alternative" in phrase.draft && phrase.draft.alternative ? { alternative: true } : {}),
            });
            draftRefs.set(phrase.draft.id, {
              occurrenceId: phrase.occurrenceId,
              cardId: card.id,
            });
          }
        }

        let wordPosition = 0;
        const wordMemberships = new Set<string>();
        for (const group of prepared) {
          for (const [position, word] of group.draft.vocab.entries()) {
            const card = await resolveCard(word.card, store, now);
            if (!wordMemberships.has(card.id)) {
              await ensureMembership(deck.id, card.id, wordPosition++, now, store);
              wordMemberships.add(card.id);
            }
            await store.topicWords.add({
              id: uuid(), deckId: deck.id, groupId: group.groupId, cardId: card.id, position,
            });
            for (const source of word.sources ?? []) {
              await addProvenance(card.id, deck.id, remapDraftEvidence(source, draftRefs), now, store);
            }
          }
        }
        assertAbort(signal);
      },
    );
    return deck;
  } catch (error) {
    assertAbort(signal);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortTransaction);
  }
}

export async function getSeededDeckIds(store: LibraryDb = db): Promise<Set<string>> {
  const decks = await store.decks.filter((deck) => deck.seedId !== undefined).toArray();
  return new Set(decks.flatMap((deck) => deck.seedId ? [deck.seedId] : []));
}

async function updateExistingDeck(
  deckId: string,
  changes: Partial<Deck>,
  store: LibraryDb,
): Promise<void> {
  const updated = await store.decks.update(deckId, changes);
  if (updated === 0) throw new Error(`Deck ${deckId} does not exist.`);
}

export async function updateDeckMode(
  deckId: string,
  mode: DeckMode,
  store: LibraryDb = db,
): Promise<void> {
  enumValue(mode, MODES, "mode");
  await updateExistingDeck(deckId, { mode }, store);
}

export async function updateDeckOrder(
  deckId: string,
  order: DeckOrder,
  store: LibraryDb = db,
): Promise<void> {
  enumValue(order, ORDERS, "order");
  await updateExistingDeck(deckId, { order }, store);
}

export async function updateDeckName(
  deckId: string,
  name: string,
  store: LibraryDb = db,
): Promise<void> {
  await updateExistingDeck(deckId, { name: requiredString(name, "name", 500) }, store);
}

export async function updateDeckReadingDisplay(
  deckId: string,
  readingDisplay: ReadingDisplay,
  store: LibraryDb = db,
): Promise<void> {
  enumValue(readingDisplay, READING_DISPLAYS, "readingDisplay");
  await updateExistingDeck(deckId, { readingDisplay }, store);
}

export async function updateDeckAccessTime(
  deckId: string,
  store: LibraryDb = db,
): Promise<void> {
  await updateExistingDeck(deckId, { lastAccessedAt: isoNow() }, store);
}

export async function getRecentDecks(n: number, store: LibraryDb = db): Promise<Deck[]> {
  nonnegativeInteger(n, "n");
  const decks = await store.decks.toArray();
  return decks
    .sort((left, right) => {
      const leftTime = left.lastAccessedAt ?? left.createdAt;
      const rightTime = right.lastAccessedAt ?? right.createdAt;
      return rightTime.localeCompare(leftTime);
    })
    .slice(0, n);
}

export async function getDecks(lang: Lang | null = null, store: LibraryDb = db): Promise<Deck[]> {
  return lang
    ? store.decks.where("lang").equals(lang).toArray()
    : store.decks.toArray();
}

export async function getGroups(deckId: string, store: LibraryDb = db): Promise<Group[]> {
  const groups = await store.groups.where("deckId").equals(deckId).toArray();
  return groups.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

function provenanceOrder(deckId: string, left: Provenance, right: Provenance): number {
  const leftCurrent = left.deckId === deckId ? 0 : 1;
  const rightCurrent = right.deckId === deckId ? 0 : 1;
  return leftCurrent - rightCurrent
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id);
}

async function getProvenanceByCard(
  cardIds: string[],
  store: LibraryDb,
): Promise<Map<string, Provenance[]>> {
  const provenance = cardIds.length === 0
    ? []
    : await store.provenance.where("cardId").anyOf(cardIds).toArray();
  const sourcesByCard = new Map<string, Provenance[]>();
  for (const source of provenance) {
    const values = sourcesByCard.get(source.cardId) ?? [];
    values.push(source);
    sourcesByCard.set(source.cardId, values);
  }
  return sourcesByCard;
}

export async function getCards(deckId: string, store: LibraryDb = db): Promise<LibraryEntry[]> {
  const [memberships, occurrences, groups, topicWords] = await Promise.all([
    store.memberships.where("deckId").equals(deckId).toArray(),
    store.occurrences.where("deckId").equals(deckId).toArray(),
    store.groups.where("deckId").equals(deckId).toArray(),
    store.topicWords.where("deckId").equals(deckId).toArray(),
  ]);
  const cardIds = [...new Set(memberships.map((membership) => membership.cardId))];
  const records = (await store.cards.bulkGet(cardIds))
    .filter((record): record is CardRecord => record !== undefined);
  const sourcesByCard = await getProvenanceByCard(cardIds, store);
  const membershipByCard = new Map(memberships.map((membership) => [membership.cardId, membership]));
  const cardById = new Map(records.map((record) => [record.id, record]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const phraseEntries = occurrences.flatMap((occurrence): LibraryEntry[] => {
    const membership = membershipByCard.get(occurrence.cardId);
    const record = cardById.get(occurrence.cardId);
    if (!membership || !record || record.content.type !== "phrase") return [];
    const card: Phrase = { ...record.content, translation: occurrence.translation };
    return [{
      key: occurrence.id,
      cardId: record.id,
      card,
      membership,
      occurrence,
      sources: [],
    }];
  });
  phraseEntries.sort((left, right) => {
    const leftOccurrence = left.occurrence;
    const rightOccurrence = right.occurrence;
    if (!leftOccurrence || !rightOccurrence) return 0;
    const leftGroupless = leftOccurrence.groupId === undefined;
    const rightGroupless = rightOccurrence.groupId === undefined;
    if (leftGroupless !== rightGroupless) return leftGroupless ? -1 : 1;
    if (leftGroupless) {
      return leftOccurrence.position - rightOccurrence.position
        || leftOccurrence.id.localeCompare(rightOccurrence.id);
    }
    const leftGroup = groupById.get(leftOccurrence.groupId ?? "");
    const rightGroup = groupById.get(rightOccurrence.groupId ?? "");
    return (leftGroup?.position ?? Number.MAX_SAFE_INTEGER)
      - (rightGroup?.position ?? Number.MAX_SAFE_INTEGER)
      || (leftOccurrence.section === rightOccurrence.section ? 0
        : leftOccurrence.section === "essentials" ? -1 : 1)
      || leftOccurrence.position - rightOccurrence.position
      || leftOccurrence.id.localeCompare(rightOccurrence.id);
  });
  const placedWordIds = new Set(topicWords.map((placement) => placement.cardId));
  const wordEntries = topicWords.flatMap((wordPlacement): LibraryEntry[] => {
    const membership = membershipByCard.get(wordPlacement.cardId);
    const record = cardById.get(wordPlacement.cardId);
    if (!membership || record?.content.type !== "word") return [];
    return [{
      key: wordPlacement.id,
      cardId: record.id,
      card: record.content,
      membership,
      wordPlacement,
      sources: (sourcesByCard.get(record.id) ?? [])
        .sort((left, right) => provenanceOrder(deckId, left, right)).map((row) => row.source),
    }];
  }).sort((left, right) =>
    (groupById.get(left.wordPlacement!.groupId)?.position ?? 0)
      - (groupById.get(right.wordPlacement!.groupId)?.position ?? 0)
      || left.wordPlacement!.position - right.wordPlacement!.position);

  const nonPhraseEntries = memberships.flatMap((membership): LibraryEntry[] => {
    const record = cardById.get(membership.cardId);
    if (!record || record.content.type === "phrase" || placedWordIds.has(record.id)) return [];
    const sources = (sourcesByCard.get(record.id) ?? [])
      .sort((left, right) => provenanceOrder(deckId, left, right))
      .map((row) => row.source);
    return [{
      key: JSON.stringify([deckId, record.id]),
      cardId: record.id,
      card: record.content,
      membership,
      sources,
    }];
  });
  const chunks = nonPhraseEntries
    .filter((entry) => entry.card.type === "chunk")
    .sort((left, right) => (left.membership?.position ?? 0) - (right.membership?.position ?? 0));
  const words = nonPhraseEntries
    .filter((entry) => entry.card.type === "word")
    .sort((left, right) => (left.membership?.position ?? 0) - (right.membership?.position ?? 0));
  return [...phraseEntries, ...wordEntries, ...chunks, ...words];
}

export async function getCardsByLang(lang: Lang, store: LibraryDb = db): Promise<LibraryEntry[]> {
  const records = await store.cards.where("lang").equals(lang).toArray();
  const cardIds = records.map((record) => record.id);
  const sourcesByCard = await getProvenanceByCard(cardIds, store);
  return records
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .map((record) => ({
      key: record.id,
      cardId: record.id,
      card: record.content,
      sources: (sourcesByCard.get(record.id) ?? [])
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
        .map((source) => source.source),
    }));
}

export async function getReviewCards(
  deckId: string,
  store: LibraryDb = db,
): Promise<LibraryEntry[]> {
  const entries = await getCards(deckId, store);
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.membership?.starredAt) return false;
    if (seen.has(entry.cardId)) return false;
    seen.add(entry.cardId);
    return true;
  });
}

export function applyCardOrder<T>(entries: readonly T[], order: DeckOrder): T[] {
  const ordered = [...entries];
  if (order === "reverse") return ordered.reverse();
  if (order === "random") {
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const replacement = Math.floor(Math.random() * (index + 1));
      [ordered[index], ordered[replacement]] = [ordered[replacement], ordered[index]];
    }
  }
  return ordered;
}

function candidatesValue(value: unknown): Candidate[] {
  if (!Array.isArray(value)) throw new Error("candidates must be an array");
  return value.map((candidate, index) => validateCandidate(candidate, `candidates[${index}]`));
}

async function nextMembershipPosition(
  deckId: string,
  type: Card["type"],
  store: LibraryDb,
): Promise<number> {
  const [memberships, cards] = await Promise.all([
    store.memberships.where("deckId").equals(deckId).toArray(),
    store.cards.toArray(),
  ]);
  const typeByCardId = new Map(cards.map((card) => [card.id, card.type]));
  return memberships
    .filter((membership) => typeByCardId.get(membership.cardId) === type)
    .reduce((maximum, membership) => Math.max(maximum, membership.position + 1), 0);
}

export async function importCards(
  value: Candidate[],
  deckId: string | null = null,
  store: LibraryDb = db,
): Promise<void> {
  const candidates = structuredClone(candidatesValue(value));
  const now = isoNow();
  await store.transaction(
    "rw",
    [store.cards, store.decks, store.memberships, store.occurrences, store.provenance],
    async () => {
      const deck = deckId ? await store.decks.get(deckId) : undefined;
      if (deckId && !deck) throw new Error(`Deck ${deckId} does not exist.`);
      if (deck) {
        for (const [index, candidate] of candidates.entries()) {
          if (candidate.card.lang !== deck.lang) {
            throw new Error(`candidates[${index}].card.lang must equal deck lang`);
          }
        }
      }
      const membershipPositions: Record<Card["type"], number> = {
        word: deckId ? await nextMembershipPosition(deckId, "word", store) : 0,
        phrase: deckId ? await nextMembershipPosition(deckId, "phrase", store) : 0,
        chunk: deckId ? await nextMembershipPosition(deckId, "chunk", store) : 0,
      };
      const phraseCount = deckId
        ? candidates.filter((candidate) => candidate.card.type === "phrase").length
        : 0;
      if (deckId && phraseCount > 0) {
        const existing = await store.occurrences
          .where("deckId")
          .equals(deckId)
          .filter((occurrence) => occurrence.groupId === undefined)
          .toArray();
        await Promise.all(existing.map((occurrence) =>
          store.occurrences.update(occurrence.id, { position: occurrence.position + phraseCount })));
      }
      let phrasePosition = 0;
      for (const candidate of candidates) {
        const record = await resolveCard(candidate.card, store, now);
        if (deckId) {
          const existingMembership = await store.memberships.get([deckId, record.id]);
          if (!existingMembership) {
            await ensureMembership(
              deckId,
              record.id,
              membershipPositions[record.type],
              now,
              store,
            );
            membershipPositions[record.type] += 1;
          }
          if (candidate.card.type === "phrase") {
            await store.occurrences.add({
              id: uuid(),
              deckId,
              cardId: record.id,
              position: phrasePosition,
              translation: candidate.card.translation,
            });
            phrasePosition += 1;
          }
        }
        if (candidate.card.type === "word") {
          for (const source of candidate.sources ?? []) {
            await addProvenance(record.id, deckId ?? "", source, now, store);
          }
        }
      }
    },
  );
}

interface CardIdTarget {
  cardId: string;
}

function isCardIdTarget(value: CardIdTarget | Candidate): value is CardIdTarget {
  return "cardId" in value;
}

export async function toggleCardStar(
  deckId: string,
  target: CardIdTarget | Candidate,
  store: LibraryDb = db,
): Promise<{ cardId: string; starredAt: string | null }> {
  let candidate: Candidate | undefined;
  let requestedCardId: string | undefined;
  if (isCardIdTarget(target)) {
    const fields = objectValue(target, "target");
    assertExactFields(fields, ["cardId"], "target");
    requestedCardId = requiredString(target.cardId, "target.cardId");
  } else {
    candidate = structuredClone(validateCandidate(target, "target"));
  }
  const now = isoNow();
  return store.transaction(
    "rw",
    [store.cards, store.decks, store.memberships, store.occurrences, store.provenance],
    async () => {
      const deck = await store.decks.get(deckId);
      if (!deck) throw new Error(`Deck ${deckId} does not exist.`);
      if (candidate && candidate.card.lang !== deck.lang) {
        throw new Error("target.card.lang must equal deck lang");
      }
      const record = candidate
        ? await resolveCard(candidate.card, store, now)
        : await store.cards.get(requestedCardId ?? "");
      if (!record) throw new Error(`Card ${requestedCardId ?? ""} does not exist.`);
      if (record.lang !== deck.lang) throw new Error("Card language must equal deck language.");
      const existingMembership = await store.memberships.get([deckId, record.id]);
      let membership = existingMembership;
      if (!membership) {
        membership = await ensureMembership(
          deckId,
          record.id,
          await nextMembershipPosition(deckId, record.type, store),
          now,
          store,
        );
      }
      if (candidate?.card.type === "word") {
        for (const source of candidate.sources ?? []) {
          await addProvenance(record.id, deckId, source, now, store);
        }
      }
      if (record.content.type === "phrase") {
        const occurrence = await store.occurrences
          .where("deckId")
          .equals(deckId)
          .filter((row) => row.cardId === record.id)
          .first();
        if (!occurrence) {
          const groupless = await store.occurrences
            .where("deckId")
            .equals(deckId)
            .filter((row) => row.groupId === undefined)
            .toArray();
          await Promise.all(groupless.map((row) =>
            store.occurrences.update(row.id, { position: row.position + 1 })));
          await store.occurrences.add({
            id: uuid(),
            deckId,
            cardId: record.id,
            position: 0,
            translation: candidate?.card.translation ?? record.content.translation,
          });
        }
      }
      const starredAt = membership.starredAt ? null : now;
      await store.memberships.update([deckId, record.id], { starredAt });
      return { cardId: record.id, starredAt };
    },
  );
}

function entryBucket(entry: LibraryEntry): string {
  if (entry.occurrence) return `phrase:${entry.occurrence.groupId ?? ""}:${entry.occurrence.section ?? ""}`;
  if (entry.wordPlacement) return `word:${entry.wordPlacement.groupId}`;
  return entry.card.type;
}

async function normalizeDeckPositions(deckId: string, store: LibraryDb): Promise<void> {
  const occurrences = await store.occurrences.where("deckId").equals(deckId).sortBy("position");
  const occurrenceBuckets = new Map<string, Occurrence[]>();
  for (const row of occurrences) {
    const bucket = `${row.groupId ?? ""}:${row.section ?? ""}`;
    const rows = occurrenceBuckets.get(bucket) ?? [];
    rows.push(row);
    occurrenceBuckets.set(bucket, rows);
  }
  for (const rows of occurrenceBuckets.values()) {
    for (const [position, row] of rows.entries()) {
      row.position = position;
      if (row.section === "dialogue" && position > 0 && rows[position - 1].speaker === row.speaker) {
        row.alternative = true;
      } else {
        delete row.alternative;
      }
      await store.occurrences.put(row);
    }
  }
  const words = await store.topicWords.where("deckId").equals(deckId).sortBy("position");
  const wordPositions = new Map<string, number>();
  for (const row of words) {
    const position = wordPositions.get(row.groupId) ?? 0;
    await store.topicWords.update(row.id, { position });
    wordPositions.set(row.groupId, position + 1);
  }
  const memberships = await store.memberships.where("deckId").equals(deckId).sortBy("position");
  const records = await store.cards.bulkGet(memberships.map((row) => row.cardId));
  const positions: Record<Card["type"], number> = { phrase: 0, word: 0, chunk: 0 };
  for (const [index, row] of memberships.entries()) {
    const record = records[index];
    if (record) await store.memberships.update([deckId, row.cardId], { position: positions[record.type]++ });
  }
}

export async function updateDeckEntryOrder(
  deckId: string,
  entryKeys: readonly string[],
  store: LibraryDb = db,
): Promise<void> {
  if (new Set(entryKeys).size !== entryKeys.length) {
    throw new Error("entryKeys must not contain duplicates.");
  }
  await store.transaction(
    "rw",
    [
      store.cards,
      store.decks,
      store.groups,
      store.memberships,
      store.occurrences,
      store.provenance,
      store.topicWords,
    ],
    async () => {
      if (!await store.decks.get(deckId)) throw new Error(`Deck ${deckId} does not exist.`);
      const entries = await getCards(deckId, store);
      const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
      if (entryKeys.length !== entries.length
        || entryKeys.some((key) => !entryByKey.has(key))) {
        throw new Error("entryKeys must contain every current entry exactly once.");
      }
      const ordered = entryKeys.map((key) => entryByKey.get(key)!);
      if (ordered.some((entry, index) => entryBucket(entry) !== entryBucket(entries[index]))) {
        throw new Error("Entries may only be reordered within their topic and section.");
      }
      const bucketPositions = new Map<string, number>();
      const membershipPositions: Record<Card["type"], number> = { phrase: 0, word: 0, chunk: 0 };
      const seenMemberships = new Set<string>();
      for (const entry of ordered) {
        const bucket = entryBucket(entry);
        const position = bucketPositions.get(bucket) ?? 0;
        if (entry.occurrence) {
          await store.occurrences.update(entry.occurrence.id, { position });
        } else if (entry.wordPlacement) {
          await store.topicWords.update(entry.wordPlacement.id, { position });
        }
        bucketPositions.set(bucket, position + 1);
        if (entry.membership && !seenMemberships.has(entry.cardId)) {
          await store.memberships.update([deckId, entry.cardId], { position: membershipPositions[entry.card.type]++ });
          seenMemberships.add(entry.cardId);
        }
      }
      await normalizeDeckPositions(deckId, store);
    },
  );
}

export async function getLangs(store: LibraryDb = db): Promise<Lang[]> {
  const cards = await store.cards.toArray();
  return [...new Set(cards.map((card) => card.lang))].sort();
}

export async function updateCard(
  cardId: string,
  fieldsValue: Record<string, unknown>,
  options: { occurrenceId?: string; store?: LibraryDb } = {},
): Promise<void> {
  const store = options.store ?? db;
  const fields = objectValue(fieldsValue, "fields");
  await store.transaction("rw", store.cards, store.occurrences, async () => {
    const record = await store.cards.get(cardId);
    if (!record) throw new Error(`Card ${cardId} does not exist.`);
    const commonEditable = ["translation", "definition", "formality", "notes", "example"];
    const editable = record.content.type === "chunk"
      ? [...commonEditable, "role", "explanation"]
      : [...commonEditable, "text", "reading", "romanization"];
    assertExactFields(fields, editable, "fields");
    const updatedValue: Record<string, unknown> = { ...record.content };
    const occurrence = options.occurrenceId ? await store.occurrences.get(options.occurrenceId) : undefined;
    if (options.occurrenceId) {
      if (record.type !== "phrase" || !occurrence || occurrence.cardId !== cardId) {
        throw new Error(`Occurrence ${options.occurrenceId} does not belong to this Phrase.`);
      }
      updatedValue.translation = occurrence.translation;
    }
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined) delete updatedValue[field];
      else updatedValue[field] = value;
    }
    const content = validateCard(updatedValue, "card");
    if (content.type !== record.type || content.lang !== record.lang) {
      throw new Error("Card type and language cannot be changed.");
    }
    if (content.type === "word" && record.content.type === "word"
      && (content.partOfSpeech !== record.content.partOfSpeech
        || content.senseKey !== record.content.senseKey)) {
      throw new Error("Word part of speech and sense key cannot be changed.");
    }
    const identityKey = cardIdentity(content);
    if (identityKey !== record.identityKey) {
      const collision = await store.cards.where("identityKey").equals(identityKey).first();
      if (collision && collision.id !== cardId) {
        throw new Error("A card with this identity already exists.");
      }
    }
    if (occurrence) {
      await store.occurrences.update(occurrence.id, { translation: content.translation });
      content.translation = record.content.translation;
    }
    await store.cards.update(cardId, { identityKey, content });
  });
}

export async function removeCardFromDeck(
  cardId: string,
  deckId: string,
  store: LibraryDb = db,
): Promise<void> {
  await store.transaction("rw", [store.cards, store.memberships, store.occurrences, store.topicWords], async () => {
    await store.memberships.delete([deckId, cardId]);
    await store.occurrences.where("deckId").equals(deckId).filter((row) => row.cardId === cardId).delete();
    await store.topicWords.where("deckId").equals(deckId).filter((row) => row.cardId === cardId).delete();
    await normalizeDeckPositions(deckId, store);
  });
}

export async function deleteCard(cardId: string, store: LibraryDb = db): Promise<void> {
  await store.transaction(
    "rw",
    [store.cards, store.memberships, store.occurrences, store.provenance, store.topicWords],
    async () => {
      const deckIds = (await store.memberships.where("cardId").equals(cardId).toArray()).map((row) => row.deckId);
      await store.memberships.where("cardId").equals(cardId).delete();
      await store.occurrences.where("cardId").equals(cardId).delete();
      await store.topicWords.where("cardId").equals(cardId).delete();
      await store.provenance.where("cardId").equals(cardId).delete();
      await store.cards.delete(cardId);
      for (const deckId of deckIds) await normalizeDeckPositions(deckId, store);
    },
  );
}

export async function deleteDeck(deckId: string, store: LibraryDb = db): Promise<void> {
  await store.transaction(
    "rw",
    [store.decks, store.groups, store.memberships, store.occurrences, store.topicWords],
    async () => {
      await store.groups.where("deckId").equals(deckId).delete();
      await store.memberships.where("deckId").equals(deckId).delete();
      await store.occurrences.where("deckId").equals(deckId).delete();
      await store.topicWords.where("deckId").equals(deckId).delete();
      await store.decks.delete(deckId);
    },
  );
}

function validateDeck(value: unknown, path: string): Deck {
  const row = objectValue(value, path);
  assertExactFields(
    row,
    ["id", "name", "lang", "createdAt", "lastAccessedAt", "mode", "order", "readingDisplay", "generation", "ability", "seedId", "illustration"],
    path,
  );
  const deck: Deck = {
    id: uuidString(row.id, `${path}.id`),
    name: requiredString(row.name, `${path}.name`, 500),
    lang: enumValue(row.lang, CONTENT_LANGUAGES, `${path}.lang`),
    createdAt: isoTimestamp(row.createdAt, `${path}.createdAt`),
    mode: enumValue(row.mode, MODES, `${path}.mode`),
    order: enumValue(row.order, ORDERS, `${path}.order`),
    readingDisplay: enumValue(row.readingDisplay, READING_DISPLAYS, `${path}.readingDisplay`),
  };
  if (Object.hasOwn(row, "lastAccessedAt")) {
    deck.lastAccessedAt = isoTimestamp(row.lastAccessedAt, `${path}.lastAccessedAt`);
  }
  if (Object.hasOwn(row, "generation")) {
    deck.generation = validateGeneration(row.generation, `${path}.generation`);
  }
  if (Object.hasOwn(row, "ability")) {
    deck.ability = enumValue(row.ability, ABILITIES, `${path}.ability`);
  }
  if (Object.hasOwn(row, "seedId")) {
    deck.seedId = requiredString(row.seedId, `${path}.seedId`, 500);
  }
  if (Object.hasOwn(row, "illustration")) {
    deck.illustration = validateDeckIllustration(row.illustration, `${path}.illustration`);
  }
  return deck;
}

function validateCardRecord(value: unknown, path: string): CardRecord {
  const row = objectValue(value, path);
  assertExactFields(row, ["id", "identityKey", "lang", "type", "createdAt", "content"], path);
  const content = validateCard(row.content, `${path}.content`);
  const identityKey = requiredString(row.identityKey, `${path}.identityKey`);
  if (identityKey !== cardIdentity(content)) throw new Error(`${path}.identityKey is invalid`);
  const lang = enumValue(row.lang, CONTENT_LANGUAGES, `${path}.lang`);
  if (lang !== content.lang) throw new Error(`${path}.lang must equal content.lang`);
  const type = enumValue(row.type, ["word", "phrase", "chunk"], `${path}.type`);
  if (type !== content.type) throw new Error(`${path}.type must equal content.type`);
  return {
    id: uuidString(row.id, `${path}.id`),
    identityKey,
    lang,
    type,
    createdAt: isoTimestamp(row.createdAt, `${path}.createdAt`),
    content,
  };
}

function validateGroup(value: unknown, path: string): Group {
  const row = objectValue(value, path);
  assertExactFields(row, ["id", "deckId", "title", "position"], path);
  return {
    id: uuidString(row.id, `${path}.id`),
    deckId: uuidString(row.deckId, `${path}.deckId`),
    title: requiredString(row.title, `${path}.title`, 500),
    position: nonnegativeInteger(row.position, `${path}.position`),
  };
}

function validateMembership(value: unknown, path: string): Membership {
  const row = objectValue(value, path);
  assertExactFields(row, ["deckId", "cardId", "createdAt", "position", "starredAt"], path);
  if (row.starredAt !== null && typeof row.starredAt !== "string") {
    throw new Error(`${path}.starredAt must be an ISO timestamp or null`);
  }
  return {
    deckId: uuidString(row.deckId, `${path}.deckId`),
    cardId: uuidString(row.cardId, `${path}.cardId`),
    createdAt: isoTimestamp(row.createdAt, `${path}.createdAt`),
    position: nonnegativeInteger(row.position, `${path}.position`),
    starredAt: row.starredAt === null ? null : isoTimestamp(row.starredAt, `${path}.starredAt`),
  };
}

function validateOccurrence(value: unknown, path: string): Occurrence {
  const row = objectValue(value, path);
  assertExactFields(
    row,
    ["id", "deckId", "groupId", "section", "cardId", "position", "translation", "speaker", "alternative"],
    path,
  );
  const occurrence: Occurrence = {
    id: uuidString(row.id, `${path}.id`),
    deckId: uuidString(row.deckId, `${path}.deckId`),
    cardId: uuidString(row.cardId, `${path}.cardId`),
    position: nonnegativeInteger(row.position, `${path}.position`),
    translation: requiredString(row.translation, `${path}.translation`),
  };
  if (Object.hasOwn(row, "groupId")) {
    occurrence.groupId = uuidString(row.groupId, `${path}.groupId`);
    occurrence.section = enumValue(row.section, ["essentials", "dialogue"], `${path}.section`);
  }
  if (Object.hasOwn(row, "speaker")) {
    occurrence.speaker = enumValue(row.speaker, ["you", "partner"], `${path}.speaker`);
  }
  if (Object.hasOwn(row, "alternative")) {
    occurrence.alternative = optionalTrue(row.alternative, `${path}.alternative`);
  }
  if (!occurrence.groupId && Object.hasOwn(row, "section")) {
    throw new Error(`${path}.section requires a group`);
  }
  if (occurrence.section === "dialogue") {
    if (!occurrence.speaker) throw new Error(`${path}.speaker is required for dialogue`);
  } else if (occurrence.speaker || occurrence.alternative) {
    throw new Error(`${path} may have speaker/alternative only in dialogue`);
  }
  return occurrence;
}

function validateTopicWord(value: unknown, path: string): TopicWordPlacement {
  const row = objectValue(value, path);
  assertExactFields(row, ["id", "deckId", "groupId", "cardId", "position"], path);
  return {
    id: uuidString(row.id, `${path}.id`),
    deckId: uuidString(row.deckId, `${path}.deckId`),
    groupId: uuidString(row.groupId, `${path}.groupId`),
    cardId: uuidString(row.cardId, `${path}.cardId`),
    position: nonnegativeInteger(row.position, `${path}.position`),
  };
}

function validateProvenance(value: unknown, path: string): Provenance {
  const row = objectValue(value, path);
  assertExactFields(row, ["id", "cardId", "deckId", "sourceKey", "source", "createdAt"], path);
  const source = validateEvidence(row.source, `${path}.source`);
  const sourceKey = requiredString(row.sourceKey, `${path}.sourceKey`);
  if (sourceKey !== evidenceIdentity(source)) throw new Error(`${path}.sourceKey is invalid`);
  const deckId = row.deckId === "" ? "" : uuidString(row.deckId, `${path}.deckId`);
  return {
    id: uuidString(row.id, `${path}.id`),
    cardId: uuidString(row.cardId, `${path}.cardId`),
    deckId,
    sourceKey,
    source,
    createdAt: isoTimestamp(row.createdAt, `${path}.createdAt`),
  };
}

function assertUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${path} must be unique`);
}

function assertContiguousPositions(
  rows: readonly { position: number }[],
  path: string,
): void {
  const positions = rows.map((row) => row.position).sort((left, right) => left - right);
  if (positions.some((position, index) => position !== index)) {
    throw new Error(`${path} positions must be unique and contiguous from zero`);
  }
}

function validateBackupGraph(backup: LibraryBackup): void {
  assertUnique(backup.cards.map((row) => row.id), "backup.cards ids");
  assertUnique(backup.cards.map((row) => row.identityKey), "backup.cards identityKeys");
  assertUnique(backup.decks.map((row) => row.id), "backup.decks ids");
  assertUnique(backup.groups.map((row) => row.id), "backup.groups ids");
  assertUnique(backup.occurrences.map((row) => row.id), "backup.occurrences ids");
  assertUnique(backup.topicWords.map((row) => row.id), "backup.topicWords ids");
  assertUnique([...backup.occurrences, ...backup.topicWords].map((row) => row.id), "backup entry ids");
  assertUnique(backup.provenance.map((row) => row.id), "backup.provenance ids");
  assertUnique(
    backup.memberships.map((row) => JSON.stringify([row.deckId, row.cardId])),
    "backup.memberships keys",
  );
  assertUnique(
    backup.provenance.map((row) => JSON.stringify([row.cardId, row.deckId, row.sourceKey])),
    "backup.provenance source keys",
  );

  const decks = new Map(backup.decks.map((row) => [row.id, row]));
  const cards = new Map(backup.cards.map((row) => [row.id, row]));
  const groups = new Map(backup.groups.map((row) => [row.id, row]));
  const occurrences = new Map(backup.occurrences.map((row) => [row.id, row]));
  const memberships = new Map(
    backup.memberships.map((row) => [JSON.stringify([row.deckId, row.cardId]), row]),
  );

  for (const group of backup.groups) {
    if (!decks.has(group.deckId)) throw new Error(`Group ${group.id} refers to a missing deck.`);
  }
  for (const deck of backup.decks) {
    assertContiguousPositions(
      backup.groups.filter((group) => group.deckId === deck.id),
      `Groups in deck ${deck.id}`,
    );
  }
  for (const membership of backup.memberships) {
    const deck = decks.get(membership.deckId);
    const card = cards.get(membership.cardId);
    if (!deck || !card) throw new Error("Membership refers to a missing deck or card.");
    if (deck.lang !== card.lang) throw new Error("Membership card language must equal deck language.");
  }
  for (const occurrence of backup.occurrences) {
    const deck = decks.get(occurrence.deckId);
    const card = cards.get(occurrence.cardId);
    if (!deck || !card || card.type !== "phrase") {
      throw new Error(`Occurrence ${occurrence.id} must refer to a Phrase and an existing deck.`);
    }
    if (deck.lang !== card.lang) throw new Error("Occurrence card language must equal deck language.");
    if (!memberships.has(JSON.stringify([occurrence.deckId, occurrence.cardId]))) {
      throw new Error(`Occurrence ${occurrence.id} has no matching membership.`);
    }
    if (occurrence.groupId) {
      const group = groups.get(occurrence.groupId);
      if (!group || group.deckId !== occurrence.deckId) {
        throw new Error(`Occurrence ${occurrence.id} has an invalid group.`);
      }
    }
  }
  for (const placement of backup.topicWords) {
    const card = cards.get(placement.cardId);
    const group = groups.get(placement.groupId);
    if (card?.type !== "word" || !group || group.deckId !== placement.deckId
      || !memberships.has(JSON.stringify([placement.deckId, placement.cardId]))) {
      throw new Error(`Topic Word ${placement.id} requires a Word membership and an owned group.`);
    }
  }
  for (const membership of backup.memberships) {
    const card = cards.get(membership.cardId);
    if (card?.type === "phrase"
      && !backup.occurrences.some((row) =>
        row.deckId === membership.deckId && row.cardId === membership.cardId)) {
      throw new Error("Every Phrase membership must have an occurrence.");
    }
  }
  for (const deck of backup.decks) {
    const deckOccurrences = backup.occurrences.filter((row) => row.deckId === deck.id);
    assertContiguousPositions(
      deckOccurrences.filter((row) => row.groupId === undefined),
      `Group-less occurrences in deck ${deck.id}`,
    );
    for (const group of backup.groups.filter((row) => row.deckId === deck.id)) {
      for (const section of ["essentials", "dialogue"] as const) {
        const rows = deckOccurrences.filter((row) => row.groupId === group.id && row.section === section)
          .sort((left, right) => left.position - right.position);
        assertContiguousPositions(rows, `${section} in group ${group.id}`);
        if (section === "dialogue") {
          for (const [index, row] of rows.entries()) {
            if ((row.alternative === true) !== (index > 0 && rows[index - 1].speaker === row.speaker)) {
              throw new Error(`Dialogue alternatives in group ${group.id} must match adjacency.`);
            }
          }
        }
      }
      assertContiguousPositions(
        backup.topicWords.filter((row) => row.groupId === group.id),
        `Words in group ${group.id}`,
      );
    }
    for (const type of ["phrase", "word", "chunk"] as const) {
      assertContiguousPositions(
        backup.memberships.filter((membership) => cards.get(membership.cardId)?.type === type
          && membership.deckId === deck.id),
        `${type} memberships in deck ${deck.id}`,
      );
    }
  }
  const validateResolvedSourceRef = (
    source: Evidence,
    lang: Lang,
    path: string,
  ): void => {
    const ref = source.ref;
    if (!ref) return;
    const referencedCard = ref.cardId ? cards.get(ref.cardId) : undefined;
    if (referencedCard && (referencedCard.type !== "phrase" || referencedCard.lang !== lang)) {
      throw new Error(`${path}.ref.cardId must resolve to a Phrase of the same language.`);
    }
    const referencedOccurrence = ref.occurrenceId ? occurrences.get(ref.occurrenceId) : undefined;
    if (!referencedOccurrence) return;
    const occurrenceCard = cards.get(referencedOccurrence.cardId);
    if (!occurrenceCard || occurrenceCard.type !== "phrase" || occurrenceCard.lang !== lang) {
      throw new Error(`${path}.ref.occurrenceId has the wrong language or type.`);
    }
    if (ref.cardId && ref.cardId !== referencedOccurrence.cardId) {
      throw new Error(`${path}.ref cardId and occurrenceId disagree.`);
    }
  };
  for (const card of backup.cards) {
    if (card.content.type === "chunk") {
      validateResolvedSourceRef(card.content.source, card.lang, `Card ${card.id}.content.source`);
    }
  }
  for (const row of backup.provenance) {
    const target = cards.get(row.cardId);
    if (!target || target.type !== "word") {
      throw new Error(`Provenance ${row.id} must refer to a Word.`);
    }
    if (row.source.snapshot.lang !== target.lang) {
      throw new Error(`Provenance ${row.id} language must equal its Word language.`);
    }
    validateResolvedSourceRef(row.source, target.lang, `Provenance ${row.id}.source`);
  }
}

function validateLibraryBackup(value: unknown): LibraryBackup {
  const data = objectValue(value, "backup");
  assertExactFields(
    data,
    ["schemaVersion", "cards", "decks", "groups", "memberships", "occurrences", "topicWords", "provenance"],
    "backup",
  );
  if (data.schemaVersion !== LIBRARY_SCHEMA_VERSION) {
    throw new Error("Unsupported library schema version; expected 3.");
  }
  const collection = <T>(
    raw: unknown,
    path: string,
    validator: (item: unknown, itemPath: string) => T,
  ): T[] => {
    if (!Array.isArray(raw)) throw new Error(`${path} must be an array`);
    return raw.map((item, index) => validator(item, `${path}[${index}]`));
  };
  const backup: LibraryBackup = {
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    cards: collection(data.cards, "backup.cards", validateCardRecord),
    decks: collection(data.decks, "backup.decks", validateDeck),
    groups: collection(data.groups, "backup.groups", validateGroup),
    memberships: collection(data.memberships, "backup.memberships", validateMembership),
    occurrences: collection(data.occurrences, "backup.occurrences", validateOccurrence),
    topicWords: collection(data.topicWords, "backup.topicWords", validateTopicWord),
    provenance: collection(data.provenance, "backup.provenance", validateProvenance),
  };
  validateBackupGraph(backup);
  return backup;
}

export async function exportAllData(store: LibraryDb = db): Promise<LibraryBackup> {
  return store.transaction(
    "r",
    [
      store.cards,
      store.decks,
      store.groups,
      store.memberships,
      store.occurrences,
      store.provenance,
      store.topicWords,
    ],
    async () => ({
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      cards: await store.cards.toArray(),
      decks: await store.decks.toArray(),
      groups: await store.groups.toArray(),
      memberships: await store.memberships.toArray(),
      occurrences: await store.occurrences.toArray(),
      topicWords: await store.topicWords.toArray(),
      provenance: await store.provenance.toArray(),
    }),
  );
}

export async function restoreAllData(value: unknown, store: LibraryDb = db): Promise<void> {
  const backup = structuredClone(validateLibraryBackup(value));
  await store.transaction(
    "rw",
    [
      store.cards,
      store.decks,
      store.groups,
      store.memberships,
      store.occurrences,
      store.provenance,
      store.topicWords,
    ],
    async () => {
      await Promise.all([
        store.provenance.clear(),
        store.occurrences.clear(),
        store.topicWords.clear(),
        store.memberships.clear(),
        store.groups.clear(),
        store.cards.clear(),
        store.decks.clear(),
      ]);
      await store.decks.bulkAdd(backup.decks);
      await store.cards.bulkAdd(backup.cards);
      await store.groups.bulkAdd(backup.groups);
      await store.memberships.bulkAdd(backup.memberships);
      await store.occurrences.bulkAdd(backup.occurrences);
      await store.topicWords.bulkAdd(backup.topicWords);
      await store.provenance.bulkAdd(backup.provenance);
    },
  );
}
