import type { Lang } from '@catchphrase/card-schema';
import type { Deck, Group, LibraryEntry } from '../../js/library-types';
import {
  getDeckChapters,
  type CategoryChapter,
  type CategoryKey,
  type CollectionKindChapter,
  type DeckChapter,
  type StarredChapter,
} from '../../js/phrasebook-chapters';
import { entryContextLabel } from '../../panes/content-pane-render';
import { fixtureBackup } from './fixtures';

export interface FixtureBook {
  deck: Deck;
  entries: LibraryEntry[];
  groups: Group[];
  chapters: DeckChapter[];
}

/** Projects the single-book fixture graph to library entries in memory for
 * render-only specimens; the real getDeckChapters builds the chapters. Stories
 * that need persisted ordering or star behavior mount appStory instead. */
export function fixtureBook(options: { lang?: Lang; starred?: boolean } = {}): FixtureBook {
  const backup = fixtureBackup({ library: 'single', lang: options.lang, starred: options.starred });
  const deck = backup.decks[0]!;
  const cards = new Map(backup.cards.map((row) => [row.id, row.content]));
  const memberships = new Map(backup.memberships.map((row) => [row.cardId, row]));
  const sources = (cardId: string) => backup.provenance.filter((row) => row.cardId === cardId).map((row) => row.source);
  const phrases = backup.occurrences.map((occurrence): LibraryEntry => ({
    key: occurrence.id, cardId: occurrence.cardId,
    card: { ...cards.get(occurrence.cardId)!, translation: occurrence.translation },
    membership: memberships.get(occurrence.cardId), occurrence, sources: [],
  }));
  const placed = new Set(backup.topicWords.map((placement) => placement.cardId));
  const words = backup.topicWords.map((wordPlacement): LibraryEntry => ({
    key: wordPlacement.id, cardId: wordPlacement.cardId, card: cards.get(wordPlacement.cardId)!,
    membership: memberships.get(wordPlacement.cardId), wordPlacement, sources: sources(wordPlacement.cardId),
  }));
  const unplaced = backup.memberships.flatMap((membership): LibraryEntry[] => {
    const card = cards.get(membership.cardId)!;
    return card.type === 'phrase' || placed.has(membership.cardId) ? []
      : [{ key: JSON.stringify([deck.id, membership.cardId]), cardId: membership.cardId, card, membership, sources: sources(membership.cardId) }];
  });
  const entries = [...phrases, ...words, ...unplaced];
  return { deck, entries, groups: backup.groups, chapters: getDeckChapters(entries, backup.groups) };
}

export function categoryChapter(book: FixtureBook, category: CategoryKey): CategoryChapter {
  return book.chapters.find((chapter): chapter is CategoryChapter => chapter.kind === 'category' && chapter.category === category)!;
}

export function starredChapter(book: FixtureBook): StarredChapter {
  return book.chapters.find((chapter): chapter is StarredChapter => chapter.kind === 'starred')!;
}

export function collectionChapters(book: FixtureBook): CollectionKindChapter[] {
  return book.chapters.filter((chapter): chapter is CollectionKindChapter => chapter.kind !== 'category' && chapter.kind !== 'starred');
}

/** The Starred context label the content pane supplies, e.g. "Ordering drinks · Drinks". */
export function contextFor(book: FixtureBook): (entry: LibraryEntry) => string {
  return (entry) => entryContextLabel(entry, book.chapters);
}
