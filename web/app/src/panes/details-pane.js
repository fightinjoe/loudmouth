/**
 * Details pane — Pane Protocol contract for the `details` namespace.
 *
 * Layer: details. Sits over the content pane and shows one card at a time.
 * Horizontal swipe inside the details pane navigates to the previous or
 * next sibling card without dismissing — the pane stays open, only the
 * card index changes (protocol glossary).
 *
 * Slice shape:
 *   null when closed, or
 *   { deckId, deck, cards, index }
 *
 * Transitions:
 *   details/open  ({ deck, cards, index })  — open with a starting card
 *   details/next                            — advance the index (clamped)
 *   details/prev                            — retreat the index (clamped)
 *   details/close                           — clear the slice
 *
 * Actions on the details delegate:
 *   details/close — back-chevron tap
 *
 * Gestures (wired to STATIC handles per Rule 6):
 *   - .details-handle--left  : swipe right → prev
 *   - .details-handle--right : swipe left  → next
 *   - .title-bar             : swipe down  → close
 *
 * The 3-card stack DOM matches the protocol's live example: a card-stack
 * sized 300% wide, translated -33.3333% at rest so the current card sits
 * centered. A drag adds a pixel offset on top of that. On commit the
 * stack animates the rest of the way, then transitions fire to re-render
 * with the new center and snap back to rest.
 */
import { setAttrSafe } from "../js/uiState.js";
import { renderRuby } from "../components/card.js";
import { speak, ttsText } from "../js/tts.js";

function renderFace(card, readingDisplay = "reading") {
  if (!card) return `<div class="card-face" data-empty="true"></div>`;
  const hasRuby = readingDisplay === "reading" && Array.isArray(card.reading);
  const displayText = hasRuby ? renderRuby(card.reading) : (card.text || "");
  return `
    <div class="card-face">
      <div class="review-card bg-surface flex-col items-center justify-center tappable" ${hasRuby ? "data-has-ruby" : ""}>
        <div class="review-card-text text-h1 font-bold text-center fg-body">${displayText}</div>
        <div class="review-card-reading text-body1 text-center fg-secondary">${card[readingDisplay] || ""}</div>
        <div class="review-card-reverse text-h1 font-bold text-center fg-body">${card.translation || ""}</div>
      </div>
      <div class="review-translation flex-col">
        <div class="review-translation-skeleton flex-col">
          <div class="review-translation-skeleton-line bg-surface"></div>
          <div class="review-translation-skeleton-line review-translation-skeleton-line--short bg-surface"></div>
        </div>
        <div class="review-translation-text text-body1 text-center fg-body">${card.translation || ""}</div>
      </div>
    </div>
  `;
}

function paintFace(faceEl, card, readingDisplay) {
  if (!card) { faceEl.dataset.empty = "true"; faceEl.innerHTML = ""; return; }
  delete faceEl.dataset.empty;
  const hasRuby = readingDisplay === "reading" && Array.isArray(card.reading);
  const displayText = hasRuby ? renderRuby(card.reading) : (card.text || "");
  faceEl.innerHTML = `
    <div class="review-card bg-surface flex-col items-center justify-center tappable" ${hasRuby ? "data-has-ruby" : ""}>
      <div class="review-card-text text-h1 font-bold text-center fg-body">${displayText}</div>
      <div class="review-card-reading text-body1 text-center fg-secondary">${card[readingDisplay] || ""}</div>
      <div class="review-card-reverse text-h1 font-bold text-center fg-body">${card.translation || ""}</div>
    </div>
    <div class="review-translation flex-col">
      <div class="review-translation-skeleton flex-col">
        <div class="review-translation-skeleton-line bg-surface"></div>
        <div class="review-translation-skeleton-line review-translation-skeleton-line--short bg-surface"></div>
      </div>
      <div class="review-translation-text text-body1 text-center fg-body">${card.translation || ""}</div>
    </div>
  `;
}

