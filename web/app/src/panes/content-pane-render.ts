import type { DeckIllustration, Group, LibraryEntry } from "../js/library-types";
import { escapeHTML } from "../js/utils";
import { LANG_NAMES, LANG_FLAGS } from "../js/lang";
import { renderCardRow } from "../components/card";
import { icon } from "../components/icon";
import { headerIconButton, headerSpacer, headerTitle, renderPaneHeader } from "../components/pane-header";
import type { ContentDeck } from "./content-pane";

export const STARRED_CHAPTER_KEY = "starred";

export interface TopicChapter {
  kind: "topic";
  key: string;
  title: string;
  groupId: string;
  essentials: LibraryEntry[];
  vocab: LibraryEntry[];
  dialogue: LibraryEntry[];
}

interface CollectionChapter {
  key: string;
  title: string;
  entries: LibraryEntry[];
}

export type DeckChapter = TopicChapter
  | (CollectionChapter & { kind: "translations" })
  | (CollectionChapter & { kind: "words" })
  | (CollectionChapter & { kind: "chunks" })
  | (CollectionChapter & { kind: "starred" });

function isPreview(deck: ContentDeck): boolean {
  return "preview" in deck && deck.preview;
}

function isSystem(deck: ContentDeck): boolean {
  return "system" in deck && deck.system;
}

export function renderHeader(deck: ContentDeck | null): string {
  if (!deck) return "";
  const stored = !isPreview(deck) && !isSystem(deck);
  return `<header class="textbook-book-header" data-region="book-header">
    <div class="textbook-book-bubble">
      <div class="textbook-book-controls">
        ${headerIconButton("menu", { action: "content/menu", label: "Library" })}
        <div class="textbook-book-tools">
          ${stored ? `<button type="button" class="icon-button" data-action="content/menu-settings" aria-label="Phrasebook settings">${icon("settings")}</button>
          <button type="button" class="icon-button textbook-edit-button" data-action="content/menu-edit" aria-label="Edit cards">${icon("edit")}</button>
          <button type="button" class="icon-button deck-header-done" data-action="content/done" aria-label="Done">${icon("check")}</button>
          <button type="button" class="textbook-cancel-edit" data-action="content/cancel-edit">Cancel</button>` : ""}
          ${isPreview(deck) ? '<button type="button" class="deck-header-save-pill" data-action="content/save-preview" aria-label="Save">Save</button>' : ""}
        </div>
      </div>
      <h1 class="textbook-book-title"><button type="button" class="pane-header-title" data-action="content/deck-title">${escapeHTML(deck.name)}</button></h1>
      <span class="textbook-language-badge">${escapeHTML(LANG_NAMES[deck.lang])} ${LANG_FLAGS[deck.lang]}</span>
    </div>
  </header>`;
}

