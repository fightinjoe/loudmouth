import type { DeckIllustration, Group, LibraryEntry } from "../js/library-types";
import { escapeHTML } from "../js/utils";
import { LANG_NAMES, LANG_FLAGS } from "../js/lang";
import { getDeckChapters, type CategoryChapter, type DeckChapter, type StarredChapter } from "../js/phrasebook-chapters";
import { renderCardRow } from "../components/card";
import { icon } from "../components/icon";
import { headerIconButton, headerSpacer, headerTitle, renderPaneHeader } from "../components/pane-header";
import { renderPhrasebookTitle } from "../components/phrasebook-title";
import { renderCategoryCard, renderCollectionCard, renderStarredCard } from "../components/chapter-card";
import { renderChapterSheet } from "../components/chapter-sheet";
import type { ContentDeck } from "./content-pane";

function isPreview(deck: ContentDeck): boolean {
  return "preview" in deck && deck.preview;
}

function isSystem(deck: ContentDeck): boolean {
  return "system" in deck && deck.system;
}

/** Generated cover art, or the static paper texture while none is ready. */
export function renderIllustration(illustration?: DeckIllustration): string {
  const ready = illustration?.state === "ready";
  const source = ready ? illustration.image.dataUrl : "/textbook/frogs.png";
  return `<div class="textbook-pattern${ready ? " textbook-cover" : ""}" aria-hidden="true" style="background-image:url(&quot;${escapeHTML(source)}&quot;)"></div>`;
}

/** Topic and word-family label used by Starred items, e.g. "Ordering drinks · Drinks". */
export function entryContextLabel(entry: LibraryEntry, chapters: readonly DeckChapter[]): string {
  const groupId = entry.wordPlacement?.groupId ?? entry.occurrence?.groupId;
  const topics = chapters.find((chapter): chapter is CategoryChapter => chapter.kind === "category")?.topics ?? [];
  const topic = topics.find((candidate) => candidate.groupId === groupId);
  if (!topic) {
    return chapters.find((chapter) => chapter.kind !== "starred" && chapter.kind !== "category"
      && chapter.entries.some((candidate) => candidate.key === entry.key))?.title ?? "";
  }
  const family = entry.wordPlacement
    ? topic.words.find((candidate) => candidate.id === entry.wordPlacement!.familyId)?.title
    : undefined;
  return family ? `${topic.title} · ${family}` : topic.title;
}

/** Landing chapter list after the Starred slot: categories with content, then collections. Starred is patched separately. */
export function renderChapterList(chapters: readonly DeckChapter[]): string {
  return chapters.map((chapter) => chapter.kind === "category" ? renderCategoryCard(chapter)
    : chapter.kind === "starred" ? "" : renderCollectionCard(chapter)).join("");
}

export function renderStarredSlot(chapters: readonly DeckChapter[]): string {
  const starred = chapters.find((chapter): chapter is StarredChapter => chapter.kind === "starred");
  return starred ? renderStarredCard(starred, chapters) : "";
}

/** Language browsing retains every card type, without phrasebook star state. */
export function renderBrowseCardsHTML(deck: ContentDeck, entries: readonly LibraryEntry[], _groups: readonly Group[]): string {
  const sections = [{ type: "phrase", title: "Translations" }, { type: "word", title: "Words" }, { type: "chunk", title: "Chunks" }]
    .map((section) => ({ ...section, entries: entries.filter((entry) => entry.card.type === section.type) })).filter((section) => section.entries.length > 0);
  if (!sections.length) return '<div class="deck-view-empty text-center fg-secondary"><p>No cards in this library.</p></div>';
  return sections.map((section) => `<h2 class="deck-view-section-header section-label">${section.title}</h2><div class="card-group"><div class="card-group-rows">${section.entries.map((entry) => renderCardRow(entry, deck.readingDisplay, { readOnly: isPreview(deck), conversation: false })).join("")}</div></div>`).join("");
}

/**
 * Phrasebook landing: fixed title layer, a scroller whose illustration and
 * language pill scroll with the category cards, the Review tray, and the chapter sheet.
 */
export function renderDeckBody(deck: ContentDeck | null, entries: readonly LibraryEntry[], groups: readonly Group[]): string {
  const error = '<p class="content-inline-error fg-danger" data-region="content-error" role="alert" hidden></p>';
  if (!deck) return error;
  const stored = !isPreview(deck) && !isSystem(deck);
  const chapters = getDeckChapters(entries, groups);
  const trailing = stored
    ? `<button type="button" class="icon-button" data-action="content/menu-settings" aria-label="Phrasebook settings">${icon("settings")}</button>`
    : isPreview(deck) ? '<button type="button" class="deck-header-save-pill" data-action="content/save-preview" aria-label="Save">Save</button>' : "";
  const surface = isSystem(deck)
    ? `<div class="deck-view-list textbook-language-list flex-col" data-region="card-list">${renderBrowseCardsHTML(deck, entries, groups)}</div>`
    : `<div class="chapter-cards" data-region="chapter-cards">
        <div data-region="starred-card">${renderStarredSlot(chapters)}</div>
        <div class="chapter-list-region" data-region="chapter-list">${renderChapterList(chapters)}</div>
      </div>
      <div class="phrasebook-star-status" data-region="starred-status" role="status" aria-live="polite" aria-atomic="true"></div>`;
  return `${renderPhrasebookTitle(deck.name, { leading: headerIconButton("menu", { action: "content/menu", label: "Library" }), trailing })}
    <div class="phrasebook-reader" data-region="textbook-reader" aria-label="${escapeHTML(deck.name)}">
      <div class="phrasebook-lead">
        <div class="phrasebook-art" data-region="deck-hero">${renderIllustration("illustration" in deck ? deck.illustration : undefined)}</div>
        <span class="phrasebook-language">${escapeHTML(LANG_NAMES[deck.lang])} ${LANG_FLAGS[deck.lang]}</span>
      </div>
      <div class="phrasebook-surface">${surface}</div>
    </div>
    ${error}
    ${stored ? `<div class="textbook-review-bar"><button type="button" data-action="content/review" aria-label="Review"${entries.some((entry) => entry.membership?.starredAt != null) ? "" : " disabled"}>${icon("review")} Review starred cards</button></div>` : ""}
    ${isSystem(deck) ? "" : renderChapterSheet({ editable: stored })}`;
}

export interface ContentBrowse { title: string; groupsHtml: string; }
export function renderBrowseBody(browse: ContentBrowse | null): string {
  if (!browse) return "";
  return `${renderPaneHeader({ leading: headerIconButton("back", { action: "content/browse-back", label: "Back" }), title: headerTitle(browse.title), trailing: headerSpacer() })}<div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto" data-region="browse-list">${browse.groupsHtml}</div>`;
}