export default {
  namespace: "details",

  initialState: null,

  transitions: {
    "details/open": (_slice, { deck, cards, index }) => ({
      deck,
      cards,
      deckId: deck?.id ?? null,
      index: Math.max(0, Math.min((cards?.length ?? 1) - 1, index ?? 0)),
    }),
    "details/next": (slice) => {
      if (!slice) return null;
      const last = slice.cards.length - 1;
      const next = Math.min(last, slice.index + 1);
      if (next === slice.index) return slice;
      return { ...slice, index: next };
    },
    "details/prev": (slice) => {
      if (!slice) return null;
      const next = Math.max(0, slice.index - 1);
      if (next === slice.index) return slice;
      return { ...slice, index: next };
    },
    "details/close": () => undefined,
  },

  render() {
    // The details layer renders TWO siblings: a scrim that sits between
    // the content pane (below) and the details pane (above), and the
    // details pane itself. Both are siblings inside #details-layer so
    // their z-indices are predictable. The scrim is shown by CSS when
    // #app[data-details="open"] and dismisses on click.
    return `
      <div id="details-layer">
        <div id="details-scrim" class="details-scrim" data-action="details/close"></div>
        <div id="details-pane" class="details-pane fixed-inset flex-col bg-primary">
          <div class="details-title-bar pane-header flex items-center">
            <button class="icon-button fg-accent text-icon flex items-center justify-center shrink-0" data-action="details/close" aria-label="Back">‹</button>
            <span class="details-position pane-header-title flex-1 text-center text-header font-semibold fg-body bg-none no-tap-highlight"></span>
            <span class="pane-header-spacer shrink-0"></span>
          </div>
          <div class="card-stage flex-1">
            <div class="card-stack" data-region="card-stack">
              <div class="card-face" data-slot="prev"></div>
              <div class="card-face" data-slot="current"></div>
              <div class="card-face" data-slot="next"></div>
            </div>
          </div>
          <div class="details-handle details-handle--left" aria-hidden="true"></div>
          <div class="details-handle details-handle--right" aria-hidden="true"></div>
        </div>
      </div>
    `;
  },

  bindEvents(rootEl, host) {
    const { ui, delegate, stageEl } = host;

    const stackEl = rootEl.querySelector('[data-region="card-stack"]');
    const positionEl = rootEl.querySelector(".details-position");
    const leftHandle = rootEl.querySelector(".details-handle--left");
    const rightHandle = rootEl.querySelector(".details-handle--right");

    function getReadingDisplay() {
      const slice = ui.get("details");
      return slice?.deck?.readingDisplay || "reading";
    }

    function paint(slice) {
      if (!slice) return;
      const cards = slice.cards;
      const prev = slice.index > 0 ? cards[slice.index - 1] : null;
      const curr = cards[slice.index] || null;
      const next = slice.index < cards.length - 1 ? cards[slice.index + 1] : null;
      const rd = getReadingDisplay();
      paintFace(stackEl.querySelector('[data-slot="prev"]'), prev, rd);
      paintFace(stackEl.querySelector('[data-slot="current"]'), curr, rd);
      paintFace(stackEl.querySelector('[data-slot="next"]'), next, rd);
      positionEl.textContent = `${slice.index + 1} of ${cards.length}`;
    }

    const unsubSlice = ui.subscribe("details", (next) => {
      setAttrSafe(stageEl, "details", next ? "open" : "closed");
      if (next) paint(next);
    });

    delegate.register("details/close", () => ui.transition("details/close"));

    // ── Stack-traverse gesture (left/right edge handles) ────────────────────
    wireStackTraverse({
      handles: [leftHandle, rightHandle],
      stackEl,
      threshold: 60,
      canPrev: () => { const s = ui.get("details"); return !!s && s.index > 0; },
      canNext: () => { const s = ui.get("details"); return !!s && s.index < s.cards.length - 1; },
      onCommitNext: () => ui.transition("details/next"),
      onCommitPrev: () => ui.transition("details/prev"),
    });

    // ── Swipe-down-to-dismiss on the title bar (static) ─────────────────────
    // moveTarget MUST be #details-pane — the element the CSS slide transform
    // and the [data-dragging] transition-suppression rule live on. Targeting
    // the #details-layer wrapper instead would set a transform on a static,
    // zero-size box, which makes it the containing block for the fixed pane
    // and teleports the pane off-screen mid-drag.
    const paneEl = rootEl.querySelector("#details-pane");
    const titleBar = rootEl.querySelector(".details-title-bar");
    wireVerticalDismiss({
      handleEl: titleBar,
      moveTarget: paneEl,
      threshold: 100,
      onCommitDismiss: () => ui.transition("details/close"),
    });

    // ── Tap-to-reveal-translation (transient class toggle) ──────────────────
    // The reveal is purely visual feedback that ends on touchend — class
    // toggle is the right primitive (AGENTS.md, Use CSS class toggles for
    // transient state).
    function revealOn(e) {
      const tr = e.target.closest(".review-translation");
      if (!tr) return;
      tr.classList.add("review-translation--revealed");
    }
    function revealOff() {
      rootEl.querySelectorAll(".review-translation--revealed")
        .forEach((el) => el.classList.remove("review-translation--revealed"));
    }
    rootEl.addEventListener("mousedown", revealOn);
    rootEl.addEventListener("touchstart", revealOn, { passive: true });
    rootEl.addEventListener("mouseup", revealOff);
    rootEl.addEventListener("mouseleave", revealOff);
    rootEl.addEventListener("touchend", revealOff);
    rootEl.addEventListener("touchcancel", revealOff);

    // ── Tap the card → speak ────────────────────────────────────────────────
    // Reads the current slice's card so the handler doesn't capture stale state.
    rootEl.addEventListener("click", (e) => {
      if (!e.target.closest(".review-card")) return;
      const slice = ui.get("details");
      if (!slice) return;
      const card = slice.cards[slice.index];
      if (card) speak(ttsText(card), card.lang);
    });

    return () => {
      unsubSlice();
      delegate.unregister("details/close");
    };
  },
};

