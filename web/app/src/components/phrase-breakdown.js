import { icon } from "./icon.js";
import { escapeHTML } from "../js/utils.js";

function readingTokens(slice) {
  const { card, readingDisplay, showReadings } = slice;
  if (!showReadings || readingDisplay !== "reading" || !Array.isArray(card.reading)
    || typeof card.text !== "string") return null;
  let offset = 0;
  const tokens = [];
  for (const token of card.reading) {
    if (!Array.isArray(token) || typeof token[0] !== "string"
      || (token[1] != null && typeof token[1] !== "string")) return null;
    if (!slice.card.text.startsWith(token[0], offset)) return null;
    const start = offset;
    offset += token[0].length;
    tokens.push({ start, end: offset, annotation: token[1] });
  }
  return offset === slice.card.text.length ? tokens : null;
}

function renderRange(slice, start, end, tokens) {
  const text = String(slice.card.text ?? "");
  if (!tokens) return escapeHTML(text.slice(start, end));
  let html = "";
  for (const token of tokens) {
    const from = Math.max(start, token.start);
    const to = Math.min(end, token.end);
    if (to <= from) continue;
    const base = text.slice(from, to);
    const whole = from === token.start && to === token.end;
    html += whole && token.annotation
      ? `<ruby>${escapeHTML(base)}<rt>${escapeHTML(token.annotation)}</rt></ruby>`
      : escapeHTML(base);
  }
  return html;
}

function renderPhrase(slice) {
  const text = String(slice.card.text ?? "");
  const tokens = readingTokens(slice);
  if (slice.status !== "ready") return renderRange(slice, 0, text.length, tokens);
  let html = "";
  let offset = 0;
  slice.breakdown.chunks.forEach((chunk, index) => {
    html += renderRange(slice, offset, chunk.start, tokens);
    html += `<span class="details-phrase-part" role="button" tabindex="0"
      data-action="details/select-part" data-index="${index}"
      aria-label="${escapeHTML(chunk.text)}" aria-pressed="${slice.all || slice.selectedIndex === index}"
      aria-controls="details-explanations">${renderRange(slice, chunk.start, chunk.end, tokens)}</span>`;
    offset = chunk.end;
  });
  return html + renderRange(slice, offset, text.length, tokens);
}

export function renderSource(slice, includeCue = false) {
  const card = slice.card;
  const reading = slice.showReadings && slice.readingDisplay !== "reading"
    && typeof card[slice.readingDisplay] === "string" ? card[slice.readingDisplay] : "";
  const plainReading = slice.showReadings && slice.readingDisplay === "reading"
    && typeof card.reading === "string" ? card.reading : "";
  return `<div class="details-source-card card-term flex-col">
    ${slice.showEnglish ? `<span class="card-term-english fg-secondary">${escapeHTML(card.translation)}</span>` : ""}
    <span class="card-term-target fg-body" lang="${escapeHTML(card.lang)}">${renderPhrase(slice)}</span>
    ${reading || plainReading ? `<span class="card-term-reading">${escapeHTML(reading || plainReading)}</span>` : ""}
    ${includeCue ? '<span class="card-explore-cue details-source-cue">Explore phrase</span>' : ""}
    <button type="button" class="card-audio details-audio" data-action="details/play-audio"
      aria-label="Play pronunciation: ${escapeHTML(card.translation)}">${icon("sound")}</button>
  </div>`;
}

export function renderExplanations(slice, chunks) {
  const tokens = readingTokens(slice);
  return chunks.map((chunk) => `<section class="details-explanation">
    <h3>${escapeHTML(chunk.gloss)}</h3>
    <div class="details-fragment" lang="${escapeHTML(slice.card.lang)}">${renderRange(slice, chunk.start, chunk.end, tokens)}</div>
    <div class="details-role">${escapeHTML(chunk.role)}</div>
    <p>${escapeHTML(chunk.explanation)}</p>
  </section>`).join("");
}

export function renderReadyBody(slice) {
  const count = slice.breakdown.chunks.length;
  return `<div id="details-explanations" class="details-explanations" aria-live="polite"></div>
    <div class="details-tools">
      <span data-region="details-count"></span>
      ${count > 1 ? '<button type="button" data-action="details/toggle-all" aria-controls="details-explanations"></button>' : ""}
    </div>`;
}
