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
        >${icon("Edit")}</button>

        <button
          class="icon-button bg-yellow fg-white tappable"
          data-action="content/star-card"
          data-card-id="${card.id}"
          aria-label="${isStarred ? "Unstar" : "Star"}"
          data-selected="${isStarred}"
        >${icon("Star")}</button>

        <button
          class="icon-button bg-danger fg-white tappable"
          data-action="content/delete-card"
          data-card-id="${card.id}"
          aria-label="Delete"
        >${icon("Delete")}</button>
      </div>

      <div
        class="card-row flex-row items-center bg-surface gap-auto tappable"
        data-action="content/open-card"
        data-card-id="${card.id}"
      >
        ${renderCardContent(card, readingDisplay)}

        <button
          class="card-row-play fg-tertiary text-body1 shrink-0 tappable"
          data-action="content/play-card"
          data-card-id="${card.id}"
          aria-label="Play"
        >
          ▶
        </button>

        <div class="card-row-reorder-handle shrink-0" aria-hidden="true">
          ${icon("Reorder")}
        </div>
      </div>
    </div>
  `;
}

// renderCardContent is shared by renderCard and renderCardRow. It renders two
// parallel representations of the card — .card-primary and .card-secondary —
// so that CSS ancestor selectors ([data-mode="..."]) can show/hide the correct
// one without any JS involvement. Both contain .card-translation intentionally:
// .card-primary shows it in reverse mode; .card-secondary shows it in review mode.
//
// The star prefix (★) is prepended in JS rather than CSS because it modifies
// text content, not display — CSS cannot prepend to text nodes.
function renderCardContent(card, readingDisplay = "reading") {
  const reading = card[readingDisplay] || "";
  const isStarred = !!card.state?.starredAt;
  const starPrefix = isStarred ? "★ " : "";

  // Use ruby rendering if structured tokens are available and we are displaying 'reading'
  const hasRuby = readingDisplay === "reading" && Array.isArray(card.reading);
  const displayText = hasRuby
    ? starPrefix + renderRuby(card.reading)
    : starPrefix + card.text;

  return `
    <div class="card-content flex-col gap-sm" ${hasRuby ? "data-has-ruby" : ""}>
      <div class="card-primary text-h2">
        <span class="card-text fg-body">${displayText}</span>
        <span class="card-translation">${card.translation}</span>
      </div>
      <div class="card-secondary flex-col text-body2 fg-caption">
        <span class="card-reading">${reading}</span>
        <span class="card-translation">${card.translation}</span>
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