/** Chapter identities are group IDs, never their potentially duplicated titles. */
export function getDeckChapters(
  entries: readonly LibraryEntry[] = [],
  groups: readonly Group[] = [],
): DeckChapter[] {
  const phrases = entries.filter((entry) => entry.card.type === "phrase");
  const chapters: DeckChapter[] = [...groups]
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((group) => ({
      kind: "topic", key: `group:${group.id}`, title: group.title, groupId: group.id,
      essentials: phrases.filter((entry) => entry.occurrence?.groupId === group.id && entry.occurrence.section === "essentials"),
      vocab: entries.filter((entry) => entry.card.type === "word" && entry.wordPlacement?.groupId === group.id),
      dialogue: phrases.filter((entry) => entry.occurrence?.groupId === group.id && entry.occurrence.section === "dialogue"),
    }));
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

export function normalizeChapterKey(entries: readonly LibraryEntry[], groups: readonly Group[], requestedKey: string | null): string | null {
  return getDeckChapters(entries, groups).find((chapter) => chapter.key === requestedKey)?.key ?? null;
}

/** Art is purely a tiled backdrop: all states have identical, non-flow geometry. */
export function renderIllustration(illustration?: DeckIllustration): string {
  const source = illustration?.state === "ready" ? illustration.image.dataUrl : "/textbook/frogs.png";
  return `<div class="textbook-pattern" aria-hidden="true" style="background-image:url(&quot;${escapeHTML(source)}&quot;)"></div>`;
}

export function renderChapterNavigation(chapters: readonly DeckChapter[]): string {
  return `<nav class="textbook-chapter-nav" aria-label="Textbook chapters">
    <details><summary>In this phrasebook</summary><div class="textbook-chapter-links">
      ${chapters.map((chapter) => `<button type="button" data-action="content/jump-chapter" data-chapter-key="${escapeHTML(chapter.key)}">${escapeHTML(chapter.title)}${chapter.kind === "starred" ? ` (<span class="textbook-star-count">${chapter.entries.length}</span>)` : ""}</button>`).join("")}
    </div></details>
    <button type="button" class="textbook-star-link" data-action="content/jump-chapter" data-chapter-key="starred">${icon("star-fill")} Starred (<span class="textbook-star-count">${chapters.find((chapter) => chapter.kind === "starred")?.entries.length ?? 0}</span>)</button>
  </nav>`;
}

export function renderChapter(chapter: DeckChapter, deck: ContentDeck, index: number): string {
  const rows = (entries: readonly LibraryEntry[], conversation = false, wordTile = false): string => entries.map((entry, rowIndex) => renderCardRow(entry, deck.readingDisplay, {
    readOnly: isPreview(deck), conversation, wordTile,
    alternative: conversation && rowIndex > 0 && entry.occurrence?.speaker !== undefined && entry.occurrence.speaker === entries[rowIndex - 1].occurrence?.speaker,
  })).join("");
  const section = (title: string, key: string, entries: LibraryEntry[], conversation = false): string => `<section class="textbook-learning-section" data-topic-section="${key}">
    <h3 class="section-label">${title}</h3>
    <div class="${conversation ? "textbook-dialogue" : "textbook-shelf"}" data-reorder-region="${key}"${conversation ? "" : ` tabindex="0" aria-label="${title}, two-row horizontal shelf"`}>${rows(entries, conversation, key === "vocab")}</div>
    ${entries.length ? "" : '<p class="textbook-section-empty fg-secondary">Nothing in this section yet.</p>'}
  </section>`;
  const body = chapter.kind === "topic"
    ? section("Essential vocab", "vocab", chapter.vocab) + section("Key phrases", "essentials", chapter.essentials) + section("Conversation", "dialogue", chapter.dialogue, true)
    : chapter.entries.length
      ? `<div class="textbook-card-list"${chapter.kind === "starred" ? "" : ` data-reorder-region="${chapter.kind}"`}>${rows(chapter.entries)}</div>`
      : '<p class="textbook-section-empty fg-secondary">No starred cards yet. Star cards in this phrasebook to review them here.</p>';
  const id = `textbook-chapter-${encodeURIComponent(chapter.key)}`;
  return `<section class="textbook-chapter" id="${escapeHTML(id)}" data-chapter-key="${escapeHTML(chapter.key)}" data-chapter-kind="${chapter.kind}" tabindex="-1" aria-labelledby="${escapeHTML(id)}-title">
    <h2 id="${escapeHTML(id)}-title" class="textbook-chapter-title">${chapter.kind === "topic" ? `<span class="textbook-chapter-number">${String(index + 1).padStart(2, "0")}</span> ` : ""}${escapeHTML(chapter.title)}</h2>
    <div data-region="chapter-cards">${body}</div>
  </section>`;
}

export function renderTextbook(deck: ContentDeck, entries: readonly LibraryEntry[], groups: readonly Group[]): string {
  const chapters = getDeckChapters(entries, groups);
  return `<div class="textbook-reader" data-region="textbook-reader" tabindex="0" aria-label="Phrasebook chapters">
    <div class="textbook-reading-paper">
      <div data-region="chapter-navigation">${renderChapterNavigation(chapters)}</div>
      <div class="textbook-star-status" data-region="starred-status" role="status" aria-live="polite" aria-atomic="true"></div>
      <div data-region="textbook-chapters">${chapters.map((chapter, index) => renderChapter(chapter, deck, index)).join("")}</div>
    </div>
  </div>`;
}

/** Language browsing retains every card type, without phrasebook star state. */
export function renderBrowseCardsHTML(deck: ContentDeck, entries: readonly LibraryEntry[], _groups: readonly Group[]): string {
  const sections = [{ type: "phrase", title: "Translations" }, { type: "word", title: "Words" }, { type: "chunk", title: "Chunks" }]
    .map((section) => ({ ...section, entries: entries.filter((entry) => entry.card.type === section.type) })).filter((section) => section.entries.length > 0);
  if (!sections.length) return '<div class="deck-view-empty text-center fg-secondary"><p>No cards in this library.</p></div>';
  return sections.map((section) => `<h2 class="deck-view-section-header section-label">${section.title}</h2><div class="card-group"><div class="card-group-rows">${section.entries.map((entry) => renderCardRow(entry, deck.readingDisplay, { readOnly: isPreview(deck), conversation: false })).join("")}</div></div>`).join("");
}

export function renderDeckBody(deck: ContentDeck | null, entries: readonly LibraryEntry[], groups: readonly Group[], _chapterKey: string | null): string {
  if (!deck) return '<p class="content-inline-error fg-danger" data-region="content-error" role="alert" hidden></p>';
  return `${renderHeader(deck)}
    <div class="textbook-backdrop" data-region="deck-hero">${renderIllustration("illustration" in deck ? deck.illustration : undefined)}</div>
    <p class="content-inline-error fg-danger" data-region="content-error" role="alert" hidden></p>
    ${isSystem(deck) ? `<div class="deck-view-list textbook-language-list flex-1 flex-col min-h-0 overflow-y-auto" data-region="card-list">${renderBrowseCardsHTML(deck, entries, groups)}</div>` : renderTextbook(deck, entries, groups)}
    ${!isSystem(deck) && !isPreview(deck) ? `<div class="textbook-review-bar"><button type="button" data-action="content/review" aria-label="Review"${entries.some((entry) => entry.membership?.starredAt != null) ? "" : " disabled"}>${icon("review")} Review starred cards</button></div>` : ""}`;
}

export interface ContentBrowse { title: string; groupsHtml: string; }
export function renderBrowseBody(browse: ContentBrowse | null): string {
  if (!browse) return "";
  return `${renderPaneHeader({ leading: headerIconButton("back", { action: "content/browse-back", label: "Back" }), title: headerTitle(browse.title), trailing: headerSpacer() })}<div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto" data-region="browse-list">${browse.groupsHtml}</div>`;
}
