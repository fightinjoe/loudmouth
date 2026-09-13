/**
 * Content pane — pure render helpers.
 *
 * No DOM access, no side effects, no closures over mutable state. Each
 * function returns an HTML string. See web/docs/PANE_PROTOCOL.html Rule 4.
 */
import { renderCardRow } from "../components/card.js";
import { icon } from "../components/icon.js";
import { renderPaneHeader, headerIconButton, headerTitle, headerSpacer } from "../components/pane-header.js";

export function renderHeader(deck) {
  if (!deck) return "";
  return renderPaneHeader({
    leading: headerIconButton("menu", { action: "content/menu", label: "Menu" }),
    title: headerTitle(deck.name, { action: "content/deck-title" }),
    trailing: deck.preview
      ? `<button class="deck-header-save-pill tappable" data-action="content/save-preview" aria-label="Save">Save</button>`
      : deck.system
      ? headerSpacer()
      : `<button class="icon-button deck-header-done" data-action="content/done" aria-label="Done">${icon("check")}</button>`,
  });
}

/**
 * Renders the phrasebook's saved cards, sectioned by their `context` field
 * (docs/CARD_SCHEMA.md 'Group context' — set by the service on save: a
 * group-sourced card carries its group's title, a standalone look-up term
 * carries none). docs/journeys.md Journey 1 step 10 + Journey 3 key detail 2:
 *
 *   - Standalone (context-less) terms accumulate under a generic
 *     "Translations" section, newest-first — but ONLY once there's another
 *     section to distinguish them from (a phrasebook holding only
 *     standalone terms shows them plain/ungrouped, matching Journey 1's
 *     freshly-created single-term screenshot, which has no header at all).
 *   - Group-sourced terms are sectioned under their group's title, in
 *     save order. Sections are ordered by each section's earliest card
 *     (oldest-first), with "Translations" always first when present.
 */
export function renderCardsHTML(deck, cards, tab = "conversations") {
  if (!deck) return "";
  if (tab === "starred") {
    cards = cards.filter((c) => c.state?.starredAt);
    if (cards.length === 0) {
      return `<div class="deck-view-empty text-center fg-secondary"><p>No starred terms yet. Tap the star on a card to save it here.</p></div>`;
    }
  } else if (tab === "vocab") {
    // Vocab is determined only by card type; provenance in `context` remains
    // intact and does not affect which tab owns the card.
    const words = cards.filter((c) => c.type === "word");
    if (words.length === 0) {
      return `<div class="deck-view-empty text-center fg-secondary"><p>No vocabulary yet.</p></div>`;
    }
    return words.map((c) => renderCardRow(c, deck.readingDisplay)).join("");
  } else {
    // Conversations tab: everything that isn't a standalone vocabulary word —
    // the conversation groups (phrase cards) plus any ungrouped look-up terms.
    cards = cards.filter((c) => c.type !== "word");
  }
  if (cards.length === 0) {
    return `<div class="deck-view-empty text-center fg-secondary"><p>No cards in this deck.</p></div>`;
  }

  const sections = new Map(); // title|null -> Card[]
  for (const card of cards) {
    const key = card.context || null;
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(card);
  }

  const hasGroupSections = [...sections.keys()].some((k) => k !== null);
  if (!hasGroupSections) {
    // Only standalone terms exist yet — render flat, no header.
    return cards.map((c) => renderCardRow(c, deck.readingDisplay)).join("");
  }

  const standalone = sections.get(null) || [];
  sections.delete(null);

  // Order group sections by their earliest card (oldest first) — matches
  // the order groups would naturally have been explored/saved in.
  const groupSections = [...sections.entries()].sort(
    ([, a], [, b]) => (a[0]?.createdAt || "").localeCompare(b[0]?.createdAt || ""),
  );

  const standaloneHTML = standalone.length
    ? renderStandaloneSection(
        "Translations",
        [...standalone].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
        deck.readingDisplay,
      )
    : "";

  const groupsHTML = groupSections
    .map(([title, groupCards]) => renderGroupSection(title, groupCards, deck.readingDisplay))
    .join("");

  return `${standaloneHTML}${groupsHTML}`;
}

