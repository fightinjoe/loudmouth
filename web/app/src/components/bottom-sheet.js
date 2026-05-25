/**
 * bottom-sheet — the generic primitive used by every action pane.
 *
 * Owns: scrim creation/animation, panel slide-up, swipe-down dismiss,
 * scrim-click dismiss, transition cleanup. Callers supply the body
 * HTML (or a render function) and the `kind` class for styling.
 *
 * Usage:
 *   const sheet = openBottomSheet(appEl, {
 *     kind: 'translation',           // adds class `translation-panel`
 *     bodyHTML: '<div>...</div>',    // pane contents below the handle
 *     onClose: () => {},             // optional, fires after fade-out
 *     onMount: (panel, scrim) => {}, // wire interactions, capture refs
 *   })
 *   // returns: { panel, scrim, close }
 *
 * The primitive does NOT inject a pane header — callers render their
 * own (back button, title, etc.) inside `bodyHTML`. It DOES inject the
 * `.sheet-handle` drag bar above the body.
 */

const KIND_TO_PANEL_CLASS = {
  translation: "translation-panel",
  generate: "generate-cards-panel",
  settings: "deck-settings-panel",
};
const KIND_TO_SCRIM_CLASS = {
  translation: "translation-scrim",
  generate: "generate-cards-scrim",
  settings: "deck-settings-scrim",
};

export function openBottomSheet(appEl, { kind, bodyHTML, onClose, onMount }) {
  const panelClass = KIND_TO_PANEL_CLASS[kind] || `${kind}-panel`;
  const scrimClass = KIND_TO_SCRIM_CLASS[kind] || `${kind}-scrim`;

  const scrim = document.createElement("div");
  scrim.className = `${scrimClass} fixed-inset scrim scrim-clear transition-bg`;
  appEl.appendChild(scrim);

  const panel = document.createElement("div");
  panel.className = `${panelClass} bottom-sheet bg-primary transition-sheet`;
  panel.innerHTML = `<div class="sheet-handle"></div>${bodyHTML}`;
  appEl.appendChild(panel);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    panel.classList.remove("bottom-sheet--visible");
    scrim.classList.remove("scrim-visible");
    panel.addEventListener(
      "transitionend",
      () => {
        panel.remove();
        scrim.remove();
        onClose?.();
      },
      { once: true },
    );
  }

  scrim.addEventListener("click", close);
  wireSwipeDownDismiss(panel, close);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrim.classList.add("scrim-visible");
      panel.classList.add("bottom-sheet--visible");
    });
  });

  onMount?.(panel, scrim, close);

  return { panel, scrim, close };
}

/**
 * Swipe-down-to-dismiss gesture. Initiates only from .sheet-handle or
 * .pane-header to avoid conflicting with scrollable sheet content.
 * Tracks the finger in real time and snaps back or commits on touchend.
 */
function wireSwipeDownDismiss(panel, onDismiss, threshold = 80) {
  let startY = null, startX = null, axis = null;

  panel.addEventListener("touchstart", (e) => {
    if (!e.target.closest(".sheet-handle, .pane-header")) return;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    axis = null;
    panel.dataset.dragging = "";
  }, { passive: true });

  panel.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;
    if (!axis) {
      if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
      axis = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
    }
    if (axis !== "v") return;
    panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, { passive: true });

  panel.addEventListener("touchend", (e) => {
    if (startY === null) return;
    const dy = e.changedTouches[0].clientY - startY;
    delete panel.dataset.dragging;
    panel.style.transform = "";
    if (axis === "v" && dy >= threshold) onDismiss();
    startY = null; startX = null; axis = null;
  }, { passive: true });

  panel.addEventListener("touchcancel", () => {
    if (startY === null) return;
    delete panel.dataset.dragging;
    panel.style.transform = "";
    startY = null; startX = null; axis = null;
  }, { passive: true });
}
