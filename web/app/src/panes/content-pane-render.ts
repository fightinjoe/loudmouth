import type { Group, LibraryEntry, ReadingDisplay } from "../js/library-types";
import { escapeHTML } from "../js/utils";
import { renderCardRow } from "../components/card";
import { icon } from "../components/icon";
import {
  headerIconButton,
  headerSpacer,
  headerTitle,
  renderPaneHeader,
} from "../components/pane-header";
import type { ContentDeck } from "./content-pane";

export const TRANSLATIONS_PAGE_KEY = "translations";
export const CHUNKS_PAGE_KEY = "chunks";
export const VOCAB_PAGE_KEY = "vocab";

export type DeckPageKind = "conversation" | "chunks" | "vocab";

export interface DeckPage {
  key: string;
  title: string;
  kind: DeckPageKind;
  entries: LibraryEntry[];
}

function isPreview(deck: ContentDeck): boolean {
  return "preview" in deck && deck.preview;
}

function isSystem(deck: ContentDeck): boolean {
  return "system" in deck && deck.system;
}

export function renderHeader(deck: ContentDeck | null): string {
  if (!deck) return "";
  return renderPaneHeader({
    leading: headerIconButton("menu", { action: "content/menu", label: "Menu" }),
    title: headerTitle(deck.name, { action: "content/deck-title" }),
    trailing: isPreview(deck)
      ? '<button class="deck-header-save-pill tappable" data-action="content/save-preview" aria-label="Save">Save</button>'
      : isSystem(deck)
        ? headerSpacer()
        : `<button class="icon-button deck-header-done" data-action="content/done" aria-label="Done">${icon("check")}</button>`,
  });
}

/**
 * Builds the stable entry-key page model. Group IDs, not titles, identify
 * conversation pages so duplicate titles remain distinct and ordered.
 */
export function getDeckPages(
  entries: readonly LibraryEntry[] = [],
  groups: readonly Group[] = [],
): DeckPage[] {
  const phrases = entries.filter((entry) => entry.card.type === "phrase");
  const groupless = phrases.filter((entry) => entry.occurrence?.groupId === undefined);
  const pages: DeckPage[] = [];

  if (groupless.length > 0) {
    pages.push({
      key: TRANSLATIONS_PAGE_KEY,
      title: "Translations",
      kind: "conversation",
      entries: [...groupless],
    });
  }

  const orderedGroups = [...groups].sort(
    (left, right) => left.position - right.position || left.id.localeCompare(right.id),
  );
  for (const group of orderedGroups) {
    pages.push({
      key: `group:${group.id}`,
      title: group.title,
      kind: "conversation",
      entries: phrases.filter((entry) => entry.occurrence?.groupId === group.id),
    });
  }

  const chunks = entries.filter((entry) => entry.card.type === "chunk");
  if (chunks.length > 0) {
    pages.push({
      key: CHUNKS_PAGE_KEY,
      title: "Chunks",
      kind: "chunks",
      entries: [...chunks],
    });
  }

  pages.push({
    key: VOCAB_PAGE_KEY,
    title: "Vocab",
    kind: "vocab",
    entries: entries.filter((entry) => entry.card.type === "word"),
  });
  return pages;
}

export function normalizePageKey(
  entries: readonly LibraryEntry[],
  groups: readonly Group[],
  requestedKey: string | null,
): string {
  const pages = getDeckPages(entries, groups);
  return pages.find((page) => page.key === requestedKey)?.key ?? pages[0].key;
}

function emptyPageMessage(kind: DeckPageKind): string {
  if (kind === "vocab") return "No vocabulary in this phrasebook.";
  if (kind === "chunks") return "No chunks in this phrasebook.";
  return "No phrases in this conversation.";
}

function renderPageEntries(
  page: DeckPage,
  readingDisplay: ReadingDisplay,
  readOnly = false,
): string {
  if (page.entries.length === 0) {
    return `<p class="deck-view-empty fg-secondary">${emptyPageMessage(page.kind)}</p>`;
  }
  return page.entries
    .map((entry) => renderCardRow(entry, readingDisplay, { readOnly }))
    .join("");
}

