import type { LibraryEntry, ReadingDisplay } from "../js/library-types";
import {
  CATEGORIES,
  categoryCount,
  STARRED_TABS,
  type CategoryChapter,
  type DeckChapter,
  type StarredTab,
} from "../js/phrasebook-chapters";
import { escapeHTML } from "../js/utils";
import { renderCardRow } from "./card";
import { icon } from "./icon";

/**
 * Static chapter sheet: scrim, header with Back, chapter switcher and reorder
 * controls, the chapter menu region, and the body region rebuilt per chapter.
 */
export function renderChapterSheet(): string {
  return `<div class="chapter-sheet-scrim" data-action="content/close-chapter" aria-hidden="true"></div>
  <section class="chapter-sheet" data-region="chapter-sheet" role="dialog" aria-modal="true" aria-labelledby="chapter-sheet-title">
    <header class="chapter-sheet-header">
      <button type="button" class="icon-button chapter-sheet-back" data-action="content/close-chapter" aria-label="Back to phrasebook">${icon("back")}</button>
      <button type="button" class="chapter-sheet-switch" data-action="content/toggle-chapter-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="chapter-menu">
        <span class="chapter-sheet-title" id="chapter-sheet-title" data-region="chapter-sheet-title"></span>${icon("expand-more", { className: "chapter-sheet-caret" })}
      </button>
      <div class="chapter-sheet-tools">
        <button type="button" class="icon-button chapter-sheet-edit" data-action="content/menu-edit" aria-label="Reorder cards">${icon("edit")}</button>
        <button type="button" class="chapter-sheet-cancel" data-action="content/cancel-edit">Cancel</button>
        <button type="button" class="icon-button chapter-sheet-done" data-action="content/done" aria-label="Done">${icon("check")}</button>
      </div>
      <div class="chapter-menu" id="chapter-menu" data-region="chapter-menu" role="menu" aria-label="Chapters"></div>
    </header>
    <div class="chapter-sheet-body" data-region="chapter-sheet-body"></div>
  </section>`;
}

/** Starred and categories while they have content, then collections; the current chapter is always listed and checked. */
export function renderChapterMenu(chapters: readonly DeckChapter[], currentKey: string | null): string {
  const listed = (chapter: DeckChapter): boolean => chapter.key === currentKey
    || (chapter.kind === "starred" ? chapter.entries.length > 0 : chapter.kind !== "category" || categoryCount(chapter) > 0);
  const items = [
    ...chapters.filter((chapter) => chapter.kind === "starred"),
    ...chapters.filter((chapter) => chapter.kind !== "starred"),
  ].filter(listed);
  return items.map((chapter) => {
    const marker = chapter.kind === "category"
      ? CATEGORIES.find((candidate) => candidate.key === chapter.category)!.glyph
      : icon(chapter.kind === "starred" ? "star-fill" : "cards-stack", { size: "sm" });
    return `<button type="button" class="chapter-menu-item" role="menuitemradio" tabindex="-1" aria-checked="${chapter.key === currentKey}" data-action="content/open-chapter" data-chapter-key="${escapeHTML(chapter.key)}">
      <span class="chapter-menu-marker" aria-hidden="true">${marker}</span>
      <span class="chapter-menu-name">${escapeHTML(chapter.title)}</span>
      ${icon("check", { className: "chapter-menu-check", size: "sm" })}
    </button>`;
  }).join("");
}

export interface ChapterSheetBodyOptions {
  readingDisplay: ReadingDisplay;
  /** Starred tab; other chapters have one page. */
  tab: StarredTab;
  /** Topic and word-family label for a starred entry, e.g. "Ordering drinks · Drinks". */
  contextFor: (entry: LibraryEntry) => string;
}

type Rows = (entries: readonly LibraryEntry[], conversation?: boolean, alternatives?: boolean) => string;
type Page = { key: string; label: string; html: string };

function empty(message: string): string {
  return `<p class="chapter-empty fg-secondary">${message}</p>`;
}

/** A section headed by its group (family or exchange) with the topic beneath, or headed by its topic. */
function section(attributes: string, title: string, context: string | null, content: string, className = ""): string {
  return `<section class="chapter-group${className}" ${attributes}>
    <h3 class="chapter-group-title">${escapeHTML(title)}</h3>
    ${context === null ? "" : `<p class="chapter-group-context">${escapeHTML(context)}</p>`}
    ${content}
  </section>`;
}

