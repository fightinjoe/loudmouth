import type { ReadingToken } from "@catchphrase/card-schema";
import type { LibraryEntry, ReadingDisplay } from "../js/library-types";
import { escapeHTML } from "../js/utils";
import { icon } from "./icon";
import { renderSourceContext } from "./source-context";

export interface RenderCardRowOptions {
  readOnly?: boolean;
}

/**
 * Renders one joined library entry. Occurrence metadata controls conversation
 * layout, while membership state controls whether phrasebook-scoped starring
 * is available.
 */
export function renderCardRow(
  entry: LibraryEntry,
  readingDisplay: ReadingDisplay = "reading",
  { readOnly = false }: RenderCardRowOptions = {},
): string {
  const { card, occurrence } = entry;
  const entryKey = escapeHTML(entry.key);
  const cardId = escapeHTML(entry.cardId);
  const isStarred = entry.membership?.starredAt != null;
  const speaker = occurrence?.speaker;
  const alternative = occurrence?.alternative === true;
  const canStar = !readOnly && entry.membership !== undefined;
  const editActions = readOnly
    ? ""
    : `
      <div class="inset flex-row reverse items-center gap-md">
        <button
          class="icon-button bg-blue fg-white tappable"
          data-action="content/edit-card"
          data-entry-key="${entryKey}"
          aria-label="Edit"
        >${icon("edit")}</button>

        <button
          class="icon-button bg-danger fg-white tappable"
          data-action="content/delete-card"
          data-entry-key="${entryKey}"
          aria-label="Delete"
        >${icon("delete")}</button>
      </div>`;

  return `
    <div
      class="card-row-wrapper shrink-0 overflow-hidden"
      ${speaker ? `data-speaker="${speaker}"` : ""}
      ${alternative ? "data-alternative" : ""}
      data-entry-key="${entryKey}"
      data-card-id="${cardId}"
    >
      ${alternative
        ? `<div class="card-alternative" ${speaker ? `data-speaker="${speaker}"` : ""}>or</div>`
        : ""}
      ${editActions}

      <div class="card-row flex-row items-start tappable"
        data-action="content/open-card"
        data-entry-key="${entryKey}"
        >
        ${renderCardContent(entry, readingDisplay)}
        ${card.type !== "word" ? `<button
          class="card-audio tappable"
          data-action="content/play-card"
          data-entry-key="${entryKey}"
          aria-label="Play pronunciation: ${escapeHTML(card.translation)}"
        >${icon("sound")}</button>` : ""}
        ${canStar ? `<button
          class="card-star tappable shrink-0"
          data-action="content/star-card"
          data-entry-key="${entryKey}"
          data-card-id="${cardId}"
          aria-label="${isStarred ? "Unstar" : "Star"}: ${escapeHTML(card.translation)}"
          aria-pressed="${isStarred}"
          data-selected="${isStarred}"
        >${icon(isStarred ? "star-fill" : "star")}</button>` : ""}
        <div class="card-row-reorder-handle shrink-0" aria-hidden="true">
          ${icon("reorder")}
        </div>
      </div>
    </div>
  `;
}

function renderCardContent(
  entry: LibraryEntry,
  readingDisplay: ReadingDisplay,
): string {
  const { card } = entry;
  const japanese = card.lang === "ja";
  const showRomaji = japanese
    && readingDisplay === "romanization"
    && card.romanization !== undefined;
  const hasRuby = !showRomaji
    && (japanese || readingDisplay === "reading")
    && card.reading !== undefined;
  const target = card.type === "chunk"
    ? renderSourceContext(card.source.snapshot, card.source.span)
    : showRomaji
      ? escapeHTML(card.romanization)
      : hasRuby
        ? renderRuby(card.reading)
        : escapeHTML(card.text);
  const reading = !japanese && !hasRuby && readingDisplay === "romanization"
    ? escapeHTML(card.romanization)
    : "";
  const actionLabel = card.type === "phrase" ? "Explore phrase" : "Play pronunciation";

  return `
    <button type="button" class="card-term flex-col flex-1 min-w-0"
      aria-label="${actionLabel}: ${escapeHTML(card.translation)}"
      ${hasRuby ? "data-has-ruby" : ""}>
      <span class="card-term-english fg-secondary">${escapeHTML(card.translation)}</span>
      <span class="card-term-target fg-body" lang="${escapeHTML(card.lang)}">${target}</span>
      ${reading ? `<span class="card-term-reading">${reading}</span>` : ""}
      ${card.type === "word" && card.definition ? `<span class="card-term-definition">${escapeHTML(card.definition)}</span>` : ""}
      ${card.type === "phrase" ? '<span class="card-explore-cue">Explore phrase</span>' : ""}
    </button>
  `;
}

/** Renders a ReadingToken array as safe HTML with ruby annotations. */
export function renderRuby(tokens: readonly ReadingToken[] | undefined): string {
  if (!tokens) return "";
  return tokens
    .map(([base, annotation]) => {
      const escapedBase = escapeHTML(base);
      return annotation
        ? `<ruby>${escapedBase}<rt>${escapeHTML(annotation)}</rt></ruby>`
        : escapedBase;
    })
    .join("");
}
