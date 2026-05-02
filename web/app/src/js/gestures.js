/**
 * wireSheetDismissGesture — swipe-down on a bottom sheet panel to dismiss it.
 *
 * Tracks the finger in real-time, translating the panel downward. Commits
 * (calls onDismiss) if displacement exceeds the threshold, otherwise snaps back.
 * Only initiates from .sheet-handle or .pane-header to avoid conflicting with
 * scrollable content inside the sheet.
 *
 * @param {HTMLElement} panelEl   The bottom sheet element.
 * @param {Function}    onDismiss Called when the swipe-down threshold is met.
 * @param {number}      threshold Downward drag distance needed to commit (default 80).
 */
export function wireSheetDismissGesture(panelEl, onDismiss, threshold = 80) {
  let startX = null;
  let startY = null;
  let axis = null;

  panelEl.addEventListener(
    "touchstart",
    (e) => {
      const handle = e.target.closest(".sheet-handle, .pane-header");
      if (!handle) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      axis = null;
      panelEl.dataset.dragging = "";
    },
    { passive: true },
  );

  panelEl.addEventListener(
    "touchmove",
    (e) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      if (!axis) {
        if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
        axis = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
      }
      if (axis !== "v") return;

      const clamped = Math.max(0, dy);
      panelEl.style.transform = `translateY(${clamped}px)`;
    },
    { passive: true },
  );

  panelEl.addEventListener(
    "touchend",
    (e) => {
      if (startY === null) return;
      const dy = e.changedTouches[0].clientY - startY;
      delete panelEl.dataset.dragging;
      startX = null;
      startY = null;

      if (axis === "v" && dy >= threshold) {
        panelEl.style.transform = "";
        onDismiss();
      } else {
        panelEl.style.transform = "";
      }
      axis = null;
    },
    { passive: true },
  );

  panelEl.addEventListener(
    "touchcancel",
    () => {
      if (startY === null) return;
      delete panelEl.dataset.dragging;
      panelEl.style.transform = "";
      startX = null;
      startY = null;
      axis = null;
    },
    { passive: true },
  );
}
