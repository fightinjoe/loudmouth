import { openBottomSheet } from "./bottom-sheet.js";
import { speak, ttsText } from "../js/tts.js";
import { applyCardOrder } from "../js/db.js";
import { renderRuby } from "./card.js";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { icon } from "./icon.js";
import { renderPaneHeader, headerIconButton, headerTitle } from "./pane-header.js";

// Swipe-to-advance threshold — same value as the reveal-swipe gesture
// elsewhere in the app (content-pane-gestures.js REVEAL_THRESHOLD), kept
// here rather than shared since the two gestures commit to unrelated
// outcomes (drag distance to "feel right" for a full-card swipe is the
// same order of magnitude, but this is a separate, standalone gesture).
const SWIPE_THRESHOLD = 80;

/**
 * Opens the Review content mode (Journey 4) — a standalone flashcard
 * reviewer over the phrasebook's terms. Not part of the Input/Translation/
 * Group look-up stack; a self-contained sibling content mode.
 *
 * Implementation decisions made here for journeys.md open questions not yet
 * Figma-resolved (see docs/projects/phrasebook-lookup-ux/tasks.json PH-009):
 *   - Advance: swipe left/right. No on-screen next/prev control.
 *   - End-of-deck: no loop, no summary — swiping past the last/first card
 *     is a no-op (BRIEF.md Assumptions: "no loop, no end-of-deck summary").
 *   - Direction toggle: session-only, resets whenever Review is reopened.
 *   - Subset reviewed: the whole phrasebook, in the deck's own card order.
 *
 * @param {HTMLElement} appEl
 * @param {Object} deck
 * @param {Object[]} cards
 * @param {Function} onDismiss
 * @returns {{ close: Function }}
 */
export function openReviewPanel(appEl, deck, cards, onDismiss) {
  const ordered = applyCardOrder(cards, deck.order, deck.cardOrder);

  const state = {
    index: 0,
    revealed: false,
    // false: prompt = English (translation), answer = target-language text.
    // true: reversed — prompt = target-language text, answer = English.
    reversed: false,
  };

  const sheet = openBottomSheet(appEl, {
    kind: "review",
    size: "full",
    bodyHTML: `<div class="review-panel-inner flex-col flex-1">${renderBody(ordered, state, deck.lang)}</div>`,
    onClose: onDismiss,
    onMount: (panel, _scrim, close) => {
      bind(panel, close);
    },
  });

  return sheet;

  function rerender(enterDir) {
    const inner = sheet.panel.querySelector(".review-panel-inner");
    if (!inner) return;
    inner.innerHTML = renderBody(ordered, state, deck.lang);
    bind(sheet.panel, sheet.close);
    if (!enterDir) return;
    // Card advanced via swipe — start the new card offset in the direction
    // it swiped in from, then release to the base transition next frame so
    // it slides to rest instead of snapping in (bug: "smooth animation from
    // one card to the next").
    const wrap = inner.querySelector(".review-card-wrap");
    if (!wrap) return;
    wrap.classList.add(enterDir === "left" ? "review-card-wrap--from-right" : "review-card-wrap--from-left");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wrap.classList.remove("review-card-wrap--from-right", "review-card-wrap--from-left");
      });
    });
  }

  function bind(panel, close) {
    panel.querySelector('[data-action="review/close"]')?.addEventListener("click", close);

    panel.querySelector('[data-action="review/toggle-direction"]')?.addEventListener("click", () => {
      state.reversed = !state.reversed;
      state.revealed = false;
      rerender();
    });

    panel.querySelector('[data-action="review/toggle-reveal"]')?.addEventListener("click", () => {
      state.revealed = !state.revealed;
      rerender();
    });

    panel.querySelector('[data-action="review/play"]')?.addEventListener("click", () => {
      const card = ordered[state.index];
      if (!card) return;
      // Always reads the term's target-language pronunciation, regardless
      // of which side is currently the prompt/answer (direction toggle) or
      // revealed — audio is a fixed per-card action, not tied to layout.
      speak(ttsText(card), card.lang);
    });

    wirePeekReveal(panel.querySelector(".review-card-wrap"));

    wireSwipeAdvance(panel.querySelector(".review-card-wrap"), {
      onCommit: (dir) => {
        const next = state.index + (dir === "left" ? 1 : -1);
        if (next < 0 || next >= ordered.length) return; // no loop, no-op at boundary
        state.index = next;
        state.revealed = false;
        rerender(dir);
      },
    });
  }

  // Tap-and-hold on the redacted (skeleton) answer peeks the translation
  // while held, hiding it again on release — a momentary reveal distinct
  // from the persistent eye-toggle. No-op once already revealed. Touch is
  // the real target (mobile-only per web/AGENTS.md); mouse events are
  // added alongside so the gesture also works for desktop/dev browser use.
  function wirePeekReveal(wrap) {
    const skeleton = wrap?.querySelector(".review-answer-skeleton");
    if (!skeleton) return;

    let active = false;
    const end = () => {
      if (!active) return;
      active = false;
      if (!state.revealed) wrap.dataset.revealed = "false";
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
      document.removeEventListener("mouseup", end);
    };

    const begin = (e) => {
      if (state.revealed) return; // already permanently revealed
      if (e.cancelable) e.preventDefault();
      active = true;
      wrap.dataset.revealed = "true";
      document.addEventListener("touchend", end);
      document.addEventListener("touchcancel", end);
      document.addEventListener("mouseup", end);
    };

    skeleton.addEventListener("touchstart", begin, { passive: false });
    skeleton.addEventListener("mousedown", begin);
  }

  function wireSwipeAdvance(el, { onCommit }) {
    if (!el) return;
    let startX = null;
    let startY = null;
    let axis = null;

    el.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      axis = null;
    }, { passive: true });

    el.addEventListener("touchmove", (e) => {
      if (startX === null) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!axis) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (axis !== "h") return;
      el.dataset.dragging = "";
      el.style.transform = `translateX(${dx}px)`;
    }, { passive: true });

    function end(clientX) {
      if (startX === null) return;
      const dx = clientX - startX;
      delete el.dataset.dragging;
      el.style.transform = "";
      startX = null;
      startY = null;
      if (axis === "h" && Math.abs(dx) >= SWIPE_THRESHOLD) {
        onCommit(dx < 0 ? "left" : "right");
      }
      axis = null;
    }

    el.addEventListener("touchend", (e) => {
      end(e.changedTouches[0].clientX);
    });
    el.addEventListener("touchcancel", () => {
      delete el.dataset.dragging;
      el.style.transform = "";
      startX = null;
      startY = null;
      axis = null;
    });
  }
}

