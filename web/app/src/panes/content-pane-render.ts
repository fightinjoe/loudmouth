import type { DeckIllustration, Group, LibraryEntry } from "../js/library-types";
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
export const WORDS_PAGE_KEY = "words";
export const CONTENTS_PAGE_KEY = "contents";
export const STARRED_PAGE_KEY = "starred";

export interface TopicPage {
  kind: "topic";
  key: string;
  title: string;
  groupId: string;
  essentials: LibraryEntry[];
  vocab: LibraryEntry[];
  dialogue: LibraryEntry[];
}

export type DeckPage =
  | { kind: "contents"; key: string; title: string; topics: TopicPage[] }
  | TopicPage
  | { kind: "translations" | "words" | "chunks" | "starred"; key: string; title: string; entries: LibraryEntry[] };

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

/** Group IDs keep equal-title topics distinct; row identities remain occurrence-local. */
export function getDeckPages(
  entries: readonly LibraryEntry[] = [],
  groups: readonly Group[] = [],
): DeckPage[] {
  const phrases = entries.filter((entry) => entry.card.type === "phrase");
  const topics: TopicPage[] = [...groups]
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((group) => ({
      kind: "topic",
      key: `group:${group.id}`,
      title: group.title,
      groupId: group.id,
      essentials: phrases.filter((entry) =>
        entry.occurrence?.groupId === group.id && entry.occurrence.section === "essentials"),
      vocab: entries.filter((entry) =>
        entry.card.type === "word" && entry.wordPlacement?.groupId === group.id),
      dialogue: phrases.filter((entry) =>
        entry.occurrence?.groupId === group.id && entry.occurrence.section === "dialogue"),
    }));
  const pages: DeckPage[] = [
    { kind: "contents", key: CONTENTS_PAGE_KEY, title: "Phrasebook", topics },
    ...topics,
  ];
  const supplemental = [
    { kind: "translations" as const, key: TRANSLATIONS_PAGE_KEY, title: "Translations",
      entries: phrases.filter((entry) => entry.occurrence?.groupId === undefined) },
    { kind: "words" as const, key: WORDS_PAGE_KEY, title: "Words",
      entries: entries.filter((entry) => entry.card.type === "word" && !entry.wordPlacement) },
    { kind: "chunks" as const, key: CHUNKS_PAGE_KEY, title: "Chunks",
      entries: entries.filter((entry) => entry.card.type === "chunk") },
  ];
  pages.push(...supplemental.filter((page) => page.entries.length > 0));
  const starredEntries: LibraryEntry[] = [];
  const seenMemberships = new Map<string, Set<string>>();
  // Match Review's saved entry order, independent of the learning collections.
  for (const entry of entries) {
    const membership = entry.membership;
    if (membership?.starredAt == null) continue;
    let seenCards = seenMemberships.get(membership.deckId);
    if (seenCards?.has(membership.cardId)) continue;
    if (!seenCards) {
      seenCards = new Set();
      seenMemberships.set(membership.deckId, seenCards);
    }
    seenCards.add(membership.cardId);
    starredEntries.push(entry);
  }
  pages.unshift({
    key: STARRED_PAGE_KEY,
    title: "Starred",
    kind: "starred",
    entries: starredEntries,
  });
  return pages;
}

export function normalizePageKey(
  entries: readonly LibraryEntry[],
  groups: readonly Group[],
  requestedKey: string | null,
): string {
  const pages = getDeckPages(entries, groups);
  return pages.find((page) => page.key === requestedKey)?.key
    ?? pages.find((page) => page.kind !== "starred")!.key;
}

export function renderIllustration(illustration?: DeckIllustration): string {
  if (!illustration) return "";
  if (illustration.state === "failed") {
    return '<p class="deck-illustration-unavailable fg-secondary">Illustration unavailable</p>';
  }
  return `<div class="deck-illustration"${illustration.state === "pending" ? ' aria-hidden="true"' : ""}>
    ${illustration.state === "ready"
      ? `<img src="${escapeHTML(illustration.image.dataUrl)}" alt="" width="${illustration.image.width}" height="${illustration.image.height}">`
      : ""}
  </div>`;
}

