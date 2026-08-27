/**
 * Content pane — touch gestures.
 *
 * Two gestures, both wired directly to static handles per Rule 6:
 *
 *   - Shell swipe: drag the shell-level `.shell-swipe-handle` (a sibling of
 *     nav-pane/content-pane, not nested inside either — see panes.css) to
 *     toggle shell exposure. Its position/width flip via the `[data-shell]`
 *     attribute selector: a left-edge strip opens the nav pane (swipe right
 *     from the left edge), a right-edge strip closes it back to the content
 *     pane (swipe left from the right edge) now that the nav pane is
 *     full-bleed and no longer peeks the content pane in from an edge. The
 *     gesture animates the content pane's transform; on touchend it calls
 *     `shell/toggle` if displacement crossed the threshold.
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

const OPEN_THRESHOLD = 100;
const REVEAL_WIDTH = 104;
const REVEAL_THRESHOLD = 80;
const CARD_WRAPPER_SEL = ".card-row-wrapper";
const ROW_SEL = ".card-row";
const SWIPED_CLASS = "card-row-wrapper--swiped";

export function wireContentGestures({ rootEl, handleEl, reorderHandleEl, ui, isEdit }) {
  // ── Shell swipe ─────────────────────────────────────────────────────────
  let shellStartX = null, shellStartY = null, shellAxis = null, shellPaneWidth = 0;
  function shellIsOpen() { return ui.get("shell")?.exposed === "background"; }

  handleEl.addEventListener("touchstart", (e) => {
    shellStartX = e.touches[0].clientX;
    shellStartY = e.touches[0].clientY;
    shellAxis = null;
    // The content pane's own width — it now slides its full width off
    // screen (full-bleed nav) rather than a fixed 280px peek.
    shellPaneWidth = rootEl.getBoundingClientRect().width;
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
    const base = open ? shellPaneWidth : 0;
    const clamped = Math.max(0, Math.min(shellPaneWidth, base + dx));
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
      // Bail out cleanly if axis is vertical — let scroll proceed without
      // leaving data-dragging stuck on the row until touchend.
      if (revealAxis !== "h") {
        const row = revealTarget.querySelector(ROW_SEL);
        delete row.dataset.dragging;
        revealTarget = null;
        revealAxis = null;
        return;
      }
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

  // ── Reorder gesture (edit mode) ─────────────────────────────────────────
  // Static handle overlays the list region. On touchstart we use
  // elementFromPoint to find the row underneath. Then:
  //   - clone the row as a fixed-position ghost that follows the finger
  //   - dim the original row in place as a "placeholder"
  //   - on touchmove, walk visible row rects to figure out where the
  //     placeholder should be; if it should move, swap its DOM position
  //     (siblings reflow with a CSS transition)
  //   - on touchend, the placeholder's index IS the final position; fire
  //     content/reorder if it differs from the start
  //
  // Per Rule 7: the list region carries data-dragging during the drag so
  // setListHTMLSafe-gated subscribers don't repaint and orphan the
  // placeholder/ghost.

  const REORDER_THRESHOLD_PX = 4;
  const REORDER_PLACEHOLDER_CLASS = "card-row-reorder-placeholder";
  const REORDER_REORDERING_CLASS = "deck-view-list--reordering";
  const REORDER_GHOST_CLASS = "card-row-reorder-ghost";

  let reorderState = null;
  function findRowAt(x, y) {
    const prev = reorderHandleEl.style.pointerEvents;
    reorderHandleEl.style.pointerEvents = "none";
    const el = document.elementFromPoint(x, y);
    reorderHandleEl.style.pointerEvents = prev;
    return el ? el.closest("[data-card-id]") : null;
  }

  function listRegion() {
    return rootEl.querySelector('[data-region="card-list"]');
  }

  function visibleRows(region) {
    return [...region.querySelectorAll("[data-card-id]")];
  }

  // Walk sibling rects to figure out which slot the ghost-midpoint is over.
  // Returns the new index of the placeholder (in the list ignoring itself).
  function updatePlaceholderPosition(state, ghostMidY) {
    const region = listRegion();
    if (!region) return state.currentIndex;
    const siblings = visibleRows(region).filter((r) => r !== state.placeholderEl);
    let slot = 0;
    for (let i = 0; i < siblings.length; i++) {
      const r = siblings[i].getBoundingClientRect();
      if (ghostMidY > r.top + r.height / 2) slot = i + 1;
    }
    if (slot !== state.currentIndex) {
      region.insertBefore(state.placeholderEl, siblings[slot] ?? null);
    }
    return slot;
  }

  reorderHandleEl.addEventListener("touchstart", (e) => {
    if (!isEdit()) return;
    const t = e.touches[0];
    const row = findRowAt(t.clientX, t.clientY);
    if (!row) return;
    const region = listRegion();
    if (!region) return;
    const allRows = visibleRows(region);
    const startIndex = allRows.indexOf(row);
    reorderState = {
      placeholderEl: row,
      cardId: row.dataset.cardId,
      startIndex,
      currentIndex: startIndex,
      startX: t.clientX,
      startY: t.clientY,
      ghostStartTop: row.getBoundingClientRect().top,
      ghostEl: null,
      axis: null,
      active: false,
    };
  }, { passive: true });

  reorderHandleEl.addEventListener("touchmove", (e) => {
    if (!reorderState) return;
    const t = e.touches[0];
    const dx = t.clientX - reorderState.startX;
    const dy = t.clientY - reorderState.startY;
    if (!reorderState.axis) {
      if (Math.abs(dy) < REORDER_THRESHOLD_PX && Math.abs(dx) < REORDER_THRESHOLD_PX) return;
      reorderState.axis = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
      if (reorderState.axis !== "v") { reorderState = null; return; }
    }
    if (!reorderState.active) {
      reorderState.active = true;
      const region = listRegion();
      const row = reorderState.placeholderEl;
      const rect = row.getBoundingClientRect();
      // Build the ghost as a fixed-position clone of the row.
      const ghost = row.cloneNode(true);
      ghost.classList.add(REORDER_GHOST_CLASS);
      ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:500;pointer-events:none;`;
      document.body.appendChild(ghost);
      reorderState.ghostEl = ghost;
      // Dim the original row in place; mark the region so subscribers
      // don't rebuild it (Rule 7).
      row.classList.add(REORDER_PLACEHOLDER_CLASS);
      if (region) {
        region.classList.add(REORDER_REORDERING_CLASS);
        region.dataset.dragging = "";
      }
    }
    // Track the finger with the ghost.
    reorderState.ghostEl.style.top = `${reorderState.ghostStartTop + dy}px`;
    // Decide where the placeholder belongs now.
    const ghostRect = reorderState.ghostEl.getBoundingClientRect();
    reorderState.currentIndex = updatePlaceholderPosition(
      reorderState,
      ghostRect.top + ghostRect.height / 2,
    );
  }, { passive: false });

  function endReorder() {
    if (!reorderState) return;
    const { ghostEl, placeholderEl, cardId, startIndex, currentIndex } = reorderState;
    const region = listRegion();
    if (ghostEl) ghostEl.remove();
    placeholderEl.classList.remove(REORDER_PLACEHOLDER_CLASS);
    if (region) {
      region.classList.remove(REORDER_REORDERING_CLASS);
      delete region.dataset.dragging;
    }
    const committed = currentIndex !== startIndex;
    reorderState = null;
    if (committed) ui.transition("content/reorder", { fromId: cardId, toIndex: currentIndex });
  }
  reorderHandleEl.addEventListener("touchend", endReorder);
  reorderHandleEl.addEventListener("touchcancel", () => {
    if (!reorderState) return;
    // Cancel without committing: roll back to original DOM position.
    const { ghostEl, placeholderEl, startIndex } = reorderState;
    const region = listRegion();
    if (region) {
      const siblings = visibleRows(region).filter((r) => r !== placeholderEl);
      region.insertBefore(placeholderEl, siblings[startIndex] ?? null);
    }
    if (ghostEl) ghostEl.remove();
    placeholderEl.classList.remove(REORDER_PLACEHOLDER_CLASS);
    if (region) {
      region.classList.remove(REORDER_REORDERING_CLASS);
      delete region.dataset.dragging;
    }
    reorderState = null;
  });

  return {
    resetReveal,
    isAnyRevealed: () => activeSwiped !== null,
  };
}
