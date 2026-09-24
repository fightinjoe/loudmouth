import Dexie, {
  type DexieOptions,
  type Table,
  type Transaction,
} from "dexie";
import {
  SCHEMA_VERSION,
  cardIdentity,
  evidenceIdentity,
  validateCandidate,
  validateCard,
  validateEvidence,
  type Candidate,
  type Card,
  type Evidence,
  type Lang,
  type Phrase,
} from "@catchphrase/card-schema";
import type {
  Ability,
  CardRecord,
  CommitPhrasebookInput,
  Deck,
  DeckMode,
  DeckOrder,
  Generation,
  Group,
  LibraryBackup,
  LibraryEntry,
  Membership,
  Occurrence,
  PhrasebookDraftGroup,
  PhrasebookDraftPhrase,
  Provenance,
  ReadingDisplay,
} from "./library-types";

const DATABASE_NAME = "loudmouth-card-v2";
const LEGACY_DATABASE_NAME = "loudmouth";
const LEGACY_LOCAL_STORAGE_PREFIX = "loudmouth.";
const LEGACY_SESSION_CACHE_PREFIX = "loudmouth.phrase-breakdown.";
const LANGS: readonly Lang[] = ["zh", "ja", "es", "cs"];
const ABILITIES: readonly Ability[] = ["none", "basics", "conversational"];
const MODES: readonly DeckMode[] = ["study", "review", "reverse"];
const ORDERS: readonly DeckOrder[] = ["default", "random", "reverse"];
const READING_DISPLAYS: readonly ReadingDisplay[] = ["reading", "romanization"];
const MAX_CONTENT_LENGTH = 2_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const STORAGE_RESET_BLOCKED_MESSAGE =
  "Close other Catchphrase tabs, then reload to finish the storage reset.";

interface ResettableIndexedDb {
  deleteDatabase(name: string): IDBOpenDBRequest;
}

export class LibraryDb extends Dexie {
  cards!: Table<CardRecord, string>;
  decks!: Table<Deck, string>;
  groups!: Table<Group, string>;
  memberships!: Table<Membership, [string, string]>;
  occurrences!: Table<Occurrence, string>;
  provenance!: Table<Provenance, string>;
  readonly resetFactory?: ResettableIndexedDb;

  constructor(options: DexieOptions = {}) {
    super(DATABASE_NAME, options);
    const factory = options.indexedDB;
    if (factory && "deleteDatabase" in factory
      && typeof factory.deleteDatabase === "function") {
      this.resetFactory = factory as DexieOptions["indexedDB"] & ResettableIndexedDb;
    } else if (typeof indexedDB !== "undefined") {
      this.resetFactory = indexedDB;
    }

    this.version(1).stores({
      cards: "id, &identityKey, lang, type, createdAt",
      decks: "id, lang, createdAt, lastAccessedAt",
      groups: "id, deckId, [deckId+position]",
      memberships: "[deckId+cardId], deckId, cardId, [deckId+position]",
      occurrences: "id, deckId, groupId, cardId, [groupId+position]",
      provenance: "id, cardId, deckId, &[cardId+deckId+sourceKey]",
    });
  }
}

export function createDb(options: DexieOptions = {}): LibraryDb {
  return new LibraryDb(options);
}

export const db = createDb();

function uuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

function cleanLegacyStorage(kind: "localStorage" | "sessionStorage", prefix: string): void {
  try {
    const storage = globalThis[kind];
    if (!storage) return;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Preference/cache cleanup is best effort when storage is unavailable.
  }
}

function deleteLegacyDatabase(factory: ResettableIndexedDb): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(LEGACY_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to reset legacy storage."));
    request.onblocked = () => reject(new Error(STORAGE_RESET_BLOCKED_MESSAGE));
  });
}

