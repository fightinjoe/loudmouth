import { cardIdentity } from "@catchphrase/card-schema";
import type {
  BreakdownChunk,
  Candidate,
  Snapshot,
  Word,
} from "@catchphrase/card-schema";
import type { DetailsReadyState, DetailsState } from "../panes/details-pane";
import { escapeHTML } from "../js/utils";
import { icon } from "./icon";
import { renderRuby } from "./card";
import { readingTokens, renderRange } from "./source-context";

function sourceSnapshot(slice: DetailsState): Snapshot {
  const card = slice.entry.card;
  if (card.type !== "phrase") throw new Error("Phrase breakdown requires a Phrase entry.");
  return {
    lang: card.lang,
    text: card.text,
    translation: slice.entry.occurrence?.translation ?? card.translation,
    ...(card.reading === undefined ? {} : { reading: card.reading }),
    ...(card.romanization === undefined ? {} : { romanization: card.romanization }),
  };
}

function renderPhrase(slice: DetailsState): string {
  const snapshot = sourceSnapshot(slice);
  const tokens = readingTokens(
    snapshot,
    slice.showReadings && slice.readingDisplay === "reading",
  );
  if (slice.status !== "ready") {
    return renderRange(snapshot, 0, snapshot.text.length, tokens);
  }

  let html = "";
  let offset = 0;
  slice.breakdown.chunks.forEach((chunk, index) => {
    html += renderRange(snapshot, offset, chunk.start, tokens);
    html += `<span class="details-phrase-part" role="button" tabindex="0"
      data-action="details/select-part" data-index="${index}"
      aria-label="${escapeHTML(chunk.text)}" aria-pressed="${slice.all || slice.selectedIndex === index}"
      aria-controls="details-explanations">${renderRange(snapshot, chunk.start, chunk.end, tokens)}</span>`;
    offset = chunk.end;
  });
  return html + renderRange(snapshot, offset, snapshot.text.length, tokens);
}

export function renderSource(slice: DetailsState, includeCue = false): string {
  const snapshot = sourceSnapshot(slice);
  const reading = slice.showReadings && slice.readingDisplay === "romanization"
    ? snapshot.romanization ?? ""
    : "";
  return `<div class="details-source-card card-term flex-col">
    ${slice.showEnglish
      ? `<span class="card-term-english fg-secondary">${escapeHTML(snapshot.translation)}</span>`
      : ""}
    <span class="card-term-target fg-body" lang="${escapeHTML(snapshot.lang)}">${renderPhrase(slice)}</span>
    ${reading ? `<span class="card-term-reading">${escapeHTML(reading)}</span>` : ""}
    ${includeCue ? '<span class="card-explore-cue details-source-cue">Explore phrase</span>' : ""}
    <button type="button" class="card-audio details-audio" data-action="details/play-audio"
      aria-label="Play pronunciation: ${escapeHTML(snapshot.translation)}">${icon("sound")}</button>
  </div>`;
}

function targetControl(
  slice: DetailsReadyState,
  candidate: Candidate,
  chunkIndex: number,
  kind: "word" | "chunk",
  wordIndex?: number,
): string {
  if (!slice.deck) return "";
  const identity = cardIdentity(candidate.card);
  const state = slice.targets[identity];
  const resolving = state === undefined;
  const pending = state?.pending === true;
  const starred = state?.starredAt != null;
  const label = `${starred ? "Unstar" : "Star"}: ${candidate.card.translation}`;
  return `<span class="details-target-action">
    <button type="button" class="details-target-star"
      data-action="details/toggle-target"
      data-target-identity="${escapeHTML(identity)}"
      data-target-kind="${kind}"
      data-chunk-index="${chunkIndex}"
      ${wordIndex === undefined ? "" : `data-word-index="${wordIndex}"`}
      data-selected="${starred}"
      aria-label="${escapeHTML(label)}"
      aria-pressed="${starred}"
      ${resolving || pending ? 'disabled aria-busy="true"' : ""}
    >${icon(starred ? "star-fill" : "star")}</button>
    <span class="details-target-error" data-target-identity="${escapeHTML(identity)}"
      role="alert" ${state?.error ? "" : "hidden"}>${escapeHTML(state?.error ?? "")}</span>
  </span>`;
}