function renderContents(topics: readonly TopicPage[], deck: ContentDeck): string {
  return `<div data-region="deck-hero">${renderIllustration("illustration" in deck ? deck.illustration : undefined)}</div>
    ${topics.map((topic) => `
      <section class="topic-preview" data-action="content/set-page"
        data-page-key="${escapeHTML(topic.key)}" data-section="essentials">
        <h2 class="section-label">${escapeHTML(topic.title)}</h2>
        <div class="topic-preview-card">
          <div class="topic-preview-lines">
            ${topic.essentials.slice(0, 3).map((entry) =>
              `<button type="button" class="topic-preview-line" data-action="content/set-page"
                data-page-key="${escapeHTML(topic.key)}" data-section="essentials">${escapeHTML(entry.card.translation)}</button>`).join("")}
            ${topic.vocab.slice(0, 2).map((entry) =>
              `<button type="button" class="topic-preview-line" data-action="content/set-page"
                data-page-key="${escapeHTML(topic.key)}" data-section="vocab">${escapeHTML(entry.card.translation)}${entry.card.type === "word" ? ` <span class="fg-secondary">(${escapeHTML(entry.card.partOfSpeech)})</span>` : ""}</button>`).join("")}
          </div>
          <div class="topic-preview-footer">
            <span>${topic.essentials.length} phrase${topic.essentials.length === 1 ? "" : "s"} · ${topic.vocab.length} word${topic.vocab.length === 1 ? "" : "s"} · 1 conversation</span>
            <button type="button" class="topic-view tappable" data-action="content/set-page"
              data-page-key="${escapeHTML(topic.key)}" data-section="essentials" aria-label="View ${escapeHTML(topic.title)}">View${icon("next")}</button>
          </div>
        </div>
      </section>`).join("")}`;
}

function renderPageEntries(page: DeckPage, deck: ContentDeck): string {
  if (page.kind === "contents") return renderContents(page.topics, deck);
  const readOnly = isPreview(deck);
  const rows = (entries: readonly LibraryEntry[], conversation = false, wordTile = false): string =>
    entries.map((entry, index) => renderCardRow(entry, deck.readingDisplay, {
      readOnly, conversation, wordTile,
      alternative: conversation && index > 0 && entry.occurrence?.speaker !== undefined
        && entry.occurrence.speaker === entries[index - 1].occurrence?.speaker,
    })).join("");
  if (page.kind === "topic") {
    const section = (title: string, key: string, entries: LibraryEntry[], conversation = false): string =>
      `<section class="topic-section" data-topic-section="${key}">
        <h2 class="section-label">${title}</h2>
        <div class="${key === "vocab" ? "topic-word-grid" : "topic-card-list"}"
          data-reorder-region="${key}">${rows(entries, conversation, key === "vocab")}</div>
      </section>`;
    return section("Essential phrases", "essentials", page.essentials)
      + (page.vocab.length ? section("Useful words", "vocab", page.vocab) : "")
      + section("Conversation", "dialogue", page.dialogue, true);
  }
  if (page.kind === "starred" && page.entries.length === 0) {
    return '<div class="deck-view-empty text-center fg-secondary"><p>No starred cards yet.</p><p>Star cards in this phrasebook to review them here.</p></div>';
  }
  return `<div class="topic-card-list"${page.kind === "starred" ? "" : ` data-reorder-region="${page.kind}"`}>${rows(page.entries)}</div>`;
}

