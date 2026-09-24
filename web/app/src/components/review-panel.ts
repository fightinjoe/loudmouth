import type { Lang, Phrase, Word } from "@catchphrase/card-schema";
import { openBottomSheet } from "./bottom-sheet";
import type { BottomSheetClose, BottomSheetHandle } from "./bottom-sheet";
import { speak, ttsText } from "../js/tts";
import { applyCardOrder } from "../js/db";
import type { Deck, LibraryEntry } from "../js/library-types";
import { renderRuby } from "./card";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang";
import { icon } from "./icon";
import { renderPaneHeader, headerIconButton, headerTitle } from "./pane-header";
import { renderSourceContext } from "./source-context";
import { escapeHTML } from "../js/utils";

const SWIPE_THRESHOLD = 80;

type SwipeDirection = "left" | "right";
type SwipeAxis = "h" | "v";

interface ReviewState {
  index: number;
  revealed: boolean;
  reversed: boolean;
}

interface RenderedReviewEntry {
  promptHTML: string;
  answerHTML: string;
}

/**
 * Opens the full-height reviewer over an already ordered, unique starred set.
 * The deck's session order is applied exactly once here.
 */
export function openReviewPanel(
  appElement: HTMLElement,
  deck: Deck,
  cards: LibraryEntry[],
  onDismiss: () => void,
): BottomSheetHandle {
  const ordered = applyCardOrder(cards, deck.order);
  const state: ReviewState = {
    index: 0,
    revealed: false,
    reversed: false,
  };

  const sheet = openBottomSheet(appElement, {
    kind: "review",
    size: "full",
    bodyHTML: `<div class="review-panel-inner flex-col flex-1">${renderBody(ordered, state, deck.lang)}</div>`,
    onClose: onDismiss,
    onMount: (panel, _scrim, close) => {
      bind(panel, close);
    },
  });

  return sheet;

  function rerender(enterDirection?: SwipeDirection): void {
    const inner = sheet.panel.querySelector<HTMLElement>(".review-panel-inner");
    if (!inner) return;
    inner.innerHTML = renderBody(ordered, state, deck.lang);
    bind(sheet.panel, sheet.close);
    if (!enterDirection) return;

    const wrap = inner.querySelector<HTMLElement>(".review-card-wrap");
    if (!wrap) return;
    wrap.classList.add(
      enterDirection === "left"
        ? "review-card-wrap--from-right"
        : "review-card-wrap--from-left",
    );
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wrap.classList.remove(
          "review-card-wrap--from-right",
          "review-card-wrap--from-left",
        );
      });
    });
  }

  function bind(panel: HTMLElement, close: BottomSheetClose): void {
    panel
      .querySelector<HTMLElement>('[data-action="review/close"]')
      ?.addEventListener("click", close);

    panel
      .querySelector<HTMLElement>('[data-action="review/toggle-direction"]')
      ?.addEventListener("click", () => {
        state.reversed = !state.reversed;
        state.revealed = false;
        rerender();
      });

    panel
      .querySelector<HTMLElement>('[data-action="review/toggle-reveal"]')
      ?.addEventListener("click", () => {
        state.revealed = !state.revealed;
        rerender();
      });

    panel
      .querySelector<HTMLElement>('[data-action="review/play"]')
      ?.addEventListener("click", () => {
        const entry = ordered[state.index];
        if (!entry) return;
        if (entry.card.type === "chunk") {
          speak(entry.card.source.snapshot.text, entry.card.source.snapshot.lang);
          return;
        }
        speak(ttsText(entry.card), entry.card.lang);
      });

    wirePeekReveal(panel.querySelector<HTMLElement>(".review-card-wrap"));
    wireSwipeAdvance(
      panel.querySelector<HTMLElement>(".review-card-wrap"),
      (direction) => {
        const next = state.index + (direction === "left" ? 1 : -1);
        if (next < 0 || next >= ordered.length) return;
        state.index = next;
        state.revealed = false;
        rerender(direction);
      },
    );
  }

  function setRevealAppearance(wrap: HTMLElement, revealed: boolean): void {
    wrap.dataset.revealed = String(revealed);
    const entry = ordered[state.index];
    if (!entry || entry.card.type !== "chunk" || state.reversed) return;
    const context = wrap.querySelector<HTMLElement>(
      '[data-region="review-chunk-context"]',
    );
    if (!context) return;
    context.innerHTML = renderSourceContext(
      entry.card.source.snapshot,
      entry.card.source.span,
      { mask: !revealed },
    );
  }

  function wirePeekReveal(wrap: HTMLElement | null): void {
    const skeleton = wrap?.querySelector<HTMLElement>(".review-answer-skeleton");
    if (!wrap || !skeleton) return;

    let active = false;
    const end = (): void => {
      if (!active) return;
      active = false;
      if (!state.revealed) setRevealAppearance(wrap, false);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
      document.removeEventListener("mouseup", end);
    };

    const begin = (event: TouchEvent | MouseEvent): void => {
      if (state.revealed) return;
      if (event.cancelable) event.preventDefault();
      active = true;
      setRevealAppearance(wrap, true);
      document.addEventListener("touchend", end);
      document.addEventListener("touchcancel", end);
      document.addEventListener("mouseup", end);
    };

    skeleton.addEventListener("touchstart", begin, { passive: false });
    skeleton.addEventListener("mousedown", begin);
  }
}

