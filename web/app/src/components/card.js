import { icon } from "./icon.js";

/**
 * Renders a card as a list row. The star is an inline toggle at the row's
 * top-right (Figma "Term", node 754:7053: outline star when unstarred, filled
 * accent star when starred) — tapping it fires `content/star-card`; tapping
 * anywhere else on the row body speaks the card via `content/play-card` (the
 * delegate resolves to the nearest [data-action], so the star wins over the
 * row). Edit/delete remain behind a left swipe-to-reveal (see
 * content-pane-gestures.js).
 *
 * @param {Object} card
 * @param {string} readingDisplay - 'reading' | 'romanization'
 * @returns {string} HTML string
 */
export function renderCardRow(card, readingDisplay = "reading") {
  const isStarred = !!card.state?.starredAt;
  return `
    <div class="card-row-wrapper shrink-0 overflow-hidden" data-card-id="${card.id}">
      <div class="inset flex-row reverse items-center gap-md">
        <button
          class="icon-button bg-blue fg-white tappable"
          data-action="content/edit-card"
          data-card-id="${card.id}"
          aria-label="Edit"
        >${icon("edit")}</button>

        <button
          class="icon-button bg-danger fg-white tappable"
          data-action="content/delete-card"
          data-card-id="${card.id}"
          aria-label="Delete"
        >${icon("delete")}</button>
      </div>

      <div class="card-row flex-row items-start justify-between tappable" data-action="content/play-card" data-card-id="${card.id}" data-starred="${isStarred}">
        ${renderCardContent(card, readingDisplay)}
        <button
          class="card-star tappable shrink-0"
          data-action="content/star-card"
          data-card-id="${card.id}"
          aria-label="${isStarred ? "Unstar" : "Star"}"
          data-selected="${isStarred}"
        >${icon(isStarred ? "star-fill" : "star")}</button>
        <div class="card-row-reorder-handle shrink-0" aria-hidden="true">
          ${icon("reorder")}
        </div>
      </div>
    </div>
  `;
}

// Phrasebook term card — matches the Figma "Term" component (node 754:7053):
// the target-language term (large, body color) with inline per-character ruby
// readings on top, its English translation (smaller, muted) stacked beneath —
// a left-aligned vertical stack, no divider, no visible play control (tapping
// the row itself plays audio; see renderCardRow). Starred state is shown by
// the inline star toggle in renderCardRow, not a text prefix.
function renderCardContent(card, readingDisplay = "reading") {
  // Furigana ruby only when displaying 'reading' and structured tokens exist;
  // otherwise the reading renders as a plain line below the term.
  const hasRuby = readingDisplay === "reading" && Array.isArray(card.reading);
  const cjk = hasRuby ? renderRuby(card.reading) : card.text;
  const reading = card[readingDisplay] || "";

  return `
    <div class="card-term flex-col flex-1 min-w-0" ${hasRuby ? "data-has-ruby" : ""}>
      <div class="card-term-target fg-body">${cjk}</div>
      ${hasRuby ? "" : `<div class="card-term-reading text-body2">${reading}</div>`}
      <div class="card-term-english fg-secondary">${card.translation || ""}</div>
    </div>
  `;
}

/**
 * Renders a ReadingToken array as HTML with <ruby> tags.
 *
 * @param {Array} tokens - Array of [base, annotation|null]
 * @returns {string} HTML string
 */
export function renderRuby(tokens) {
  if (!Array.isArray(tokens)) return tokens || "";
  return tokens
    .map(([base, annotation]) => {
      if (annotation) {
        return `<ruby>${base}<rt>${annotation}</rt></ruby>`;
      }
      return base;
    })
    .join("");
}
