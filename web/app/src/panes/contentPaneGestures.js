/**
 * contentPaneGestures — all touch gestures on the content pane.
 *
 * Three gesture families, all attached to stable elements:
 *   - Shell slide: swipe right/left on handleEl to reveal/hide the nav pane
 *   - Reveal:      swipe left on a card row to expose action buttons
 *   - Reorder:     long-press the reorder handle to drag cards into a new order
 *
 * @param {Object} app
 * @returns {{ shell: { open, close, setSuppressed }, reveal: { reset, isAnyOpen }, setReorderCallback }}
 */
export function wireContentPaneGestures(app) {
  const { appEl, contentPaneEl, handleEl } = app.els;
  const meatEl = contentPaneEl.querySelector(".meat");

  // ── Shell slide gesture ─────────────────────────────────────────────────────
  // Swipe right on the handle to push content-pane into the background (revealing
  // nav pane). Swipe left to bring it back to the foreground.
  // Inline transform is applied during touchmove only; resting positions are
  // driven by CSS via #app[data-content].

  const NAV_PANE_WIDTH = 280;
  const OPEN_THRESHOLD = 100;

  let shellStartX = null;
  let shellStartY = null;
  let shellAxis = null;
  let shellIsOpen = false;
  let _isSuppressed = null;

  function setShellOpen(open, animate = true) {
    shellIsOpen = open;
    if (!animate) contentPaneEl.dataset.dragging = "";
    appEl.dataset.content = open ? "background" : "foreground";
    if (!animate)
      requestAnimationFrame(() => delete contentPaneEl.dataset.dragging);
  }

  handleEl.addEventListener(
    "touchstart",
    (e) => {
      if (!shellIsOpen && e.target.closest(".content-pane-scrim")) return;
      if (_isSuppressed && _isSuppressed()) return;
      shellStartX = e.touches[0].clientX;
      shellStartY = e.touches[0].clientY;
      shellAxis = null;
    },
    { passive: true },
  );

  handleEl.addEventListener(
    "touchmove",
    (e) => {
      if (shellStartX === null) return;
      const dx = e.touches[0].clientX - shellStartX;
      const dy = e.touches[0].clientY - shellStartY;

      if (!shellAxis) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        shellAxis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (shellAxis !== "h") return;
      if (!shellIsOpen && dx < 0) return;
      if (shellIsOpen && dx > 0) return;

      const base = shellIsOpen ? NAV_PANE_WIDTH : 0;
      const clamped = Math.max(0, Math.min(NAV_PANE_WIDTH, base + dx));
      contentPaneEl.dataset.dragging = "";
      contentPaneEl.style.transform = `translateX(${clamped}px)`;
      if (app.els.scrim)
        app.els.scrim.style.opacity = String(clamped / NAV_PANE_WIDTH);
    },
    { passive: false },
  );

  handleEl.addEventListener(
    "touchend",
    (e) => {
      if (shellStartX === null) return;
      const dx = e.changedTouches[0].clientX - shellStartX;
      delete contentPaneEl.dataset.dragging;
      contentPaneEl.style.transform = "";
      if (app.els.scrim) app.els.scrim.style.opacity = "";
      shellStartX = null;

      if (shellAxis !== "h") return;
      if (!shellIsOpen && dx >= OPEN_THRESHOLD) setShellOpen(true);
      else if (shellIsOpen && dx <= -OPEN_THRESHOLD) setShellOpen(false);
      shellAxis = null;
    },
    { passive: true },
  );

  handleEl.addEventListener(
    "touchcancel",
    () => {
      if (shellStartX === null) return;
      delete contentPaneEl.dataset.dragging;
      contentPaneEl.style.transform = "";
      if (app.els.scrim) app.els.scrim.style.opacity = "";
      shellStartX = null;
      shellAxis = null;
    },
    { passive: true },
  );

  handleEl.addEventListener("click", () => setShellOpen(false));

  // ── Reveal gesture state ────────────────────────────────────────────────────
  // Swipe left on a card row to slide it left and expose the action buttons
  // behind it. Only active when not in edit mode.

  const WRAPPER_SEL = ".card-row-wrapper";
  const ROW_SEL = ".card-row";
  const SWIPED_CLASS = "card-row-wrapper--swiped";
  const REVEAL_WIDTH = 160;
  const REVEAL_THRESHOLD = 80;

  let revealStartX = 0;
  let revealStartY = 0;
  let revealTarget = null;
  let revealAxis = null;
  let activeSwiped = null;

  // ── Reorder gesture state ───────────────────────────────────────────────────
  // Long-press the drag handle to lift a card row and reorder it. Only active
  // in edit mode.

  let reorderCallback = null;
  let reorderState = null; // { wrapperEl, ghostEl, startY, ghostTop, fromIndex, currentIndex }

  function getWrappers() {
    return [...meatEl.querySelectorAll(WRAPPER_SEL)];
  }

  function updatePlaceholderPosition(ghostMidY) {
    const siblings = getWrappers().filter((w) => w !== reorderState.wrapperEl);
    let slot = 0;
    for (let i = 0; i < siblings.length; i++) {
      const r = siblings[i].getBoundingClientRect();
      if (ghostMidY > r.top + r.height / 2) slot = i + 1;
    }
    meatEl
      .querySelector(".deck-view-list")
      .insertBefore(reorderState.wrapperEl, siblings[slot] ?? null);
    return getWrappers().indexOf(reorderState.wrapperEl);
  }

  function isEditMode() {
    return "editMode" in contentPaneEl.dataset;
  }

  // ── touchstart ─────────────────────────────────────────────────────────────

  contentPaneEl.addEventListener(
    "touchstart",
    (e) => {
      const handle = e.target.closest(".card-row-reorder-handle");
      if (handle && isEditMode()) {
        const wrapperEl = handle.closest(WRAPPER_SEL);
        if (!wrapperEl) return;
        e.stopPropagation();
        const wrappers = getWrappers();
        const fromIndex = wrappers.indexOf(wrapperEl);
        const rect = wrapperEl.getBoundingClientRect();
        const startY = e.touches[0].clientY;
        const ghostEl = wrapperEl.cloneNode(true);
        ghostEl.classList.add("card-row-reorder-ghost");
        ghostEl.querySelector(".card-row-reorder-handle")?.remove();
        ghostEl.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:500;pointer-events:none;`;
        document.body.appendChild(ghostEl);
        wrapperEl.classList.add("card-row-reorder-placeholder");
        meatEl
          .querySelector(".deck-view-list")
          ?.classList.add("deck-view-list--reordering");
        reorderState = {
          wrapperEl,
          ghostEl,
          startY,
          ghostTop: rect.top,
          fromIndex,
          currentIndex: fromIndex,
        };
        e.preventDefault();
        return;
      }

      if (isEditMode()) return;
      const wrapper = e.target.closest(WRAPPER_SEL);
      if (!wrapper) return;
      revealStartX = e.touches[0].clientX;
      revealStartY = e.touches[0].clientY;
      revealTarget = wrapper;
      revealAxis = null;
      wrapper.querySelector(ROW_SEL).dataset.dragging = "";
    },
    { passive: false },
  );

  // ── touchmove ──────────────────────────────────────────────────────────────

  contentPaneEl.addEventListener(
    "touchmove",
    (e) => {
      if (reorderState) return;
      if (!revealTarget) return;
      const dx = e.touches[0].clientX - revealStartX;
      const dy = e.touches[0].clientY - revealStartY;

      if (!revealAxis) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        revealAxis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (revealAxis !== "h") return;
      e.preventDefault();

      const isSwiped = revealTarget.classList.contains(SWIPED_CLASS);
      const base = isSwiped ? -REVEAL_WIDTH : 0;
      const clamped = Math.max(-REVEAL_WIDTH, Math.min(0, base + dx));
      revealTarget.querySelector(ROW_SEL).style.transform =
        `translateX(${clamped}px)`;
    },
    { passive: false },
  );

  // ── touchend ───────────────────────────────────────────────────────────────

  contentPaneEl.addEventListener("touchend", (e) => {
    if (!revealTarget) return;
    const row = revealTarget.querySelector(ROW_SEL);
    delete row.dataset.dragging;

    if (revealAxis === "h") {
      const dx = e.changedTouches[0].clientX - revealStartX;
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

  contentPaneEl.addEventListener("touchcancel", () => {
    if (!revealTarget) return;
    const row = revealTarget.querySelector(ROW_SEL);
    delete row.dataset.dragging;
    row.style.transform = "";
    revealTarget = null;
    revealAxis = null;
  });

  // ── Reorder: document-level move/end so finger can leave pane ──────────────

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!reorderState) return;
      const dy = e.touches[0].clientY - reorderState.startY;
      reorderState.ghostEl.style.top = reorderState.ghostTop + dy + "px";
      const ghostRect = reorderState.ghostEl.getBoundingClientRect();
      reorderState.currentIndex = updatePlaceholderPosition(
        ghostRect.top + ghostRect.height / 2,
      );
      e.preventDefault();
    },
    { passive: false },
  );

  function endReorder(cancelled) {
    if (!reorderState) return;
    const { wrapperEl, ghostEl, fromIndex, currentIndex } = reorderState;
    ghostEl.remove();
    wrapperEl.classList.remove("card-row-reorder-placeholder");
    meatEl
      .querySelector(".deck-view-list")
      ?.classList.remove("deck-view-list--reordering");
    reorderState = null;
    if (!cancelled && currentIndex !== fromIndex && reorderCallback) {
      reorderCallback(fromIndex, currentIndex);
    }
  }

  document.addEventListener("touchend", () => endReorder(false), {
    passive: true,
  });
  document.addEventListener("touchcancel", () => endReorder(true), {
    passive: true,
  });

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    shell: {
      open() {
        setShellOpen(true);
      },
      close() {
        setShellOpen(false);
      },
      setSuppressed(fn) {
        _isSuppressed = fn;
      },
    },
    reveal: {
      reset() {
        if (activeSwiped) {
          activeSwiped.classList.remove(SWIPED_CLASS);
          activeSwiped.querySelector(ROW_SEL).style.transform = "";
          activeSwiped = null;
        }
      },
      isAnyOpen() {
        return activeSwiped !== null;
      },
    },
    setReorderCallback(fn) {
      reorderCallback = fn;
    },
  };
}
