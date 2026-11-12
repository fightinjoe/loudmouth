import type { Group, LibraryEntry } from "./library-types";

/**
 * Phrasebook view model. Content is organized by category: each category
 * chapter gathers every topic's Words, Key phrases, Exchanges, or Conversation.
 * Unplaced collections and Starred follow the same chapter shape.
 */
export const STARRED_CHAPTER_KEY = "starred";

export type CategoryKey = "words" | "phrases" | "exchanges" | "conversation";
export type StarredTab = "words" | "phrases";

export const CATEGORIES: readonly { key: CategoryKey; title: string; glyph: string; unit: string }[] = [
  { key: "words", title: "Words", glyph: "Aa", unit: "group" },
  { key: "phrases", title: "Key phrases", glyph: "“", unit: "topic" },
  { key: "exchanges", title: "Exchanges", glyph: "⇆", unit: "exchange" },
  { key: "conversation", title: "Conversation", glyph: "…", unit: "topic" },
];

export const STARRED_TABS: readonly { key: StarredTab; label: string }[] = [
  { key: "words", label: "Words" },
  { key: "phrases", label: "Phrases" },
];

export interface TopicExchange { id: string; title: string; turns: LibraryEntry[][] }
export interface TopicWordFamily { id: string; title: string; entries: LibraryEntry[] }

/** One Group's content; topics are identified by Group ID, never their possibly duplicated titles. */
export interface Topic {
  groupId: string;
  title: string;
  thingsToSay: LibraryEntry[];
  likelyExchanges: TopicExchange[];
  words: TopicWordFamily[];
  exampleConversation: LibraryEntry[];
}

export interface CategoryChapter {
  kind: "category";
  key: `category:${CategoryKey}`;
  category: CategoryKey;
  title: string;
  topics: Topic[];
}

interface CollectionChapter {
  key: string;
  title: string;
  entries: LibraryEntry[];
}

export type DeckChapter = CategoryChapter
  | (CollectionChapter & { kind: "translations" })
  | (CollectionChapter & { kind: "words" })
  | (CollectionChapter & { kind: "chunks" })
  | (CollectionChapter & { kind: "starred" });

export type StarredChapter = Extract<DeckChapter, { kind: "starred" }>;
export type CollectionKindChapter = Extract<DeckChapter, { kind: "translations" | "words" | "chunks" }>;

export function categoryChapterKey(category: CategoryKey): CategoryChapter["key"] {
  return `category:${category}`;
}

/** Topics in stored Group order, each with its four sections. */
export function getTopics(entries: readonly LibraryEntry[] = [], groups: readonly Group[] = []): Topic[] {
  const phrases = entries.filter((entry) => entry.card.type === "phrase");
  return [...groups]
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((group) => ({
      groupId: group.id,
      title: group.title,
      thingsToSay: phrases.filter((entry) =>
        entry.occurrence?.groupId === group.id && entry.occurrence.section === "thingsToSay"),
      likelyExchanges: [...group.exchanges]
        .sort((left, right) => left.position - right.position)
        .map((exchange) => {
          const exchangeEntries = phrases.filter((entry) =>
            entry.occurrence?.groupId === group.id && entry.occurrence.exchangeId === exchange.id);
          const turnIndexes = [...new Set(exchangeEntries.map((entry) => entry.occurrence!.turnIndex!))]
            .sort((left, right) => left - right);
          return { id: exchange.id, title: exchange.title,
            turns: turnIndexes.map((turnIndex) =>
              exchangeEntries.filter((entry) => entry.occurrence!.turnIndex === turnIndex)) };
        }),
      words: [...group.wordFamilies]
        .sort((left, right) => left.position - right.position)
        .map((family) => ({ id: family.id, title: family.title,
          entries: entries.filter((entry) =>
            entry.wordPlacement?.groupId === group.id && entry.wordPlacement.familyId === family.id) })),
      exampleConversation: phrases.filter((entry) =>
        entry.occurrence?.groupId === group.id && entry.occurrence.section === "exampleConversation"),
    }));
}

/** Four category chapters (always), non-empty unplaced collections, then Starred. */
export function getDeckChapters(
  entries: readonly LibraryEntry[] = [],
  groups: readonly Group[] = [],
): DeckChapter[] {
  const topics = getTopics(entries, groups);
  const chapters: DeckChapter[] = CATEGORIES.map(({ key, title }) => ({
    kind: "category", key: categoryChapterKey(key), category: key, title, topics,
  }));
  const phrases = entries.filter((entry) => entry.card.type === "phrase");
  const supplemental = [
    { kind: "translations" as const, key: "translations", title: "Translations", entries: phrases.filter((entry) => entry.occurrence?.groupId === undefined) },
    { kind: "words" as const, key: "words", title: "Words", entries: entries.filter((entry) => entry.card.type === "word" && !entry.wordPlacement) },
    { kind: "chunks" as const, key: "chunks", title: "Chunks", entries: entries.filter((entry) => entry.card.type === "chunk") },
  ];
  chapters.push(...supplemental.filter((chapter) => chapter.entries.length > 0));
  const seenMemberships = new Map<string, Set<string>>();
  const starredEntries = entries.filter((entry) => {
    const membership = entry.membership;
    if (membership?.starredAt == null) return false;
    let seen = seenMemberships.get(membership.deckId);
    if (seen?.has(membership.cardId)) return false;
    if (!seen) { seen = new Set(); seenMemberships.set(membership.deckId, seen); }
    seen.add(membership.cardId);
    return true;
  });
  chapters.push({ kind: "starred", key: STARRED_CHAPTER_KEY, title: "Starred", entries: starredEntries });
  return chapters;
}

/**
 * How many landing cards a category has: word families and exchanges with
 * content, or topics with Key phrases or Conversation. Zero hides the category.
 */
export function categoryCount(chapter: CategoryChapter): number {
  const { category, topics } = chapter;
  if (category === "words") return topics.reduce((sum, topic) => sum + topic.words.filter((family) => family.entries.length).length, 0);
  if (category === "exchanges") return topics.reduce((sum, topic) => sum + topic.likelyExchanges.filter((exchange) => exchange.turns.length).length, 0);
  return topics.filter((topic) => (category === "phrases" ? topic.thingsToSay : topic.exampleConversation).length).length;
}

/** Returns the key while it still names a chapter. Categories and Starred stay valid when empty so an open sheet does not vanish mid-edit. */
export function normalizeChapterKey(entries: readonly LibraryEntry[], groups: readonly Group[], requestedKey: string | null): string | null {
  return getDeckChapters(entries, groups).find((chapter) => chapter.key === requestedKey)?.key ?? null;
}

/** The chapter that shows an entry in context: its category, or its unplaced collection. */
export function entryChapterKey(entry: LibraryEntry): string {
  if (entry.wordPlacement) return categoryChapterKey("words");
  const occurrence = entry.occurrence;
  if (occurrence?.groupId !== undefined) {
    return categoryChapterKey(occurrence.section === "likelyExchanges" ? "exchanges"
      : occurrence.section === "exampleConversation" ? "conversation" : "phrases");
  }
  if (entry.card.type === "chunk") return "chunks";
  return entry.card.type === "word" ? "words" : "translations";
}