function renderBody(ordered, state, deckLang) {
  const card = ordered[state.index];
  if (!card) {
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

  const flag = LANG_FLAGS[deckLang] ?? "";
  // promptLang: language of the term currently shown in the card (the
  // header direction-toggle button — swaps which language is on top).
  // answerLang: language of the hidden text below the card (the reveal
  // toggle button) — always the opposite of promptLang.
  const promptLang = state.reversed ? (LANG_NAMES[deckLang] ?? deckLang) : "English";
  const promptFlag = state.reversed ? flag : "🇬🇧";
  const answerLang = state.reversed ? "English" : (LANG_NAMES[deckLang] ?? deckLang);

  const sourceHTML = Array.isArray(card.reading) ? renderRuby(card.reading) : (card.text || "");
  const promptHTML = state.reversed ? sourceHTML : esc(card.translation || "");
  const answerHTML = state.reversed ? esc(card.translation || "") : sourceHTML;

  return `
    ${renderPaneHeader({
      leading: headerIconButton("close", { action: "review/close", label: "Close" }),
      title: `<span class="pane-header-title flex-1"></span>`,
      trailing: `<button class="review-direction-toggle flex items-center tappable" data-action="review/toggle-direction" aria-label="Toggle direction">
        <span class="review-direction-flag">${promptFlag}</span>
        <span class="review-direction-lang text-body2 fg-secondary">${promptLang}</span>
        ${icon("swap-vert", { size: "sm", className: "review-direction-icon" })}
      </button>`,
    })}
    <div class="review-card-wrap flex-1 flex-col items-center justify-center" data-revealed="${state.revealed}">
      <div class="review-card bg-surface flex-col items-center justify-center">
        <div class="review-prompt text-h2 fg-body">${promptHTML}</div>
      </div>
      <div class="review-answer-region">
        <div class="review-answer-skeleton flex-col" aria-hidden="true">
          <div class="review-skeleton-bar"></div>
          <div class="review-skeleton-bar review-skeleton-bar--short"></div>
        </div>
        <div class="review-answer text-card-title fg-accent">${answerHTML}</div>
      </div>
    </div>
    <div class="review-controls flex items-center justify-between">
      <button class="review-reveal-toggle flex items-center tappable" data-action="review/toggle-reveal" aria-label="Reveal answer">
        <span class="review-reveal-icon">${state.revealed ? icon("visibility-off", { size: "sm" }) : icon("visibility", { size: "sm" })}</span>
        <span class="review-reveal-label text-body2 fg-secondary">${answerLang}</span>
      </button>
      <button class="icon-button review-play" data-action="review/play" aria-label="Play audio">${icon("sound")}</button>
    </div>
  `;
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