function renderPageTab(page: DeckPage, activePageKey: string): string {
  const selected = page.key === activePageKey;
  const starred = page.kind === "starred";
  const label = starred ? `Starred, ${page.entries.length} cards` : page.title;
  const id = escapeHTML(encodeURIComponent(page.key));
  return `
    <button
      id="deck-page-tab-${id}"
      class="deck-tab${starred ? " deck-star-tab" : ""} tappable"
      type="button"
      role="tab"
      data-action="content/set-page"
      data-page-key="${escapeHTML(page.key)}"
      aria-controls="deck-page-${id}"
      aria-selected="${selected}"
      tabindex="${selected ? "0" : "-1"}"
      title="${escapeHTML(label)}"
      aria-label="${escapeHTML(label)}"
    >${starred
      ? `${icon("star-fill")}<span class="deck-star-count" aria-hidden="true">${page.entries.length}</span>`
      : `<span>${escapeHTML(page.title)}</span>`}</button>
  `;
}

export function renderDeckPager(
  deck: ContentDeck,
  entries: readonly LibraryEntry[],
  groups: readonly Group[],
  requestedPageKey: string | null,
): string {
  const pages = getDeckPages(entries, groups);
  const activePageKey = normalizePageKey(entries, groups, requestedPageKey);
  const starredPage = pages.find((page) => page.kind === "starred");

  return `
    <div class="deck-pager flex-1 min-h-0 flex-col" data-region="deck-pager">
      <div class="deck-tabs" data-region="deck-tabs" role="tablist" aria-label="Phrasebook pages">
        <div class="deck-pinned-slot">${starredPage ? renderPageTab(starredPage, activePageKey) : ""}</div>
        <div class="deck-tab-scroll" data-region="deck-tab-scroll">
          ${pages.filter((page) => page.kind !== "starred").map((page) => renderPageTab(page, activePageKey)).join("")}
        </div>
      </div>
      <div class="deck-star-status" data-region="starred-status" role="status" aria-live="polite" aria-atomic="true"></div>
      <div class="deck-pages flex-1 min-h-0" data-region="deck-pages" aria-label="Swipe between phrasebook pages">
        ${pages.map((page) => {
          const selected = page.key === activePageKey;
          const id = escapeHTML(encodeURIComponent(page.key));
          return `
            <section
              id="deck-page-${id}"
              class="deck-page"
              role="tabpanel"
              aria-labelledby="deck-page-tab-${id}"
              data-page-key="${escapeHTML(page.key)}"
              data-page-kind="${page.kind}"
              tabindex="0"
              ${selected ? "" : "inert"}
            >
              <div class="deck-page-list flex-col" data-region="card-list">
                ${renderPageEntries(page, deck)}
              </div>
            </section>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

/** Language browse is independent of phrasebook topic pages. */
export function renderBrowseCardsHTML(
  deck: ContentDeck,
  entries: readonly LibraryEntry[],
  _groups: readonly Group[],
): string {
  const sections = [
    { type: "phrase", title: "Translations" },
    { type: "word", title: "Words" },
    { type: "chunk", title: "Chunks" },
  ].map((section) => ({
    ...section, entries: entries.filter((entry) => entry.card.type === section.type),
  })).filter((section) => section.entries.length > 0);
  if (sections.length === 0) {
    return '<div class="deck-view-empty text-center fg-secondary"><p>No cards in this library.</p></div>';
  }
  return sections.map((section) => `
    <h2 class="deck-view-section-header section-label">${section.title}</h2>
    <div class="card-group"><div class="card-group-rows">
      ${section.entries.map((entry) => renderCardRow(entry, deck.readingDisplay, {
        readOnly: isPreview(deck), conversation: false,
      })).join("")}
    </div></div>`).join("");
}

export function renderDeckBody(
  deck: ContentDeck | null,
  entries: readonly LibraryEntry[],
  groups: readonly Group[],
  pageKey: string | null,
): string {
  if (!deck) return "";
  const browse = isSystem(deck);
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
    ${browse || isPreview(deck)
      ? ""
      : `<div class="deck-view-action-bar shrink-0 flex items-center justify-center"${pageKey === STARRED_PAGE_KEY ? "" : " hidden"}>
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