// ── Gesture helpers ─────────────────────────────────────────────────────────

function wireStackTraverse({ handles, stackEl, threshold, canPrev, canNext, onCommitNext, onCommitPrev }) {
  let startX = null, startY = null, axis = null;

  function start(x, y) { startX = x; startY = y; axis = null; }

  function move(x, y) {
    if (startX === null) return;
    const dx = x - startX, dy = y - startY;
    if (!axis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axis !== "h") return;
    let pull = dx;
    if (dx < 0 && !canNext()) pull = dx / 4;
    if (dx > 0 && !canPrev()) pull = dx / 4;
    stackEl.dataset.dragging = "";
    stackEl.style.transform = `translateX(calc(-33.3333% + ${pull}px))`;
  }

  function end(x) {
    if (startX === null) return;
    const dx = x - startX;
    const _axis = axis;
    startX = null; startY = null; axis = null;

    if (_axis === "h" && Math.abs(dx) >= threshold && dx < 0 && canNext()) {
      // Re-enable the transition (delete data-dragging) THEN set the
      // commit transform so the stack animates to the new slot. After the
      // animation, fire the transition (which re-paints all three faces)
      // and snap the stack back to rest while transitions are suppressed
      // so the user doesn't see a jump.
      delete stackEl.dataset.dragging;
      stackEl.style.transform = "translateX(-66.6666%)";
      afterTransition(stackEl, () => {
        stackEl.dataset.dragging = "";
        stackEl.style.transform = "";
        onCommitNext();
        requestAnimationFrame(() => requestAnimationFrame(() => delete stackEl.dataset.dragging));
      });
      return;
    }
    if (_axis === "h" && Math.abs(dx) >= threshold && dx > 0 && canPrev()) {
      delete stackEl.dataset.dragging;
      stackEl.style.transform = "translateX(0%)";
      afterTransition(stackEl, () => {
        stackEl.dataset.dragging = "";
        stackEl.style.transform = "";
        onCommitPrev();
        requestAnimationFrame(() => requestAnimationFrame(() => delete stackEl.dataset.dragging));
      });
      return;
    }
    // Snap-back branch: re-enable transitions then clear the inline
    // transform so the CSS animates back to rest.
    delete stackEl.dataset.dragging;
    stackEl.style.transform = "";
  }

  handles.forEach((h) => {
    h.addEventListener("touchstart", (e) => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    h.addEventListener("touchmove", (e) => move(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    h.addEventListener("touchend", (e) => end(e.changedTouches[0].clientX));
    h.addEventListener("touchcancel", (e) => end(e.changedTouches[0].clientX));
  });
}

function wireVerticalDismiss({ handleEl, moveTarget, threshold, onCommitDismiss }) {
  let startX = null, startY = null, axis = null;
  function start(x, y) { startX = x; startY = y; axis = null; }
  function move(x, y) {
    if (startX === null) return;
    const dx = x - startX, dy = y - startY;
    if (!axis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      axis = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
    }
    if (axis !== "v") return;
    if (dy < 0) return;
    moveTarget.dataset.dragging = "";
    moveTarget.style.transform = `translateY(${dy}px)`;
  }
  function end(_x, y) {
    if (startX === null) return;
    const dy = y - startY;
    const _axis = axis;
    startX = null; startY = null; axis = null;
    if (_axis === "v" && dy >= threshold) {
      onCommitDismiss();
      // The slice subscriber writes data-details="closed"; the CSS
      // transition takes the pane back off-screen. Clear inline styles
      // so the CSS owns the resting position again.
      delete moveTarget.dataset.dragging;
      moveTarget.style.transform = "";
      return;
    }
    delete moveTarget.dataset.dragging;
    moveTarget.style.transform = "";
  }
  handleEl.addEventListener("touchstart", (e) => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  handleEl.addEventListener("touchmove", (e) => move(e.touches[0].clientX, e.touches[0].clientY), { passive: false });
  handleEl.addEventListener("touchend", (e) => end(e.changedTouches[0].clientX, e.changedTouches[0].clientY));
  handleEl.addEventListener("touchcancel", (e) => end(e.changedTouches[0].clientX, e.changedTouches[0].clientY));
}

function afterTransition(el, cb) {
  let done = false;
  function fire() { if (done) return; done = true; el.removeEventListener("transitionend", fire); cb(); }
  el.addEventListener("transitionend", fire);
  setTimeout(fire, 320);
}