function wordForm(word: Word, slice: DetailsReadyState): string {
  if (slice.showReadings && slice.readingDisplay === "reading" && word.reading) {
    return renderRuby(word.reading);
  }
  return escapeHTML(word.text);
}

function renderWord(
  slice: DetailsReadyState,
  candidate: Candidate,
  chunkIndex: number,
  wordIndex: number,
  primary: boolean,
): string {
  if (candidate.card.type !== "word") return "";
  const word = candidate.card;
  const secondaryReading = slice.showReadings && slice.readingDisplay === "romanization"
    ? word.romanization ?? ""
    : "";
  return `<li class="details-word" ${primary ? "data-primary-target" : ""}>
    <div class="details-word-copy">
      <span class="details-word-translation">${escapeHTML(word.translation)}</span>
      <span class="details-word-target" lang="${escapeHTML(word.lang)}">${wordForm(word, slice)}</span>
      ${secondaryReading
        ? `<span class="details-word-reading">${escapeHTML(secondaryReading)}</span>`
        : ""}
      <span class="details-word-pos">${escapeHTML(word.partOfSpeech)}</span>
    </div>
    ${targetControl(slice, candidate, chunkIndex, "word", wordIndex)}
  </li>`;
}

function renderChunkTarget(
  slice: DetailsReadyState,
  chunk: BreakdownChunk,
  chunkIndex: number,
): string {
  if (chunk.target.kind !== "chunk") return "";
  const candidate: Candidate = { card: chunk.target.card };
  return `<div class="details-chunk-target" data-primary-target>
    <span class="details-target-kind">Learning chunk</span>
    <span class="details-chunk-target-translation">${escapeHTML(candidate.card.translation)}</span>
    ${targetControl(slice, candidate, chunkIndex, "chunk")}
  </div>`;
}

export function renderExplanations(
  slice: DetailsReadyState,
  chunks: readonly BreakdownChunk[],
): string {
  const snapshot = sourceSnapshot(slice);
  const tokens = readingTokens(
    snapshot,
    slice.showReadings && slice.readingDisplay === "reading",
  );
  return chunks.map((chunk) => {
    const chunkIndex = slice.breakdown.chunks.indexOf(chunk);
    const words = chunk.words.map((candidate, wordIndex) => renderWord(
      slice,
      candidate,
      chunkIndex,
      wordIndex,
      chunk.target.kind === "word" && chunk.target.index === wordIndex,
    )).join("");
    return `<section class="details-explanation">
      <h3>${escapeHTML(chunk.gloss)}</h3>
      <div class="details-fragment" lang="${escapeHTML(snapshot.lang)}">${renderRange(
        snapshot,
        chunk.start,
        chunk.end,
        tokens,
      )}</div>
      <div class="details-role">${escapeHTML(chunk.role)}</div>
      <p>${escapeHTML(chunk.explanation)}</p>
      ${renderChunkTarget(slice, chunk, chunkIndex)}
      ${words
        ? `<div class="details-words"><h4>Words</h4><ul>${words}</ul></div>`
        : ""}
    </section>`;
  }).join("");
}

export function renderReadyBody(slice: DetailsReadyState): string {
  const count = slice.breakdown.chunks.length;
  return `<div id="details-explanations" class="details-explanations" aria-live="polite"></div>
    ${slice.deck
      ? ""
      : '<p class="details-save-unavailable">Open a phrasebook to star learning items.</p>'}
    <div class="details-tools">
      <span data-region="details-count"></span>
      <span class="details-tool-actions">
        ${count > 1
          ? '<button type="button" data-action="details/toggle-all" aria-controls="details-explanations"></button>'
          : ""}
        <button type="button" data-action="details/regenerate"
          ${slice.regenerating ? 'disabled aria-busy="true"' : ""}>${slice.regenerating ? "REGENERATING…" : "REGENERATE"}</button>
      </span>
    </div>
    <div class="details-regenerate-error" role="alert" ${slice.error ? "" : "hidden"}>
      <span>${escapeHTML(slice.error ?? "")}</span>
      <button type="button" data-action="details/retry">Retry</button>
    </div>`;
}
