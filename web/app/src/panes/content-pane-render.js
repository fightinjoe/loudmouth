/**
 * Content pane — pure render helpers.
 *
 * No DOM access, no side effects, no closures over mutable state. Each
 * function returns an HTML string. See web/docs/PANE_PROTOCOL.html Rule 4.
 */
import { renderCardRow } from "../components/card.js";
import { icon } from "../components/icon.js";

export function renderEmptyState() {
  return `
    <div class="deck-view-empty text-center fg-secondary">
      <p>No decks yet.</p>
      <button data-action="content/import-cards" class="btn btn-primary">Import cards</button>
    </div>
  `;
}

export function renderHeader(deck) {
  if (!deck) return "";
  return `
    <div class="pane-header flex items-center">
      <button class="icon-button" data-action="content/menu" aria-label="Menu">${icon("Menu")}</button>
      <button class="pane-header-title flex-1 text-center text-header fg-body tappable" data-action="content/deck-title">${deck.name}</button>
      ${deck.system
        ? `<span class="pane-header-spacer shrink-0"></span>`
        : `<button class="icon-button" data-action="content/add-card" aria-label="Translate">${icon("Add")}</button>
           <button class="icon-button deck-header-done" data-action="content/done" aria-label="Done">${icon("Done")}</button>`}
    </div>
  `;
}

export function renderCardsHTML(deck, cards) {
  if (!deck) return "";
  if (cards.length === 0) {
    return `<div class="deck-view-empty text-center fg-secondary"><p>No cards in this deck.</p></div>`;
  }
  return cards.map((c) => renderCardRow(c, deck.readingDisplay)).join("");
}

export function renderDeckBody(deck, cards) {
  if (!deck) return renderEmptyState();
  return `
    ${renderHeader(deck)}
    <div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto" data-region="card-list">
      ${renderCardsHTML(deck, cards)}
    </div>
    ${deck.system
      ? ""
      : `<div class="deck-view-add-cards-bar shrink-0 flex items-center px-5 py-4">
           <button class="deck-view-add-cards-btn flex-1 text-body1 fg-tertiary surface-field" data-action="content/edit-add-cards" aria-label="Add cards">Add cards</button>
         </div>`}
  `;
}