// Standalone translations remain a flat list above the named groups.
function renderStandaloneSection(title, cards, readingDisplay) {
  return `
    <div class="deck-view-section-header section-label">${escSection(title)}</div>
    ${cards.map((c) => renderCardRow(c, readingDisplay)).join("")}
  `;
}

// Named groups always show their complete conversation.
function renderGroupSection(title, cards, readingDisplay) {
  return `
    <div class="deck-view-section-header section-label">${escSection(title)}</div>
    <div class="card-group">
      <div class="card-group-rows">
        ${cards.map((c) => renderCardRow(c, readingDisplay)).join("")}
      </div>
    </div>
  `;
}

function escSection(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Phrasebook tabs: "Conversations" shows the conversation groups (phrase
// cards), "Vocab (N)" the vocabulary words, "Starred (N)" the starred terms.
// Only real phrasebooks get tabs — the lang: browse virtual deck and
// suggested-phrasebook previews render their list without them.
export function renderTabsBar(deck, cards, tab = "conversations") {
  if (!deck || deck.system || deck.preview) return "";
  const vocabCount = cards.filter((c) => c.type === "word").length;
  const starredCount = cards.filter((c) => c.state?.starredAt).length;
  return `
    <div class="deck-tabs flex items-center" data-region="deck-tabs">
      <button class="deck-tab tappable flex-1 text-center" data-action="content/set-tab" data-tab="conversations" data-active="${tab === "conversations"}">Conversations</button>
      <button class="deck-tab tappable flex-1 text-center" data-action="content/set-tab" data-tab="vocab" data-active="${tab === "vocab"}">Vocab (${vocabCount})</button>
      <button class="deck-tab tappable flex-1 flex items-center justify-center gap-sm" data-action="content/set-tab" data-tab="starred" data-active="${tab === "starred"}">${icon("star-fill", { size: "sm" })}<span>Starred (${starredCount})</span></button>
    </div>
  `;
}

export function renderDeckBody(deck, cards, tab = "conversations") {
  if (!deck) return "";
  return `
    ${renderHeader(deck)}
    ${renderTabsBar(deck, cards, tab)}
    <div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto" data-region="card-list">
      ${renderCardsHTML(deck, cards, tab)}
    </div>
    ${deck.system || deck.preview
      ? ""
      : `<div class="deck-view-action-bar shrink-0 flex items-center justify-center">
           <div class="deck-view-action-pill flex items-center">
             <button class="deck-view-action-btn flex-col items-center" data-action="content/add" aria-label="Add">${icon("add")}<span>Add</span></button>
             <button class="deck-view-action-btn flex-col items-center" data-action="content/review" aria-label="Review">${icon("review")}<span>Review</span></button>
           </div>
         </div>`}
  `;
}

/**
 * Browse-view header — a back button (returns to the current deck/empty
 * state) and a centered title. Reached from the nav pane's "View all"
 * links (Figma node 602:5562, "All phrasebooks").
 */
function renderBrowseHeader(title) {
  return renderPaneHeader({
    leading: headerIconButton("back", { action: "content/browse-back", label: "Back" }),
    title: headerTitle(title),
    trailing: headerSpacer(),
  });
}

/**
 * Browse-view body — the header plus caller-supplied, pre-rendered group
 * HTML (grouped-by-language phrasebook rows, or a flat suggested-phrasebook
 * list). The groups themselves are built by whichever pane requested the
 * browse (currently the nav pane), since the row shape — deck chevron rows
 * vs. suggestion pill rows — and their click actions differ by kind.
 */
export function renderBrowseBody(browse) {
  if (!browse) return "";
  return `
    ${renderBrowseHeader(browse.title)}
    <div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto" data-region="browse-list">
      ${browse.groupsHtml}
    </div>
  `;
}