export function renderDeckPager(
  deck: ContentDeck,
  entries: readonly LibraryEntry[],
  groups: readonly Group[],
  requestedPageKey: string | null,
): string {
  const pages = getDeckPages(entries, groups);
  const activePageKey = normalizePageKey(entries, groups, requestedPageKey);

  return `
    <div class="deck-pager flex-1 min-h-0 flex-col" data-region="deck-pager">
      <div class="deck-tabs" data-region="deck-tabs" role="tablist" aria-label="Conversation topics and vocabulary">
        ${pages.map((page, index) => {
          const selected = page.key === activePageKey;
          return `
            <button
              id="deck-page-tab-${index}"
              class="deck-tab tappable"
              type="button"
              role="tab"
              data-action="content/set-page"
              data-page-key="${escapeHTML(page.key)}"
              aria-controls="deck-page-${index}"
              aria-selected="${selected}"
              tabindex="${selected ? "0" : "-1"}"
              title="${escapeHTML(page.title)}"
              aria-label="${escapeHTML(page.title)}"
            ><span>${escapeHTML(page.title)}</span></button>
          `;
        }).join("")}
      </div>
      <div class="deck-pages flex-1 min-h-0" data-region="deck-pages" aria-label="Swipe between conversation pages">
        ${pages.map((page, index) => {
          const selected = page.key === activePageKey;
          return `
            <section
              id="deck-page-${index}"
              class="deck-page"
              role="tabpanel"
              aria-labelledby="deck-page-tab-${index}"
              data-page-key="${escapeHTML(page.key)}"
              data-page-kind="${page.kind}"
              tabindex="0"
              ${selected ? "" : "inert"}
            >
              <div class="deck-page-list flex-col" data-region="card-list">
                ${renderPageEntries(page, deck.readingDisplay)}
              </div>
            </section>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

/**
 * Preview and language-library views stay vertically browsable, but use the
 * same joined entries and explicit groups as the phrasebook pager.
 */
export function renderBrowseCardsHTML(
  deck: ContentDeck,
  entries: readonly LibraryEntry[],
  groups: readonly Group[],
): string {
  const pages = getDeckPages(entries, groups).filter((page) => page.entries.length > 0);
  if (pages.length === 0) {
    return '<div class="deck-view-empty text-center fg-secondary"><p>No cards in this library.</p></div>';
  }
  const readOnly = isPreview(deck);
  const showHeadings = pages.length > 1 || pages[0].key.startsWith("group:");
  return pages.map((page) => `
    ${showHeadings
      ? `<div class="deck-view-section-header section-label">${escapeHTML(page.title)}</div>`
      : ""}
    <div class="card-group">
      <div class="card-group-rows">
        ${renderPageEntries(page, deck.readingDisplay, readOnly)}
      </div>
    </div>
  `).join("");
}

export function renderDeckBody(
  deck: ContentDeck | null,
  entries: readonly LibraryEntry[],
  groups: readonly Group[],
  pageKey: string | null,
): string {
  if (!deck) return "";
  const browse = isSystem(deck) || isPreview(deck);
  const pager = browse
    ? `<div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto" data-region="card-list">
         ${renderBrowseCardsHTML(deck, entries, groups)}
       </div>`
    : renderDeckPager(deck, entries, groups, pageKey);
  const reviewDisabled = entries.some((entry) => entry.membership?.starredAt != null)
    ? ""
    : " disabled";

  return `
    ${renderHeader(deck)}
    <p class="content-inline-error fg-danger" data-region="content-error" role="alert" hidden></p>
    ${pager}
    ${browse
      ? ""
      : `<div class="deck-view-action-bar shrink-0 flex items-center justify-center">
           <div class="deck-view-action-pill flex items-center">
             <button class="deck-view-action-btn flex-col items-center" data-action="content/review" aria-label="Review"${reviewDisabled}>${icon("review")}<span>Review</span></button>
           </div>
         </div>`}
  `;
}

function renderBrowseHeader(title: string): string {
  return renderPaneHeader({
    leading: headerIconButton("back", { action: "content/browse-back", label: "Back" }),
    title: headerTitle(title),
    trailing: headerSpacer(),
  });
}

export interface ContentBrowse {
  title: string;
  groupsHtml: string;
}

export function renderBrowseBody(browse: ContentBrowse | null): string {
  if (!browse) return "";
  return `
    ${renderBrowseHeader(browse.title)}
    <div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto" data-region="browse-list">
      ${browse.groupsHtml}
    </div>
  `;
}
