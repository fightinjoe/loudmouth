import { icon } from "./icon.js";

/**
 * Renders a card as a list row with swipe-to-reveal star/edit buttons behind it.
 * Star and edit buttons are rendered absolutely behind the row; the row slides
 * left via CSS transform to expose them (see content-pane-gestures.js).
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
          class="icon-button bg-yellow fg-white tappable"
          data-action="content/star-card"
          data-card-id="${card.id}"
          aria-label="${isStarred ? "Unstar" : "Star"}"
          data-selected="${isStarred}"
        >${icon("star")}</button>

        <button
          class="icon-button bg-danger fg-white tappable"
          data-action="content/delete-card"
          data-card-id="${card.id}"
          aria-label="Delete"
        >${icon("delete")}</button>
      </div>

      <div class="card-row flex-col" data-card-id="${card.id}">
        ${renderCardContent(card, readingDisplay)}
        <div class="card-row-reorder-handle shrink-0" aria-hidden="true">
          ${icon("reorder")}
        </div>
      </div>
    </div>
  `;
}

// Phrasebook term card — matches the Figma "Term" component (node 606:6505):
// the English translation on top, a divider with an inline audio control, then
// the target-language term (blue) with its reading below. The star prefix (★)
// is prepended in JS because it is text content, not a display toggle.
function renderCardContent(card, readingDisplay = "reading") {
  const isStarred = !!card.state?.starredAt;
  const starPrefix = isStarred ? "★ " : "";

  // Furigana ruby only when displaying 'reading' and structured tokens exist;
  // otherwise the reading renders as a plain line below the term.
  const hasRuby = readingDisplay === "reading" && Array.isArray(card.reading);
  const cjk = hasRuby ? renderRuby(card.reading) : card.text;
  const reading = card[readingDisplay] || "";

  return `
    <div class="card-term flex-col" ${hasRuby ? "data-has-ruby" : ""}>
      <div class="card-term-english text-card-title fg-body">${card.translation || ""}</div>
      <div class="card-term-divider flex items-center gap-sm">
        <span class="card-term-rule flex-1"></span>
        <button
          class="card-row-play icon-button fg-tertiary shrink-0 tappable"
          data-action="content/play-card"
          data-card-id="${card.id}"
          aria-label="Play"
        >${icon("sound")}</button>
      </div>
      <div class="card-term-target flex-col">
        <div class="card-term-cjk text-card-title fg-accent">${starPrefix}${cjk}</div>
        <div class="card-term-reading text-body1">${reading}</div>
      </div>
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
