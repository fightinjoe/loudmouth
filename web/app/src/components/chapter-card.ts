import type { LibraryEntry } from "../js/library-types";
import {
  CATEGORIES,
  categoryCount,
  type CategoryChapter,
  type CollectionKindChapter,
  type DeckChapter,
  type StarredChapter,
  type StarredTab,
} from "../js/phrasebook-chapters";
import { escapeHTML } from "../js/utils";
import { icon } from "./icon";

/** Where a landing card opens the chapter sheet: chapter, optional Starred tab, optional section to reveal. */
export interface ChapterOpenTarget {
  chapterKey: string;
  tab?: StarredTab;
  /** `family:<id>` and `topic:<groupId>` scroll to a section; `exchange:<id>` also highlights it. */
  focus?: string;
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function chapterOpenAttributes({ chapterKey, tab, focus }: ChapterOpenTarget): string {
  return `data-action="content/open-chapter" data-chapter-key="${escapeHTML(chapterKey)}"${tab ? ` data-tab="${tab}"` : ""}${focus ? ` data-focus="${escapeHTML(focus)}"` : ""}`;
}

/** One deck card: heading, first item with its English, and a count. */
export function renderDeckCard(target: ChapterOpenTarget, heading: string, first: LibraryEntry | undefined, foot: string): string {
  return `<button type="button" class="deck-card" ${chapterOpenAttributes(target)}>
    <span class="deck-card-label">${escapeHTML(heading)}</span>
    ${first ? `<span class="deck-card-target" lang="${escapeHTML(first.card.lang)}">${escapeHTML(first.card.text)}</span>
    <span class="deck-card-english">${escapeHTML(first.card.translation)}</span>` : ""}
    <span class="deck-card-foot">${escapeHTML(foot)}</span>
  </button>`;
}

/** A conversation deck card previews its first lines as speaker-aligned bubbles. */
export function renderConversationCard(target: ChapterOpenTarget, heading: string, lines: readonly LibraryEntry[]): string {
  return `<button type="button" class="deck-card deck-card--conversation" ${chapterOpenAttributes(target)}>
    <span class="deck-card-label">${escapeHTML(heading)}</span>
    ${lines.slice(0, 3).map((line) => `<span class="deck-card-line" data-speaker="${line.occurrence?.speaker ?? "you"}" lang="${escapeHTML(line.card.lang)}">${escapeHTML(line.card.text)}</span>`).join("")}
    <span class="deck-card-foot">${plural(lines.length, "line")}</span>
  </button>`;
}

/** Joined deck cards share one rounded group; an empty group renders nothing. */
export function renderDeckGroup(label: string, cards: readonly string[]): string {
  return cards.length ? `<div class="deck-group" role="group" aria-label="${escapeHTML(label)}">${cards.join("")}</div>` : "";
}

function renderChapterHeader(target: ChapterOpenTarget, marker: string, name: string): string {
  return `<button type="button" class="chapter-card-header" ${chapterOpenAttributes(target)}>
    <span class="chapter-card-marker">${marker}</span>
    <span class="chapter-card-name">${name}</span>
    <span class="chapter-card-open" aria-hidden="true">Open</span>
  </button>`;
}

function renderDeckRow(label: string, groups: string): string {
  return `<div class="chapter-row" tabindex="0" role="group" aria-label="${escapeHTML(label)}">${groups}</div>`;
}

/**
 * A category across every topic. Words and Exchanges cards are headed by their
 * family or exchange title and clustered by topic; Key phrases and Conversation
 * cards are headed by their topic. Renders nothing while the category is empty.
 */
export function renderCategoryCard(chapter: CategoryChapter): string {
  const count = categoryCount(chapter);
  if (!count) return "";
  const { category, topics, key } = chapter;
  const meta = CATEGORIES.find((candidate) => candidate.key === category)!;
  const at = (focus: string): ChapterOpenTarget => ({ chapterKey: key, focus });
  const row = category === "words"
    ? topics.map((topic) => renderDeckGroup(topic.title, topic.words.filter((family) => family.entries.length).map((family) =>
        renderDeckCard(at(`family:${family.id}`), family.title, family.entries[0], plural(family.entries.length, "word"))))).join("")
    : category === "exchanges"
      ? topics.map((topic) => renderDeckGroup(topic.title, topic.likelyExchanges.filter((exchange) => exchange.turns.length).map((exchange) =>
          renderDeckCard(at(`exchange:${exchange.id}`), exchange.title, exchange.turns[0][0], plural(exchange.turns.length, "line"))))).join("")
      : category === "phrases"
        ? renderDeckGroup("Key phrases by topic", topics.filter((topic) => topic.thingsToSay.length).map((topic) =>
            renderDeckCard(at(`topic:${topic.groupId}`), topic.title, topic.thingsToSay[0], plural(topic.thingsToSay.length, "phrase"))))
        : renderDeckGroup("Conversations by topic", topics.filter((topic) => topic.exampleConversation.length).map((topic) =>
            renderConversationCard(at(`topic:${topic.groupId}`), topic.title, topic.exampleConversation)));
  return `<article class="chapter-card" data-chapter-key="${key}" data-chapter-kind="category" data-category="${category}">
    ${renderChapterHeader({ chapterKey: key }, `<span class="chapter-card-glyph" aria-hidden="true">${meta.glyph}</span>`,
      `${escapeHTML(meta.title)} <span class="chapter-card-count">· ${plural(count, meta.unit)}</span>`)}
    ${renderDeckRow(meta.title, row)}
  </article>`;
}

/** Cards outside any topic (unplaced translations, words, chunks) read as one-list chapters. */
export function renderCollectionCard(chapter: CollectionKindChapter): string {
  const unit = chapter.kind === "translations" ? "phrase" : chapter.kind === "words" ? "word" : "chunk";
  return `<article class="chapter-card" data-chapter-key="${escapeHTML(chapter.key)}" data-chapter-kind="${chapter.kind}">
    ${renderChapterHeader({ chapterKey: chapter.key }, icon("cards-stack"), escapeHTML(chapter.title))}
    ${renderDeckRow(chapter.title, renderDeckGroup(chapter.title, [
      renderDeckCard({ chapterKey: chapter.key }, chapter.title, chapter.entries[0], plural(chapter.entries.length, unit)),
    ]))}
  </article>`;
}

/** Starred leads the landing with the same card shape; it renders nothing while empty. */
export function renderStarredCard(starred: StarredChapter, chapters: readonly DeckChapter[]): string {
  if (!starred.entries.length) return "";
  const topics = chapters.find((chapter): chapter is CategoryChapter => chapter.kind === "category")?.topics ?? [];
  const familyTitles = new Map(topics.flatMap((topic) => topic.words.map((family) => [family.id, family.title] as const)));
  const words = starred.entries.filter((entry) => entry.card.type === "word");
  const phrases = starred.entries.filter((entry) => entry.card.type !== "word");
  const families = new Map<string, LibraryEntry[]>();
  for (const word of words) {
    const title = (word.wordPlacement && familyTitles.get(word.wordPlacement.familyId)) || "Words";
    families.set(title, [...families.get(title) ?? [], word]);
  }
  const at = (tab: StarredTab): ChapterOpenTarget => ({ chapterKey: starred.key, tab });
  const groups = [
    renderDeckGroup("Starred words", [...families].map(([title, entries]) =>
      renderDeckCard(at("words"), title, entries[0], plural(entries.length, "word")))),
    renderDeckGroup("Starred phrases", phrases.length
      ? [renderDeckCard(at("phrases"), "Phrases", phrases[0], plural(phrases.length, "phrase"))] : []),
  ].join("");
  return `<article class="chapter-card chapter-card--starred" data-chapter-key="${escapeHTML(starred.key)}" data-chapter-kind="starred">
    ${renderChapterHeader({ chapterKey: starred.key }, icon("star-fill"), `Starred <span class="chapter-card-count">· ${starred.entries.length}</span>`)}
    ${renderDeckRow("Starred collections", groups)}
  </article>`;
}

