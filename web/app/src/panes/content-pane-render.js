/**
 * Content pane — pure render helpers.
 *
 * Real phrasebooks render as a stable horizontal pager: one page for
 * ungrouped translations (when present), one per conversation context, and
 * a final vocabulary page. Suggested previews and virtual language decks
 * retain their existing single-list browse treatment.
 */
import { renderCardRow } from "../components/card.js";
import { icon } from "../components/icon.js";
import { renderPaneHeader, headerIconButton, headerTitle, headerSpacer } from "../components/pane-header.js";
import { escapeHTML } from "../js/utils.js";


const TRANSLATIONS_PAGE_KEY = "translations";
const VOCAB_PAGE_KEY = "vocab";

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
 * Builds the ordered navigation model used by both the tab strip and pages.
 * Context-less phrases live in a dedicated Translations page. Named
 * conversations retain the order in which their first card appears in the
 * phrasebook, and Vocab is always the final page, even when it is empty.
 */
export function getDeckPages(cards = []) {
  const translations = [];
  const conversations = new Map();
  const vocabulary = [];

  for (const card of cards) {
    if (card.type === "word") {
      vocabulary.push(card);
    } else if (!card.context) {
      translations.push(card);
    } else {
      if (!conversations.has(card.context)) conversations.set(card.context, []);
      conversations.get(card.context).push(card);
    }

  }

  const pages = [];
  if (translations.length) {
    pages.push({
      key: TRANSLATIONS_PAGE_KEY,
      title: "Translations",
      kind: "conversation",
      cards: [...translations].sort(
        (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
      ),
    });
  }
  for (const [title, conversationCards] of conversations) {
    pages.push({
      key: `context:${title}`,
      title,
      kind: "conversation",
      cards: conversationCards,
    });
  }
  pages.push({
    key: VOCAB_PAGE_KEY,
    title: "Vocab",
    kind: "vocab",
    cards: vocabulary,
  });
  return pages;
}

export function normalizePageKey(cards, requestedKey) {
  const pages = getDeckPages(cards);
  return pages.some((page) => page.key === requestedKey) ? requestedKey : pages[0].key;
}

function renderPageCards(page, readingDisplay) {
  if (!page.cards.length) {
    return `<p class="deck-view-empty fg-secondary">${
      page.kind === "vocab"
        ? "No vocabulary in this phrasebook."
        : "No phrases in this conversation."
    }</p>`;
  }
  return page.cards.map((card) => renderCardRow(card, readingDisplay)).join("");
}

export function renderDeckPager(deck, cards, requestedPageKey) {
  const pages = getDeckPages(cards);
  const activePageKey = normalizePageKey(cards, requestedPageKey);

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
                ${renderPageCards(page, deck.readingDisplay)}
              </div>
            </section>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

/**
 * Virtual language decks and suggested previews are deliberately not paged.
 * They retain the established grouped list so those browse/read-only modes
 * do not acquire production phrasebook navigation controls.
 */
export function renderBrowseCardsHTML(deck, cards) {
  if (!deck) return "";
  cards = cards.filter((card) => card.type !== "word");
  if (!cards.length) {
    return `<div class="deck-view-empty text-center fg-secondary"><p>No cards in this deck.</p></div>`;
  }

  const sections = new Map();
  for (const card of cards) {
    const key = card.context || null;
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(card);
  }

  const standalone = sections.get(null) || [];
  sections.delete(null);
  const hasGroups = sections.size > 0;
  const standaloneHTML = standalone.length
    ? `${hasGroups ? `<div class="deck-view-section-header section-label">Translations</div>` : ""}
       ${[...standalone]
         .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
         .map((card) => renderCardRow(card, deck.readingDisplay))
         .join("")}`
    : "";
  const groupsHTML = [...sections]
    .map(([title, groupCards]) => `
      <div class="deck-view-section-header section-label">${escapeHTML(title)}</div>
      <div class="card-group">
        <div class="card-group-rows">
          ${groupCards.map((card) => renderCardRow(card, deck.readingDisplay)).join("")}
        </div>
      </div>
    `)
    .join("");
  return `${standaloneHTML}${groupsHTML}`;
}

export function renderDeckBody(deck, cards, pageKey) {
  if (!deck) return "";
  const pager = deck.system || deck.preview
    ? `<div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto" data-region="card-list">
         ${renderBrowseCardsHTML(deck, cards)}
       </div>`
    : renderDeckPager(deck, cards, pageKey);

  return `
    ${renderHeader(deck)}
    ${pager}
    ${deck.system || deck.preview
      ? ""
      : `<div class="deck-view-action-bar shrink-0 flex items-center justify-center">
           <div class="deck-view-action-pill flex items-center">
             <button class="deck-view-action-btn flex-col items-center" data-action="content/review" aria-label="Review">${icon("review")}<span>Review</span></button>
           </div>
         </div>`}
  `;
}

/**
 * Browse-view header — a back button (returns to the current deck/empty
 * state) and a centered title.
 */
function renderBrowseHeader(title) {
  return renderPaneHeader({
    leading: headerIconButton("back", { action: "content/browse-back", label: "Back" }),
    title: headerTitle(title),
    trailing: headerSpacer(),
  });
}

export function renderBrowseBody(browse) {
  if (!browse) return "";
  return `
    ${renderBrowseHeader(browse.title)}
    <div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto" data-region="browse-list">
      ${browse.groupsHtml}
    </div>
  `;
}
