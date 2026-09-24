export type BottomSheetSize = "hug" | "full";
export type BottomSheetClose = () => void;

export interface BottomSheetOptions {
  kind: string;
  bodyHTML: string;
  onClose?: BottomSheetClose;
  onMount?: (
    panel: HTMLDivElement,
    scrim: HTMLDivElement,
    close: BottomSheetClose,
  ) => void;
  size?: BottomSheetSize;
}

export interface BottomSheetHandle {
  panel: HTMLDivElement;
  scrim: HTMLDivElement;
  close: BottomSheetClose;
}

const KIND_TO_PANEL_CLASS: Readonly<Record<string, string>> = {
  settings: "deck-settings-panel",
  review: "review-panel",
  "new-phrasebook": "new-phrasebook-panel",
  creation: "creation-panel",
};

const KIND_TO_SCRIM_CLASS: Readonly<Record<string, string>> = {
  settings: "deck-settings-scrim",
  review: "review-scrim",
  "new-phrasebook": "new-phrasebook-scrim",
  creation: "creation-scrim",
};

/** Opens the generic animated action-pane bottom sheet. */
export function openBottomSheet(
  appElement: HTMLElement,
  {
    kind,
    bodyHTML,
    onClose,
    onMount,
    size = "hug",
  }: BottomSheetOptions,
): BottomSheetHandle {
  const panelClass = KIND_TO_PANEL_CLASS[kind] || `${kind}-panel`;
  const scrimClass = KIND_TO_SCRIM_CLASS[kind] || `${kind}-scrim`;

  const scrim = document.createElement("div");
  scrim.className = `${scrimClass} fixed-inset scrim scrim-clear transition-bg`;
  appElement.appendChild(scrim);

  const panel = document.createElement("div");
  const backgroundClass = size === "full" ? "" : "bg-primary";
  panel.className = `${panelClass} bottom-sheet ${backgroundClass} transition-sheet${size === "full" ? " bottom-sheet--full" : ""}`
    .replace(/\s+/g, " ")
    .trim();
  panel.innerHTML = `<div class="sheet-handle"></div>${bodyHTML}`;
  appElement.appendChild(panel);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    const visible = panel.classList.contains("bottom-sheet--visible");
    panel.inert = true;
    scrim.inert = true;
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallback);
      panel.removeEventListener("transitionend", onTransitionEnd);
      panel.remove();
      scrim.remove();
      onClose?.();
    };
    const onTransitionEnd = (event: TransitionEvent): void => {
      if (event.target === panel && event.propertyName === "transform") finish();
    };
    // A sheet closed before its opening frame, or with no transition, emits no end event.
    const fallback = window.setTimeout(finish, 350);
    panel.addEventListener("transitionend", onTransitionEnd);
    panel.classList.remove("bottom-sheet--visible");
    scrim.classList.remove("scrim-visible");
    if (!visible) finish();
  }

  scrim.addEventListener("click", close);
  wireSwipeDownDismiss(panel, close);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (closed) return;
      scrim.classList.add("scrim-visible");
      panel.classList.add("bottom-sheet--visible");
    });
  });

  onMount?.(panel, scrim, close);
  return { panel, scrim, close };
}

/** Wires swipe-down dismissal from the handle or pane header. */
function wireSwipeDownDismiss(
  panel: HTMLElement,
  onDismiss: BottomSheetClose,
  threshold = 80,
): void {
  let startY: number | null = null;
  let startX: number | null = null;
  let axis: "vertical" | "horizontal" | null = null;

  panel.addEventListener("touchstart", (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest(".sheet-handle, .pane-header")) return;
    const touch = event.touches.item(0);
    if (!touch) return;

    startY = touch.clientY;
    startX = touch.clientX;
    axis = null;
    panel.dataset.dragging = "";
  }, { passive: true });

  panel.addEventListener("touchmove", (event) => {
    if (startY === null || startX === null) return;
    const touch = event.touches.item(0);
    if (!touch) return;

    const deltaY = touch.clientY - startY;
    const deltaX = touch.clientX - startX;
    if (!axis) {
      if (Math.abs(deltaY) < 4 && Math.abs(deltaX) < 4) return;
      axis = Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";
    }
    if (axis !== "vertical") return;
    panel.style.transform = `translateY(${Math.max(0, deltaY)}px)`;
  }, { passive: true });

  panel.addEventListener("touchend", (event) => {
    if (startY === null) return;
    const touch = event.changedTouches.item(0);
    const deltaY = touch ? touch.clientY - startY : 0;
    delete panel.dataset.dragging;
    panel.style.transform = "";
    if (axis === "vertical" && deltaY >= threshold) onDismiss();
    startY = null;
    startX = null;
    axis = null;
  }, { passive: true });

  panel.addEventListener("touchcancel", () => {
    if (startY === null) return;
    delete panel.dataset.dragging;
    panel.style.transform = "";
    startY = null;
    startX = null;
    axis = null;
  }, { passive: true });
}