function wireSwipeAdvance(
  element: HTMLElement | null,
  onCommit: (direction: SwipeDirection) => void,
): void {
  if (!element) return;
  let startX: number | null = null;
  let startY: number | null = null;
  let axis: SwipeAxis | null = null;

  const reset = (): void => {
    delete element.dataset.dragging;
    element.style.transform = "";
    startX = null;
    startY = null;
    axis = null;
  };

  element.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    axis = null;
  }, { passive: true });

  element.addEventListener("touchmove", (event) => {
    if (startX === null || startY === null) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!axis) {
      if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return;
      axis = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
    }
    if (axis !== "h") return;
    element.dataset.dragging = "";
    element.style.transform = `translateX(${deltaX}px)`;
  }, { passive: true });

  element.addEventListener("touchend", (event) => {
    if (startX === null) return;
    const touch = event.changedTouches[0];
    const deltaX = (touch?.clientX ?? startX) - startX;
    const committedAxis = axis;
    reset();
    if (committedAxis === "h" && Math.abs(deltaX) >= SWIPE_THRESHOLD) {
      onCommit(deltaX < 0 ? "left" : "right");
    }
  }, { passive: true });

  element.addEventListener("touchcancel", reset, { passive: true });
}

function reviewTranslation(entry: LibraryEntry): string {
  if (entry.card.type === "phrase" && entry.occurrence) {
    return entry.occurrence.translation;
  }
  return entry.card.translation;
}

function renderTarget(card: Phrase | Word): string {
  const target = card.reading ? renderRuby(card.reading) : escapeHTML(card.text);
  return `<span lang="${escapeHTML(card.lang)}">${target}</span>`;
}

function renderSourceExamples(entry: LibraryEntry): string {
  if (entry.card.type !== "word" || entry.sources.length === 0) return "";
  return `
    <details class="review-source-examples">
      <summary class="review-source-examples-summary text-body2 fg-secondary">Source examples</summary>
      <div class="review-source-example-list flex-col">
        ${entry.sources.map((source) => `
          <div class="review-source-example flex-col">
            <div class="review-source-example-target text-body-lg fg-body">${renderSourceContext(source.snapshot, source.span)}</div>
            <div class="review-source-example-translation text-body2 fg-secondary">${escapeHTML(source.snapshot.translation)}</div>
          </div>
        `).join("")}
      </div>
    </details>
  `;
}

function renderChunkTeaching(entry: LibraryEntry): string {
  if (entry.card.type !== "chunk") return "";
  const { card } = entry;
  return `
    <dl class="review-chunk-teaching text-body1">
      <div>
        <dt class="fg-secondary">Role</dt>
        <dd class="fg-body">${escapeHTML(card.role)}</dd>
      </div>
      <div>
        <dt class="fg-secondary">Explanation</dt>
        <dd class="fg-body">${escapeHTML(card.explanation)}</dd>
      </div>
      <div>
        <dt class="fg-secondary">Source translation</dt>
        <dd class="fg-body">${escapeHTML(card.source.snapshot.translation)}</dd>
      </div>
    </dl>
  `;
}

