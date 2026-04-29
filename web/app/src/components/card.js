/**
 * Renders a full card (used in older non-review contexts).
 *
 * @param {Object} card
 * @param {string} mode          - 'study' | 'review' | 'reverse'
 * @param {string} readingDisplay - 'reading' | 'romanization'
 * @returns {string} HTML string
 */
export function renderCard(card, mode, readingDisplay = 'reading') {
  return `
    <div
      class="card"
      data-card-id="${card.id}"
      data-card-mode="${mode}"
    >
      ${ renderCardContent(card, readingDisplay) }

      <div class="answer">
        <div class="skeleton"></div>
        <div class="translation">${ card.translation }</div>
        <div class="notes">${ card.notes }</div>
      </div>
    </div>
  `;
}

/**
 * Renders a card as a list row with swipe-to-reveal star/edit buttons behind it.
 * Star and edit buttons are rendered absolutely behind the row; the row slides
 * left via CSS transform to expose them (see wireRevealGesture in gestures.js).
 *
 * @param {Object} card
 * @param {string} readingDisplay - 'reading' | 'romanization'
 * @returns {string} HTML string
 */
export function renderCardRow(card, readingDisplay = 'reading') {
  const isStarred = !!card.state?.starredAt;
  return `
    <div class="card-row-wrapper" data-card-id="${card.id}">
      <button
        class="card-row-star-btn tappable"
        data-card-id="${card.id}"
        aria-label="${isStarred ? 'Unstar' : 'Star'}"
        data-starred="${isStarred}"
      >${isStarred ? '★' : '☆'}</button>
      <button
        class="card-row-edit-btn tappable"
        data-card-id="${card.id}"
        aria-label="Edit"
      >Edit</button>
      <div
        class="card-row flex-row gap-auto tappable"
        data-card-id="${card.id}"
      >
        ${ renderCardContent(card, readingDisplay) }

        <button
          class="card-row-play tappable"
          data-card-id="${card.id}"
          aria-label="Play"
        >
          ▶
        </button>
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
function renderCardContent(card, readingDisplay = 'reading') {
  const reading = card[readingDisplay] || ''
  const displayText = card.state?.starredAt ? `★ ${card.text}` : card.text;
  return `
    <div class="card-content flex-col gap-sm">
      <div class="card-primary text-h2">
        <span class="card-text">${displayText}</span>
        <span class="card-translation">${card.translation}</span>
      </div>
      <div class="card-secondary flex-col text-body2 text-caption">
        <span class="card-reading">${reading}</span>
        <span class="card-translation">${card.translation}</span>
      </div>
    </div>
  `;
}