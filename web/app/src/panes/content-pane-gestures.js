/**
 * Content pane — touch gestures.
 *
 * Two gestures, both wired directly to static handles per Rule 6:
 *
 *   - Shell swipe: drag the left-edge `.handle` to toggle shell exposure.
 *     The gesture animates the content pane's transform; on touchend it
 *     calls `shell/toggle` if displacement crossed the threshold.
 *
 *   - Reveal swipe: drag a card row leftward to expose action buttons.
 *     Wired on the pane root (static), uses event-target hit-testing to
 *     identify which dynamic card-row is being acted on.
 *
 * Per Rule 6: gestures never call a transition during touchmove. They mark
 * `[data-dragging]` on the element they translate; subscribers (Rule 7) skip
 * writes to dragging elements.
 *
 * Returns `{ revealActive }` so the caller can query whether a reveal is
 * currently exposed (used to short-circuit card-row click handlers).
 */

const NAV_PANE_WIDTH = 280;
const OPEN_THRESHOLD = 100;
const REVEAL_WIDTH = 160;
const REVEAL_THRESHOLD = 80;
const CARD_WRAPPER_SEL = ".card-row-wrapper";
const ROW_SEL = ".card-row";
const SWIPED_CLASS = "card-row-wrapper--swiped";

export function wireContentGestures({ rootEl, handleEl, ui, isEdit }) {
  // ── Shell swipe ─────────────────────────────────────────────────────────
  let shellStartX = null, shellStartY = null, shellAxis = null;
  function shellIsOpen() { return ui.get("shell")?.exposed === "background"; }

  handleEl.addEventListener("touchstart", (e) => {
    if (!shellIsOpen() && e.target.closest(".content-pane-scrim")) return;
    shellStartX = e.touches[0].clientX;
    shellStartY = e.touches[0].clientY;
    shellAxis = null;
  }, { passive: true });

  handleEl.addEventListener("touchmove", (e) => {
    if (shellStartX === null) return;
    const dx = e.touches[0].clientX - shellStartX;
    const dy = e.touches[0].clientY - shellStartY;
    if (!shellAxis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      shellAxis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (shellAxis !== "h") return;
    const open = shellIsOpen();
    if (!open && dx < 0) return;
    if (open && dx > 0) return;
    const base = open ? NAV_PANE_WIDTH : 0;
    const clamped = Math.max(0, Math.min(NAV_PANE_WIDTH, base + dx));
    rootEl.dataset.dragging = "";
    rootEl.style.transform = `translateX(${clamped}px)`;
  }, { passive: false });

  function endShell(x) {
    if (shellStartX === null) return;
    const dx = x - shellStartX;
    const wasOpen = shellIsOpen();
    delete rootEl.dataset.dragging;
    rootEl.style.transform = "";
    shellStartX = null;
    if (shellAxis === "h") {
      if (!wasOpen && dx >= OPEN_THRESHOLD) ui.transition("shell/toggle");
      else if (wasOpen && dx <= -OPEN_THRESHOLD) ui.transition("shell/toggle");
    }
    shellAxis = null;
  }
  handleEl.addEventListener("touchend", (e) => endShell(e.changedTouches[0].clientX), { passive: true });
  handleEl.addEventListener("touchcancel", (e) => endShell(e.changedTouches[0].clientX), { passive: true });

  // ── Reveal swipe ────────────────────────────────────────────────────────
  let revealStart = null, revealAxis = null, revealTarget = null;
  let activeSwiped = null;

  function resetReveal() {
    if (activeSwiped) {
      activeSwiped.classList.remove(SWIPED_CLASS);
      activeSwiped.querySelector(ROW_SEL).style.transform = "";
      activeSwiped = null;
    }
  }

  rootEl.addEventListener("touchstart", (e) => {
    if (isEdit()) return;
    const wrapper = e.target.closest(CARD_WRAPPER_SEL);
    if (!wrapper) return;
    revealStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    revealTarget = wrapper;
    revealAxis = null;
    wrapper.querySelector(ROW_SEL).dataset.dragging = "";
  }, { passive: false });

  rootEl.addEventListener("touchmove", (e) => {
    if (!revealTarget) return;
    const dx = e.touches[0].clientX - revealStart.x;
    const dy = e.touches[0].clientY - revealStart.y;
    if (!revealAxis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      revealAxis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (revealAxis !== "h") return;
    e.preventDefault();
    const isSwiped = revealTarget.classList.contains(SWIPED_CLASS);
    const base = isSwiped ? -REVEAL_WIDTH : 0;
    const clamped = Math.max(-REVEAL_WIDTH, Math.min(0, base + dx));
    revealTarget.querySelector(ROW_SEL).style.transform = `translateX(${clamped}px)`;
  }, { passive: false });

  rootEl.addEventListener("touchend", (e) => {
    if (!revealTarget) return;
    const row = revealTarget.querySelector(ROW_SEL);
    delete row.dataset.dragging;
    if (revealAxis === "h") {
      const dx = e.changedTouches[0].clientX - revealStart.x;
      const isSwiped = revealTarget.classList.contains(SWIPED_CLASS);
      const net = (isSwiped ? -REVEAL_WIDTH : 0) + dx;
      if (net < -REVEAL_THRESHOLD) {
        if (activeSwiped && activeSwiped !== revealTarget) {
          activeSwiped.classList.remove(SWIPED_CLASS);
          activeSwiped.querySelector(ROW_SEL).style.transform = "";
        }
        revealTarget.classList.add(SWIPED_CLASS);
        activeSwiped = revealTarget;
      } else {
        revealTarget.classList.remove(SWIPED_CLASS);
        if (activeSwiped === revealTarget) activeSwiped = null;
      }
      row.style.transform = "";
    }
    revealTarget = null;
    revealAxis = null;
  });

  rootEl.addEventListener("touchcancel", () => {
    if (!revealTarget) return;
    const row = revealTarget.querySelector(ROW_SEL);
    delete row.dataset.dragging;
    row.style.transform = "";
    revealTarget = null;
    revealAxis = null;
  });

  return {
    resetReveal,
    isAnyRevealed: () => activeSwiped !== null,
  };
}
