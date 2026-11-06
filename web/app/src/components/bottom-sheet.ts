export type BottomSheetSize = "hug" | "full";
export type BottomSheetClose = () => void;

export interface BottomSheetOptions {
  kind: string;
  bodyHTML: string;
  onClose?: BottomSheetClose;
  /** Stops controller resources at the start of close or immediate disposal. */
  onDispose?: () => void;
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
  dispose(): void;
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
    onDispose,
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
  let disposed = false;
  let finished = false;
  let resourcesStopped = false;
  let openingFrame: number | undefined;
  let visibleFrame: number | undefined;
  let fallback: number | undefined;

  function stopResources(): void {
    if (resourcesStopped) return;
    resourcesStopped = true;
    if (openingFrame !== undefined) cancelAnimationFrame(openingFrame);
    if (visibleFrame !== undefined) cancelAnimationFrame(visibleFrame);
    scrim.removeEventListener("click", close);
    disposeSwipe();
    onDispose?.();
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    window.clearTimeout(fallback);
    panel.removeEventListener("transitionend", onTransitionEnd);
    panel.remove();
    scrim.remove();
    if (!disposed) onClose?.();
  }

  function onTransitionEnd(event: TransitionEvent): void {
    if (event.target === panel && event.propertyName === "transform") finish();
  }

  function close(): void {
    if (closed) return;
    closed = true;
    const visible = panel.classList.contains("bottom-sheet--visible");
    panel.inert = true;
    scrim.inert = true;
    stopResources();
    if (disposed) return;
    // A sheet closed before its opening frame, or with no transition, emits no end event.
    fallback = window.setTimeout(finish, 350);
    panel.addEventListener("transitionend", onTransitionEnd);
    panel.classList.remove("bottom-sheet--visible");
    scrim.classList.remove("scrim-visible");
    if (!visible) finish();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    closed = true;
    panel.inert = true;
    scrim.inert = true;
    stopResources();
    finish();
  }

  scrim.addEventListener("click", close);
  const disposeSwipe = wireSwipeDownDismiss(panel, close);

  openingFrame = requestAnimationFrame(() => {
    openingFrame = undefined;
    if (closed) return;
    visibleFrame = requestAnimationFrame(() => {
      visibleFrame = undefined;
      if (closed) return;
      scrim.classList.add("scrim-visible");
      panel.classList.add("bottom-sheet--visible");
    });
  });

  onMount?.(panel, scrim, close);
  return { panel, scrim, close, dispose };
}

/** Wires swipe-down dismissal from the handle or pane header. */
function wireSwipeDownDismiss(
  panel: HTMLElement,
  onDismiss: BottomSheetClose,
  threshold = 80,
): () => void {
  let startY: number | null = null;
  let startX: number | null = null;
  let axis: "vertical" | "horizontal" | null = null;

  const onTouchStart = (event: TouchEvent): void => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest(".sheet-handle, .pane-header")) return;
    const touch = event.touches.item(0);
    if (!touch) return;

    startY = touch.clientY;
    startX = touch.clientX;
    axis = null;
    panel.dataset.dragging = "";
  };

  const onTouchMove = (event: TouchEvent): void => {
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
  };

  const onTouchEnd = (event: TouchEvent): void => {
    if (startY === null) return;
    const touch = event.changedTouches.item(0);
    const deltaY = touch ? touch.clientY - startY : 0;
    delete panel.dataset.dragging;
    panel.style.transform = "";
    if (axis === "vertical" && deltaY >= threshold) onDismiss();
    startY = null;
    startX = null;
    axis = null;
  };

  const reset = (): void => {
    if (startY === null) return;
    delete panel.dataset.dragging;
    panel.style.transform = "";
    startY = null;
    startX = null;
    axis = null;
  };

  panel.addEventListener("touchstart", onTouchStart, { passive: true });
  panel.addEventListener("touchmove", onTouchMove, { passive: true });
  panel.addEventListener("touchend", onTouchEnd, { passive: true });
  panel.addEventListener("touchcancel", reset, { passive: true });
  return () => {
    panel.removeEventListener("touchstart", onTouchStart);
    panel.removeEventListener("touchmove", onTouchMove);
    panel.removeEventListener("touchend", onTouchEnd);
    panel.removeEventListener("touchcancel", reset);
    reset();
  };
}
