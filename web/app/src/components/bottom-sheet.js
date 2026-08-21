/**
 * bottom-sheet — the generic primitive used by every action pane.
 *
 * Owns: scrim creation/animation, panel slide-up, swipe-down dismiss,
 * scrim-click dismiss, transition cleanup. Callers supply the body
 * HTML (or a render function) and the `kind` class for styling.
 *
 * Usage:
 *   const sheet = openBottomSheet(appEl, {
 *     kind: 'settings',              // adds class `deck-settings-panel`
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
  settings: "deck-settings-panel",
  review: "review-panel",
  lookup: "lookup-panel",
  "new-phrasebook": "new-phrasebook-panel",
};
const KIND_TO_SCRIM_CLASS = {
  settings: "deck-settings-scrim",
  review: "review-scrim",
  lookup: "lookup-scrim",
  "new-phrasebook": "new-phrasebook-scrim",
};

export function openBottomSheet(appEl, { kind, bodyHTML, onClose, onMount, size = "hug" }) {
  const panelClass = KIND_TO_PANEL_CLASS[kind] || `${kind}-panel`;
  const scrimClass = KIND_TO_SCRIM_CLASS[kind] || `${kind}-scrim`;

  const scrim = document.createElement("div");
  scrim.className = `${scrimClass} fixed-inset scrim scrim-clear transition-bg`;
  appEl.appendChild(scrim);

  const panel = document.createElement("div");
  // Full-height panes (lookup, review) get their background from
  // .bottom-sheet--full (Figma gray-100) instead — bg-primary is the beige
  // default for content-hugging panes (settings, new-phrasebook).
  const bgClass = size === "full" ? "" : "bg-primary";
  panel.className = `${panelClass} bottom-sheet ${bgClass} transition-sheet${size === "full" ? " bottom-sheet--full" : ""}`.replace(/\s+/g, " ").trim();
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