export async function initializeLibrary(store: LibraryDb = db): Promise<void> {
  cleanLegacyStorage(
    "localStorage",
    LEGACY_LOCAL_STORAGE_PREFIX,
  );
  cleanLegacyStorage(
    "sessionStorage",
    LEGACY_SESSION_CACHE_PREFIX,
  );
  if (!store.resetFactory) throw new Error("IndexedDB is unavailable.");
  await deleteLegacyDatabase(store.resetFactory);
  await store.open();
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

function validateDraftPhrase(
  value: unknown,
  path: string,
  lang: Lang,
  generated: boolean,
): PhrasebookDraftPhrase {
  const phrase = objectValue(value, path);
  assertExactFields(phrase, ["id", "card", "speaker", "alternative"], path);
  const id = requiredString(phrase.id, `${path}.id`);
  const card = validateCard(phrase.card, `${path}.card`);
  if (card.type !== "phrase") throw new Error(`${path}.card.type must be phrase`);
  if (card.lang !== lang) throw new Error(`${path}.card.lang must equal phrasebook lang`);
  let speaker: "you" | "partner" | undefined;
  if (Object.hasOwn(phrase, "speaker")) {
    speaker = enumValue(phrase.speaker, ["you", "partner"], `${path}.speaker`);
  } else if (generated) {
    throw new Error(`${path}.speaker is required for generated phrasebooks`);
  }
  const alternative = Object.hasOwn(phrase, "alternative")
    ? optionalTrue(phrase.alternative, `${path}.alternative`)
    : undefined;
  return {
    id,
    card,
    ...(speaker ? { speaker } : {}),
    ...(alternative ? { alternative } : {}),
  };
}

function validateDraftGroup(
  value: unknown,
  path: string,
  lang: Lang,
  generated: boolean,
): PhrasebookDraftGroup {
  const group = objectValue(value, path);
  assertExactFields(group, ["id", "title", "phrases", "vocab"], path);
  const id = requiredString(group.id, `${path}.id`);
  let title: string | undefined;
  if (Object.hasOwn(group, "title")) {
    title = requiredString(group.title, `${path}.title`, 500);
  } else if (generated) {
    throw new Error(`${path}.title is required for generated phrasebooks`);
  }
  if (!Array.isArray(group.phrases) || group.phrases.length === 0) {
    throw new Error(`${path}.phrases must be a nonempty array`);
  }
  if (!Array.isArray(group.vocab)) throw new Error(`${path}.vocab must be an array`);
  const phrases = group.phrases.map((phrase, index) =>
    validateDraftPhrase(phrase, `${path}.phrases[${index}]`, lang, generated));
  const phraseById = new Map<string, PhrasebookDraftPhrase>();
  for (const phrase of phrases) {
    if (phraseById.has(phrase.id)) {
      throw new Error(`${path}.phrases contains duplicate id ${phrase.id}`);
    }
    phraseById.set(phrase.id, phrase);
  }
  const vocab = group.vocab.map((candidate, index) => {
    const validated = validateCandidate(candidate, `${path}.vocab[${index}]`);
    if (validated.card.type !== "word") {
      throw new Error(`${path}.vocab[${index}].card.type must be word`);
    }
    if (validated.card.lang !== lang) {
      throw new Error(`${path}.vocab[${index}].card.lang must equal phrasebook lang`);
    }
    for (const [sourceIndex, source] of (validated.sources ?? []).entries()) {
      const draftOccurrenceId = source.ref?.occurrenceId;
      const draftPhrase = draftOccurrenceId ? phraseById.get(draftOccurrenceId) : undefined;
      if (source.ref && (!draftPhrase || Object.hasOwn(source.ref, "cardId"))) {
        throw new Error(
          `${path}.vocab[${index}].sources[${sourceIndex}].ref must contain only the occurrenceId of a phrase in its group`,
        );
      }
      if (draftPhrase) {
        const snapshot = source.snapshot;
        const card = draftPhrase.card;
        const sameReading = JSON.stringify(snapshot.reading) === JSON.stringify(card.reading);
        if (snapshot.lang !== card.lang || snapshot.text !== card.text
          || snapshot.translation !== card.translation
          || snapshot.romanization !== card.romanization || !sameReading) {
          throw new Error(
            `${path}.vocab[${index}].sources[${sourceIndex}].snapshot must exactly match its draft phrase`,
          );
        }
      }
    }
    return validated;
  });
  return {
    id,
    ...(title ? { title } : {}),
    phrases,
    vocab,
  };
}

function validateCommitInput(value: unknown): CommitPhrasebookInput {
  const input = objectValue(value, "input");
  assertExactFields(
    input,
    ["name", "lang", "generation", "ability", "seedId", "groups", "selectedIndexes"],
    "input",
  );
  const name = requiredString(input.name, "input.name", 500);
  const lang = enumValue(input.lang, LANGS, "input.lang");
  const generation = Object.hasOwn(input, "generation")
    ? validateGeneration(input.generation, "input.generation")
    : undefined;
  const ability = Object.hasOwn(input, "ability")
    ? enumValue(input.ability, ABILITIES, "input.ability")
    : undefined;
  const seedId = Object.hasOwn(input, "seedId")
    ? requiredString(input.seedId, "input.seedId", 500)
    : undefined;
  if (!Array.isArray(input.groups) || input.groups.length === 0) {
    throw new Error("input.groups must be a nonempty array");
  }
  const groups = input.groups.map((group, index) =>
    validateDraftGroup(group, `input.groups[${index}]`, lang, generation !== undefined));
  const groupIds = new Set<string>();
  const phraseIds = new Set<string>();
  for (const group of groups) {
    if (groupIds.has(group.id)) throw new Error(`input.groups contains duplicate id ${group.id}`);
    groupIds.add(group.id);
    for (const phrase of group.phrases) {
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
    groups,
    selectedIndexes,
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
  draft: PhrasebookDraftPhrase;
  occurrenceId: string;
}

interface PreparedDraftGroup {
  draft: PhrasebookDraftGroup;
  groupId?: string;
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
    ...(draft.title ? { groupId: uuid() } : {}),
    phrases: draft.phrases.map((phrase) => ({ draft: phrase, occurrenceId: uuid() })),
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
  };

  const pooledWords = new Map<string, { card: Card; sources: Evidence[] }>();
  for (const group of selected) {
    for (const candidate of group.vocab) {
      const identity = cardIdentity(candidate.card);
      const existing = pooledWords.get(identity);
      if (existing) existing.sources.push(...(candidate.sources ?? []));
      else pooledWords.set(identity, { card: candidate.card, sources: [...(candidate.sources ?? [])] });
    }
  }
  const wordLimit = input.generation
    ? Math.min(24, input.selectedIndexes.length * 5)
    : pooledWords.size;
  const words = [...pooledWords.values()].slice(0, wordLimit);

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
      ],
      async () => {
        activeTransaction = Dexie.currentTransaction ?? undefined;
        assertAbort(signal);
        await store.decks.add(deck);
        const draftRefs = new Map<string, ResolvedDraftRef>();
        let namedGroupPosition = 0;
        let grouplessPosition = 0;
        let phraseMembershipPosition = 0;
        const phraseMemberships = new Set<string>();

        for (const group of prepared) {
          if (group.groupId && group.draft.title) {
            await store.groups.add({
              id: group.groupId,
              deckId: deck.id,
              title: group.draft.title,
              position: namedGroupPosition,
            });
            namedGroupPosition += 1;
          }
          let groupPosition = 0;
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
            const position = group.groupId ? groupPosition : grouplessPosition;
            await store.occurrences.add({
              id: phrase.occurrenceId,
              deckId: deck.id,
              ...(group.groupId ? { groupId: group.groupId } : {}),
              cardId: card.id,
              position,
              translation: phrase.draft.card.translation,
              ...(phrase.draft.speaker ? { speaker: phrase.draft.speaker } : {}),
              ...(phrase.draft.alternative ? { alternative: true } : {}),
            });
            draftRefs.set(phrase.draft.id, {
              occurrenceId: phrase.occurrenceId,
              cardId: card.id,
            });
            groupPosition += 1;
            if (!group.groupId) grouplessPosition += 1;
          }
        }

        let wordPosition = 0;
        for (const word of words) {
          const card = await resolveCard(word.card, store, now);
          await ensureMembership(deck.id, card.id, wordPosition, now, store);
          for (const source of word.sources) {
            await addProvenance(
              card.id,
              deck.id,
              remapDraftEvidence(source, draftRefs),
              now,
              store,
            );
          }
          wordPosition += 1;
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


export async function getCards(deckId: string, store: LibraryDb = db): Promise<LibraryEntry[]> {
  const [memberships, occurrences, groups] = await Promise.all([
    store.memberships.where("deckId").equals(deckId).toArray(),
    store.occurrences.where("deckId").equals(deckId).toArray(),
    store.groups.where("deckId").equals(deckId).toArray(),
  ]);
  const cardIds = [...new Set(memberships.map((membership) => membership.cardId))];
  const records = (await store.cards.bulkGet(cardIds))
    .filter((record): record is CardRecord => record !== undefined);
  const provenance = cardIds.length === 0
    ? []
    : await store.provenance.where("cardId").anyOf(cardIds).toArray();
  const membershipByCard = new Map(memberships.map((membership) => [membership.cardId, membership]));
  const cardById = new Map(records.map((record) => [record.id, record]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const sourcesByCard = new Map<string, Provenance[]>();
  for (const source of provenance) {
    const values = sourcesByCard.get(source.cardId) ?? [];
    values.push(source);
    sourcesByCard.set(source.cardId, values);
  }
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
      || leftOccurrence.position - rightOccurrence.position
      || leftOccurrence.id.localeCompare(rightOccurrence.id);
  });

  const nonPhraseEntries = memberships.flatMap((membership): LibraryEntry[] => {
    const record = cardById.get(membership.cardId);
    if (!record || record.content.type === "phrase") return [];
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
  return [...phraseEntries, ...chunks, ...words];
}

export async function getCardsByLang(lang: Lang, store: LibraryDb = db): Promise<LibraryEntry[]> {
  const records = await store.cards.where("lang").equals(lang).toArray();
  const cardIds = records.map((record) => record.id);
  const provenance = cardIds.length === 0
    ? []
    : await store.provenance.where("cardId").anyOf(cardIds).toArray();
  const sourcesByCard = new Map<string, Provenance[]>();
  for (const source of provenance) {
    const values = sourcesByCard.get(source.cardId) ?? [];
    values.push(source);
    sourcesByCard.set(source.cardId, values);
  }
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
  const seenPhrases = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.membership?.starredAt) return false;
    if (entry.card.type !== "phrase") return true;
    if (seenPhrases.has(entry.cardId)) return false;
    seenPhrases.add(entry.cardId);
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
    ],
    async () => {
      if (!await store.decks.get(deckId)) throw new Error(`Deck ${deckId} does not exist.`);
      const entries = await getCards(deckId, store);
      const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
      if (entryKeys.length !== entries.length
        || entryKeys.some((key) => !entryByKey.has(key))) {
        throw new Error("entryKeys must contain every current entry exactly once.");
      }
      const bucketPositions = new Map<string, number>();
      for (const key of entryKeys) {
        const entry = entryByKey.get(key);
        if (!entry) throw new Error(`Unknown entry key ${key}.`);
        if (entry.occurrence) {
          const bucket = `phrase:${entry.occurrence.groupId ?? ""}`;
          const position = bucketPositions.get(bucket) ?? 0;
          await store.occurrences.update(entry.occurrence.id, { position });
          bucketPositions.set(bucket, position + 1);
        } else if (entry.membership) {
          const bucket = entry.card.type;
          const position = bucketPositions.get(bucket) ?? 0;
          await store.memberships.update([deckId, entry.cardId], { position });
          bucketPositions.set(bucket, position + 1);
        }
      }
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
    if (options.occurrenceId) {
      if (content.type !== "phrase") {
        throw new Error("occurrenceId is allowed only when editing a Phrase.");
      }
      const occurrence = await store.occurrences.get(options.occurrenceId);
      if (!occurrence || occurrence.cardId !== cardId) {
        throw new Error(`Occurrence ${options.occurrenceId} does not belong to this card.`);
      }
      await store.occurrences.update(occurrence.id, { translation: content.translation });
    }
    await store.cards.update(cardId, { identityKey, content });
  });
}

export async function removeCardFromDeck(
  cardId: string,
  deckId: string,
  store: LibraryDb = db,
): Promise<void> {
  await store.transaction("rw", store.memberships, store.occurrences, async () => {
    await store.memberships.delete([deckId, cardId]);
    const occurrences = await store.occurrences
      .where("deckId")
      .equals(deckId)
      .filter((occurrence) => occurrence.cardId === cardId)
      .primaryKeys();
    await store.occurrences.bulkDelete(occurrences);
  });
}

export async function deleteCard(cardId: string, store: LibraryDb = db): Promise<void> {
  await store.transaction(
    "rw",
    store.cards,
    store.memberships,
    store.occurrences,
    store.provenance,
    async () => {
      await store.memberships.where("cardId").equals(cardId).delete();
      await store.occurrences.where("cardId").equals(cardId).delete();
      await store.provenance.where("cardId").equals(cardId).delete();
      await store.cards.delete(cardId);
    },
  );
}

export async function deleteDeck(deckId: string, store: LibraryDb = db): Promise<void> {
  await store.transaction(
    "rw",
    store.decks,
    store.groups,
    store.memberships,
    store.occurrences,
    async () => {
      await store.groups.where("deckId").equals(deckId).delete();
      await store.memberships.where("deckId").equals(deckId).delete();
      await store.occurrences.where("deckId").equals(deckId).delete();
      await store.decks.delete(deckId);
    },
  );
}

function validateDeck(value: unknown, path: string): Deck {
  const row = objectValue(value, path);
  assertExactFields(
    row,
    ["id", "name", "lang", "createdAt", "lastAccessedAt", "mode", "order", "readingDisplay", "generation", "ability", "seedId"],
    path,
  );
  const deck: Deck = {
    id: uuidString(row.id, `${path}.id`),
    name: requiredString(row.name, `${path}.name`, 500),
    lang: enumValue(row.lang, LANGS, `${path}.lang`),
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
  return deck;
}

function validateCardRecord(value: unknown, path: string): CardRecord {
  const row = objectValue(value, path);
  assertExactFields(row, ["id", "identityKey", "lang", "type", "createdAt", "content"], path);
  const content = validateCard(row.content, `${path}.content`);
  const identityKey = requiredString(row.identityKey, `${path}.identityKey`);
  if (identityKey !== cardIdentity(content)) throw new Error(`${path}.identityKey is invalid`);
  const lang = enumValue(row.lang, LANGS, `${path}.lang`);
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
    ["id", "deckId", "groupId", "cardId", "position", "translation", "speaker", "alternative"],
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
  }
  if (Object.hasOwn(row, "speaker")) {
    occurrence.speaker = enumValue(row.speaker, ["you", "partner"], `${path}.speaker`);
  }
  if (Object.hasOwn(row, "alternative")) {
    occurrence.alternative = optionalTrue(row.alternative, `${path}.alternative`);
  }
  return occurrence;
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
      assertContiguousPositions(
        deckOccurrences.filter((row) => row.groupId === group.id),
        `Occurrences in group ${group.id}`,
      );
    }
    for (const type of ["word", "chunk"] as const) {
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
    ["schemaVersion", "cards", "decks", "groups", "memberships", "occurrences", "provenance"],
    "backup",
  );
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("Unsupported library schema version; expected 2.");
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
    schemaVersion: SCHEMA_VERSION,
    cards: collection(data.cards, "backup.cards", validateCardRecord),
    decks: collection(data.decks, "backup.decks", validateDeck),
    groups: collection(data.groups, "backup.groups", validateGroup),
    memberships: collection(data.memberships, "backup.memberships", validateMembership),
    occurrences: collection(data.occurrences, "backup.occurrences", validateOccurrence),
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
    ],
    async () => ({
      schemaVersion: SCHEMA_VERSION,
      cards: await store.cards.toArray(),
      decks: await store.decks.toArray(),
      groups: await store.groups.toArray(),
      memberships: await store.memberships.toArray(),
      occurrences: await store.occurrences.toArray(),
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
    ],
    async () => {
      await Promise.all([
        store.provenance.clear(),
        store.occurrences.clear(),
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
      await store.provenance.bulkAdd(backup.provenance);
    },
  );
}
