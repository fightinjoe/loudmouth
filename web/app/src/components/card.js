import { icon } from "./icon.js";
import { escapeHTML } from "../js/utils.js";


/**
 * Renders a card as a tappable phrase row. Conversation metadata remains
 * JSON-encoded in `notes`; the wrapper exposes only the layout flags the
 * phrasebook pager needs. Speaker identity is communicated by side and color
 * rather than repeated labels. `notes.or` adds a small alternative marker
 * immediately before the phrase.
 *
 * @param {Object} card
 * @param {string} readingDisplay - 'reading' | 'romanization'
 * @returns {string} HTML string
 */
export function renderCardRow(card, readingDisplay = "reading") {
  const cardId = escapeHTML(card.id);
  const isStarred = !!card.state?.starredAt;
  const { speaker, alternative } = readConversationMeta(card.notes);
  return `
    <div
      class="card-row-wrapper shrink-0 overflow-hidden"
      ${speaker ? `data-speaker="${speaker}"` : ""}
      ${alternative ? "data-alternative" : ""}
      data-card-id="${cardId}"
    >
      ${alternative
        ? `<div class="card-alternative" ${speaker ? `data-speaker="${speaker}"` : ""}>or</div>`
        : ""}
      <div class="inset flex-row reverse items-center gap-md">
        <button
          class="icon-button bg-blue fg-white tappable"
          data-action="content/edit-card"
          data-card-id="${cardId}"
          aria-label="Edit"
        >${icon("edit")}</button>

        <button
          class="icon-button bg-danger fg-white tappable"
          data-action="content/delete-card"
          data-card-id="${cardId}"
          aria-label="Delete"
        >${icon("delete")}</button>
      </div>

      <div class="card-row flex-row items-start tappable" data-action="content/open-card" data-card-id="${cardId}">
        ${renderCardContent(card, readingDisplay)}
        ${card.type !== "word" ? `<button
          class="card-audio tappable"
          data-action="content/play-card"
          data-card-id="${cardId}"
          aria-label="Play pronunciation: ${escapeHTML(card.translation)}"
        >${icon("sound")}</button>` : ""}
        <button
          class="card-star tappable shrink-0"
          data-action="content/star-card"
          data-card-id="${cardId}"
          aria-label="${isStarred ? "Unstar" : "Star"}: ${escapeHTML(card.translation)}"
          aria-pressed="${isStarred}"
          data-selected="${isStarred}"
        >${icon(isStarred ? "star-fill" : "star")}</button>
        <div class="card-row-reorder-handle shrink-0" aria-hidden="true">
          ${icon("reorder")}
        </div>
      </div>
    </div>
  `;
}

function readConversationMeta(notes) {
  try {
    const metadata = JSON.parse(notes);
    return {
      speaker: metadata?.speaker === "you" || metadata?.speaker === "partner"
        ? metadata.speaker
        : null,
      alternative: metadata?.or === true,
    };
  } catch {
    // Older cards can have plain-text notes rather than conversation metadata.
    return { speaker: null, alternative: false };
  }
}

// Phrasebook term card — English above the target-language text. Japanese
// uses either its original script (with available furigana) or romanization.
// The star is absolutely positioned beside the first line.
function renderCardContent(card, readingDisplay = "reading") {
  const japanese = card.lang === "ja";
  const showRomaji = japanese && readingDisplay === "romanization"
    && typeof card.romanization === "string" && card.romanization.trim() !== "";
  const hasRuby = !showRomaji && (japanese || readingDisplay === "reading")
    && Array.isArray(card.reading) && card.reading.length > 0;
  const target = showRomaji
    ? escapeHTML(card.romanization)
    : hasRuby ? renderRuby(card.reading) : escapeHTML(card.text);
  const reading = !japanese && !hasRuby ? escapeHTML(card[readingDisplay]) : "";

  return `
    <button type="button" class="card-term flex-col flex-1 min-w-0"
      aria-label="${card.type === "word" ? "Play pronunciation" : "Explore phrase"}: ${escapeHTML(card.translation)}"
      ${hasRuby ? "data-has-ruby" : ""}>
      <span class="card-term-english fg-secondary">${escapeHTML(card.translation)}</span>
      <span class="card-term-target fg-body" lang="${escapeHTML(card.lang)}">${target}</span>
      ${reading ? `<span class="card-term-reading">${reading}</span>` : ""}
      ${card.type !== "word" ? '<span class="card-explore-cue">Explore phrase</span>' : ""}
    </button>
  `;
}

/**
 * Renders a ReadingToken array as HTML with <ruby> tags.
 *
 * @param {Array} tokens - Array of [base, annotation|null]
 * @returns {string} HTML string
 */
export function renderRuby(tokens) {
  if (!Array.isArray(tokens)) return escapeHTML(tokens);
  return tokens
    .map(([base, annotation]) => {
      const escapedBase = escapeHTML(base);
      if (annotation) {
        return `<ruby>${escapedBase}<rt>${escapeHTML(annotation)}</rt></ruby>`;
      }
      return escapedBase;
    })
    .join("");
}