/** One vertical page covering every topic's content for the category. */
function categoryPage(chapter: CategoryChapter, rows: Rows): string {
  const { topics } = chapter;
  if (chapter.category === "words") {
    return topics.flatMap((topic) => topic.words.map((family) => section(`data-family-id="${escapeHTML(family.id)}"`, family.title, topic.title,
      `<div class="chapter-list" data-reorder-region="family:${escapeHTML(family.id)}">${rows(family.entries)}</div>
      ${family.entries.length ? "" : empty("Nothing in this family yet.")}`))).join("") || empty("No words in this phrasebook.");
  }
  if (chapter.category === "exchanges") {
    return topics.flatMap((topic) => topic.likelyExchanges.map((exchange) => section(`data-exchange-id="${escapeHTML(exchange.id)}"`, exchange.title, topic.title,
      `<div class="chapter-dialogue">${exchange.turns.map((turn) => {
        const speaker = turn[0].occurrence?.speaker ?? "you";
        const turnIndex = turn[0].occurrence!.turnIndex!;
        const label = `${speaker === "you" ? "You" : "Partner"}${turn.length > 1 ? `, ${turn.length} alternatives` : ""}`;
        return `<div class="chapter-turn" data-speaker="${speaker}" data-turn-index="${turnIndex}" role="group" aria-label="${label}"
          data-reorder-region="exchange:${escapeHTML(exchange.id)}:${turnIndex}">${rows(turn, true, true)}</div>`;
      }).join("") || empty("Nothing in this exchange yet.")}</div>`, " chapter-exchange"))).join("") || empty("No exchanges in this phrasebook.");
  }
  if (chapter.category === "phrases") {
    return topics.filter((topic) => topic.thingsToSay.length).map((topic) => section(`data-topic-id="${escapeHTML(topic.groupId)}"`, topic.title, null,
      `<div class="chapter-list chapter-list--phrases" data-reorder-region="thingsToSay:${escapeHTML(topic.groupId)}">${rows(topic.thingsToSay)}</div>`)).join("")
      || empty("No key phrases in this phrasebook.");
  }
  return topics.filter((topic) => topic.exampleConversation.length).map((topic) => section(`data-topic-id="${escapeHTML(topic.groupId)}"`, topic.title, null,
    `<div class="chapter-conversation" data-reorder-region="exampleConversation:${escapeHTML(topic.groupId)}">${rows(topic.exampleConversation, true)}</div>`)).join("")
    || empty("No conversation in this phrasebook.");
}

/** Starred has Words and Phrases tabs over a snapping pager; every other chapter is one page without tabs. */
export function renderChapterSheetBody(chapter: DeckChapter, options: ChapterSheetBodyOptions): string {
  const rows: Rows = (entries, conversation = false, alternatives = false) =>
    entries.map((entry, index) => renderCardRow(entry, options.readingDisplay, {
      conversation, optionSeparator: alternatives && index > 0,
    })).join("");
  const starredList = (entries: readonly LibraryEntry[], message: string, className = ""): string => entries.length
    ? `<div class="chapter-list${className}">${entries.map((entry) => `<div class="starred-item" data-entry-key="${escapeHTML(entry.key)}">
        <p class="starred-context">${escapeHTML(options.contextFor(entry))}</p>
        ${rows([entry])}
        <button type="button" class="starred-in-context" data-action="content/open-in-context" data-entry-key="${escapeHTML(entry.key)}">In context ›</button>
      </div>`).join("")}</div>`
    : empty(message);
  const pages: Page[] = chapter.kind === "starred"
    ? STARRED_TABS.map(({ key, label }) => ({ key, label,
      html: key === "words"
        ? starredList(chapter.entries.filter((entry) => entry.card.type === "word"), "No starred words.")
        : starredList(chapter.entries.filter((entry) => entry.card.type !== "word"), "No starred phrases.", " chapter-list--phrases") }))
    : [{ key: chapter.kind === "category" ? chapter.category : chapter.kind, label: chapter.title,
      html: chapter.kind === "category" ? categoryPage(chapter, rows)
        : `<div class="chapter-list" data-reorder-region="${chapter.kind}">${rows(chapter.entries)}</div>` }];
  const active = pages.some((page) => page.key === options.tab) ? options.tab : pages[0].key;
  return `<div class="chapter-tabs" role="tablist" aria-label="Starred" data-tab-count="${pages.length}">
    ${pages.map((page) => `<button type="button" class="chapter-tab" role="tab" id="chapter-tab-${page.key}" data-action="content/select-tab" data-tab="${page.key}"
      aria-controls="chapter-page-${page.key}" aria-selected="${page.key === active}" tabindex="${page.key === active ? 0 : -1}">${escapeHTML(page.label)}</button>`).join("")}
  </div>
  <div class="chapter-pager" data-region="chapter-pager">
    ${pages.map((page) => `<section class="chapter-page" role="tabpanel" id="chapter-page-${page.key}" aria-labelledby="chapter-tab-${page.key}" data-tab="${page.key}"${page.key === active ? "" : " inert"}>${page.html}</section>`).join("")}
  </div>`;
}