function renderEntry(entry: LibraryEntry, state: ReviewState): RenderedReviewEntry {
  const { card } = entry;
  if (card.type === "chunk") {
    const context = renderSourceContext(card.source.snapshot, card.source.span, {
      mask: !state.reversed && !state.revealed,
    });
    const contextHTML = `<span class="review-chunk-context" data-region="review-chunk-context">${context}</span>`;
    const glossHTML = `<span class="review-chunk-gloss">${escapeHTML(card.translation)}</span>`;
    return {
      promptHTML: state.reversed ? contextHTML : `${glossHTML}${contextHTML}`,
      answerHTML: `${state.reversed ? `<div class="review-answer-primary">${escapeHTML(card.translation)}</div>` : ""}${renderChunkTeaching(entry)}`,
    };
  }

  const targetHTML = renderTarget(card);
  const translationHTML = escapeHTML(reviewTranslation(entry));
  const sourcesHTML = renderSourceExamples(entry);
  return {
    promptHTML: state.reversed ? targetHTML : translationHTML,
    answerHTML: `<div class="review-answer-primary">${state.reversed ? translationHTML : targetHTML}</div>${sourcesHTML}`,
  };
}

function renderBody(
  ordered: readonly LibraryEntry[],
  state: ReviewState,
  deckLang: Lang,
): string {
  const entry = ordered[state.index];
  if (!entry) {
    return `
      ${renderPaneHeader({
        leading: headerIconButton("close", { action: "review/close", label: "Close" }),
        title: headerTitle("Review"),
      })}
      <div class="review-empty text-center fg-secondary flex-1 flex-col items-center justify-center">
        <p>No cards to review.</p>
      </div>
    `;
  }

  const flag = LANG_FLAGS[deckLang];
  const promptLanguage = state.reversed ? LANG_NAMES[deckLang] : "English";
  const promptFlag = state.reversed ? flag : "🇬🇧";
  const answerLanguage = state.reversed ? "English" : LANG_NAMES[deckLang];
  const rendered = renderEntry(entry, state);

  return `
    ${renderPaneHeader({
      leading: headerIconButton("close", { action: "review/close", label: "Close" }),
      title: '<span class="pane-header-title flex-1"></span>',
      trailing: `<button class="review-direction-toggle flex items-center tappable" data-action="review/toggle-direction" aria-label="Toggle direction">
        <span class="review-direction-flag">${escapeHTML(promptFlag)}</span>
        <span class="review-direction-lang text-body2 fg-secondary">${escapeHTML(promptLanguage)}</span>
        ${icon("swap-vert", { size: "sm", className: "review-direction-icon" })}
      </button>`,
    })}
    <div class="review-card-wrap flex-1 flex-col items-center justify-center" data-revealed="${state.revealed}">
      <div class="review-card bg-surface flex-col items-center justify-center">
        <div class="review-prompt text-h2 fg-body">${rendered.promptHTML}</div>
      </div>
      <div class="review-answer-region">
        <div class="review-answer-skeleton flex-col" aria-hidden="true">
          <div class="review-skeleton-bar"></div>
          <div class="review-skeleton-bar review-skeleton-bar--short"></div>
        </div>
        <div class="review-answer text-card-title fg-accent">${rendered.answerHTML}</div>
      </div>
    </div>
    <div class="review-controls flex items-center justify-between">
      <button class="review-reveal-toggle flex items-center tappable" data-action="review/toggle-reveal" aria-label="Reveal answer">
        <span class="review-reveal-icon">${state.revealed ? icon("visibility-off", { size: "sm" }) : icon("visibility", { size: "sm" })}</span>
        <span class="review-reveal-label text-body2 fg-secondary">${escapeHTML(answerLanguage)}</span>
      </button>
      <button class="icon-button review-play" data-action="review/play" aria-label="Play audio">${icon("sound")}</button>
    </div>
  `;
}
