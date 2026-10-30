import type { AppUI } from "../js/app-types";

/** Native shelves share the pane with shell, row reveal, and edit reorder handles. */
export interface WireContentGesturesOptions {
  rootEl: HTMLElement;
  handleEl: HTMLElement;
  reorderHandleEl: HTMLElement;
  ui: AppUI;
  isEdit: () => boolean;
}


/** Imperative gesture state retained by the content pane between renders. */
export interface ContentGesturesHandle {
  resetReveal: () => void;
  dispose: () => void;
}

type Axis = "h" | "v";

type Point = {
  x: number;
  y: number;
};


type ReorderState = {
  region: HTMLElement;
  placeholderEl: HTMLElement;
  startIndex: number;
  currentIndex: number;
  startX: number;
  startY: number;
  ghostStartTop: number;
  ghostEl: HTMLElement | null;
  axis: Axis | null;
  active: boolean;
};

const OPEN_THRESHOLD = 100;
const REVEAL_WIDTH = 104;
const REVEAL_THRESHOLD = 80;
const CARD_WRAPPER_SEL = ".card-row-wrapper";
const ROW_SEL = ".card-row";
const SWIPED_CLASS = "card-row-wrapper--swiped";
const REORDER_THRESHOLD_PX = 4;
const REORDER_PLACEHOLDER_CLASS = "card-row-reorder-placeholder";
const REORDER_REORDERING_CLASS = "textbook-list--reordering";
const REORDER_GHOST_CLASS = "card-row-reorder-ghost";

function closestHTMLElement(target: EventTarget | null, selector: string): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest(selector);
  return element instanceof HTMLElement ? element : null;
}

function firstTouch(touches: TouchList): Touch | null {
  return touches.item(0);
}

function cardRow(wrapper: HTMLElement): HTMLElement | null {
  return wrapper.querySelector<HTMLElement>(ROW_SEL);
}

/** Shelf touches stay native; only mouse drags and focused shelf keys are handled. */
export function wireContentGestures({
  rootEl,
  handleEl,
  reorderHandleEl,
  ui,
  isEdit,
}: WireContentGesturesOptions): ContentGesturesHandle {
  // ── Shell edge swipe ────────────────────────────────────────────────────
  const listeners = new AbortController();
  const { signal } = listeners;
  let shellStartX: number | null = null;
  let shellStartY: number | null = null;
  let shellAxis: Axis | null = null;
  let shellPaneWidth = 0;

  function shellIsOpen(): boolean {
    return ui.get("shell").exposed === "background";
  }

  handleEl.addEventListener("touchstart", (event) => {
    const touch = firstTouch(event.touches);
    if (!touch) return;
    shellStartX = touch.clientX;
    shellStartY = touch.clientY;
    shellAxis = null;
    shellPaneWidth = rootEl.getBoundingClientRect().width;
  }, { passive: true, signal });

  handleEl.addEventListener("touchmove", (event) => {
    const touch = firstTouch(event.touches);
    if (shellStartX === null || shellStartY === null || !touch) return;
    const dx = touch.clientX - shellStartX;
    const dy = touch.clientY - shellStartY;
    if (!shellAxis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      shellAxis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (shellAxis !== "h") return;
    const open = shellIsOpen();
    if ((!open && dx < 0) || (open && dx > 0)) return;
    const base = open ? shellPaneWidth : 0;
    rootEl.dataset.dragging = "";
    rootEl.style.transform = `translateX(${Math.max(0, Math.min(shellPaneWidth, base + dx))}px)`;
  }, { passive: false, signal });

  function endShell(x: number): void {
    if (shellStartX === null) return;
    const dx = x - shellStartX;
    const wasOpen = shellIsOpen();
    delete rootEl.dataset.dragging;
    rootEl.style.transform = "";
    shellStartX = null;
    shellStartY = null;
    if (shellAxis === "h") {
      if (!wasOpen && dx >= OPEN_THRESHOLD) ui.transition("shell/toggle");
      else if (wasOpen && dx <= -OPEN_THRESHOLD) ui.transition("shell/toggle");
    }
    shellAxis = null;
  }

  handleEl.addEventListener("touchend", (event) => {
    const touch = firstTouch(event.changedTouches);
    if (touch) endShell(touch.clientX);
  }, { passive: true, signal });
  handleEl.addEventListener("touchcancel", () => {
    delete rootEl.dataset.dragging;
    rootEl.style.transform = "";
    shellStartX = null;
    shellStartY = null;
    shellAxis = null;
  }, { passive: true, signal });

  let shelfDrag: { shelf: HTMLElement; pointerId: number; x: number; y: number; left: number; active: boolean } | null = null;
  let suppressShelfClick = false;

  rootEl.addEventListener("keydown", (event) => {
    const shelf = closestHTMLElement(event.target, ".textbook-shelf");
    if (!shelf || event.target !== shelf || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || isEdit()) return;
    event.preventDefault();
    const left = event.key === "Home" ? 0 : event.key === "End" ? shelf.scrollWidth
      : shelf.scrollLeft + (event.key === "ArrowRight" ? 1 : -1) * shelf.clientWidth * 0.75;
    shelf.scrollLeft = Math.max(0, left);
  }, { signal });

  rootEl.addEventListener("pointerdown", (event) => {
    const shelf = closestHTMLElement(event.target, ".textbook-shelf");
    if (!shelf || event.pointerType !== "mouse" || event.button !== 0 || isEdit()) return;
    shelfDrag = { shelf, pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: shelf.scrollLeft, active: false };
  }, { signal });
  rootEl.addEventListener("pointermove", (event) => {
    if (!shelfDrag || shelfDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - shelfDrag.x;
    const dy = event.clientY - shelfDrag.y;
    if (!shelfDrag.active) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { shelfDrag = null; return; }
      shelfDrag.active = true;
      shelfDrag.shelf.dataset.dragging = "";
      rootEl.setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
    shelfDrag.shelf.scrollLeft = shelfDrag.left - dx;
  }, { signal });
  const endShelfDrag = (event: PointerEvent): void => {
    if (!shelfDrag || shelfDrag.pointerId !== event.pointerId) return;
    suppressShelfClick = shelfDrag.active;
    delete shelfDrag.shelf.dataset.dragging;
    shelfDrag = null;
    if (rootEl.hasPointerCapture?.(event.pointerId)) rootEl.releasePointerCapture(event.pointerId);
    setTimeout(() => { suppressShelfClick = false; }, 0);
  };
  rootEl.addEventListener("pointerup", endShelfDrag, { signal });
  rootEl.addEventListener("pointercancel", endShelfDrag, { signal });
  rootEl.addEventListener("click", (event) => {
    if (!suppressShelfClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { signal, capture: true });

  // ── Vertical-list row reveal ────────────────────────────────────────────
  let revealStart: Point | null = null;
  let revealAxis: Axis | null = null;
  let revealTarget: HTMLElement | null = null;
  let activeSwiped: HTMLElement | null = null;

  function resetReveal(): void {
    if (!activeSwiped) return;
    activeSwiped.classList.remove(SWIPED_CLASS);
    const row = cardRow(activeSwiped);
    if (row) row.style.transform = "";
    activeSwiped = null;
  }

  rootEl.addEventListener("touchstart", (event) => {
    if (isEdit()) return;
    const touch = firstTouch(event.touches);
    const wrapper = closestHTMLElement(event.target, CARD_WRAPPER_SEL);
    // Two-row shelves own horizontal movement; never reveal a card inside one.
    if (!touch || !wrapper || wrapper.closest(".textbook-shelf")) return;
    const row = cardRow(wrapper);
    if (!row) return;
    revealStart = { x: touch.clientX, y: touch.clientY };
    revealTarget = wrapper;
    revealAxis = null;
    row.dataset.dragging = "";
  }, { passive: false, signal });

  rootEl.addEventListener("touchmove", (event) => {
    const touch = firstTouch(event.touches);
    if (!revealTarget || !revealStart || !touch) return;
    const dx = touch.clientX - revealStart.x;
    const dy = touch.clientY - revealStart.y;
    const row = cardRow(revealTarget);
    if (!row) {
      revealTarget = null;
      revealStart = null;
      revealAxis = null;
      return;
    }
    if (!revealAxis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      revealAxis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (revealAxis !== "h") {
        delete row.dataset.dragging;
        revealTarget = null;
        revealStart = null;
        revealAxis = null;
        return;
      }
    }
    event.preventDefault();
    const base = revealTarget.classList.contains(SWIPED_CLASS) ? -REVEAL_WIDTH : 0;
    const clamped = Math.max(-REVEAL_WIDTH, Math.min(0, base + dx));
    row.style.transform = `translateX(${clamped}px)`;
  }, { passive: false, signal });

  rootEl.addEventListener("touchend", (event) => {
    const touch = firstTouch(event.changedTouches);
    if (!revealTarget || !revealStart || !touch) return;
    const target = revealTarget;
    const row = cardRow(target);
    if (row) {
      delete row.dataset.dragging;
      if (revealAxis === "h") {
        const dx = touch.clientX - revealStart.x;
        const base = target.classList.contains(SWIPED_CLASS) ? -REVEAL_WIDTH : 0;
        if (base + dx < -REVEAL_THRESHOLD) {
          if (activeSwiped && activeSwiped !== target) {
            activeSwiped.classList.remove(SWIPED_CLASS);
            const previousRow = cardRow(activeSwiped);
            if (previousRow) previousRow.style.transform = "";
          }
          target.classList.add(SWIPED_CLASS);
          activeSwiped = target;
        } else {
          target.classList.remove(SWIPED_CLASS);
          if (activeSwiped === target) activeSwiped = null;
        }
        row.style.transform = "";
      }
    }
    revealTarget = null;
    revealStart = null;
    revealAxis = null;
  }, { signal });

  rootEl.addEventListener("touchcancel", () => {
    if (!revealTarget) return;
    const row = cardRow(revealTarget);
    if (row) {
      delete row.dataset.dragging;
      row.style.transform = "";
    }
    revealTarget = null;
    revealStart = null;
    revealAxis = null;
  }, { signal });

  // ── Edit-mode reorder ──────────────────────────────────────────────────
  let reorderState: ReorderState | null = null;


  function visibleRows(region: HTMLElement | null): HTMLElement[] {
    return region
      ? [...region.querySelectorAll<HTMLElement>(`${CARD_WRAPPER_SEL}[data-entry-key]`)]
      : [];
  }


  function updatePlaceholderPosition(state: ReorderState, ghostMidY: number): number {
    const region = state.region;
    const siblings = visibleRows(region).filter((row) => row !== state.placeholderEl);
    let slot = 0;
    for (let index = 0; index < siblings.length; index += 1) {
      const sibling = siblings[index];
      if (!sibling) continue;
      const rect = sibling.getBoundingClientRect();
      if (ghostMidY > rect.top + rect.height / 2) slot = index + 1;
    }
    if (slot !== state.currentIndex) {
      region.insertBefore(state.placeholderEl, siblings[slot] ?? null);
    }
    return slot;
  }

  reorderHandleEl.addEventListener("touchstart", (event) => {
    if (!isEdit()) return;
    const touch = firstTouch(event.touches);
    if (!touch) return;
    const regions = [...rootEl.querySelectorAll<HTMLElement>("[data-reorder-region]")];
    const row = regions.flatMap(visibleRows).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return touch.clientY >= rect.top && touch.clientY < rect.bottom;
    });
    const region = row?.closest<HTMLElement>("[data-reorder-region]");
    if (!row || !region) return;
    const startIndex = visibleRows(region).indexOf(row);
    reorderState = {
      region,
      placeholderEl: row,
      startIndex,
      currentIndex: startIndex,
      startX: touch.clientX,
      startY: touch.clientY,
      ghostStartTop: row.getBoundingClientRect().top,
      ghostEl: null,
      axis: null,
      active: false,
    };
  }, { passive: true, signal });

  reorderHandleEl.addEventListener("touchmove", (event) => {
    const touch = firstTouch(event.touches);
    if (!reorderState || !touch) return;
    const dx = touch.clientX - reorderState.startX;
    const dy = touch.clientY - reorderState.startY;
    if (!reorderState.axis) {
      if (Math.abs(dy) < REORDER_THRESHOLD_PX && Math.abs(dx) < REORDER_THRESHOLD_PX) return;
      reorderState.axis = Math.abs(dy) > Math.abs(dx) ? "v" : "h";
      if (reorderState.axis !== "v") {
        reorderState = null;
        return;
      }
    }
    event.preventDefault();
    if (!reorderState.active) {
      const region = reorderState.region;
      const row = reorderState.placeholderEl;
      const rect = row.getBoundingClientRect();
      const clone = row.cloneNode(true);
      if (!(clone instanceof HTMLElement)) {
        reorderState = null;
        return;
      }
      reorderState.active = true;
      clone.classList.add(REORDER_GHOST_CLASS);
      clone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:500;pointer-events:none;`;
      document.body.appendChild(clone);
      reorderState.ghostEl = clone;
      row.classList.add(REORDER_PLACEHOLDER_CLASS);
      region?.classList.add(REORDER_REORDERING_CLASS);
      if (region) region.dataset.dragging = "";
    }
    const ghost = reorderState.ghostEl;
    if (!ghost) return;
    ghost.style.top = `${reorderState.ghostStartTop + dy}px`;
    const ghostRect = ghost.getBoundingClientRect();
    reorderState.currentIndex = updatePlaceholderPosition(
      reorderState,
      ghostRect.top + ghostRect.height / 2,
    );
  }, { passive: false, signal });

  function endReorder(): void {
    if (!reorderState) return;
    const { ghostEl, placeholderEl, startIndex, currentIndex, region } = reorderState;
    ghostEl?.remove();
    placeholderEl.classList.remove(REORDER_PLACEHOLDER_CLASS);
    region?.classList.remove(REORDER_REORDERING_CLASS);
    if (region) delete region.dataset.dragging;
    const pageOrder = visibleRows(region).flatMap((row) => {
      const entryKey = row.dataset.entryKey;
      return entryKey ? [entryKey] : [];
    });
    const committed = currentIndex !== startIndex;
    reorderState = null;
    if (committed) ui.transition("content/reorder", { pageOrder });
  }

  reorderHandleEl.addEventListener("touchend", endReorder, { signal });
  reorderHandleEl.addEventListener("touchcancel", () => {
    if (!reorderState) return;
    const { ghostEl, placeholderEl, startIndex, region } = reorderState;
    if (region) {
      const siblings = visibleRows(region).filter((row) => row !== placeholderEl);
      region.insertBefore(placeholderEl, siblings[startIndex] ?? null);
      region.classList.remove(REORDER_REORDERING_CLASS);
      delete region.dataset.dragging;
    }
    ghostEl?.remove();
    placeholderEl.classList.remove(REORDER_PLACEHOLDER_CLASS);
    reorderState = null;
  }, { signal });

  return {
    resetReveal,
    dispose: () => {
      listeners.abort();
      reorderState?.ghostEl?.remove();
      if (shelfDrag) delete shelfDrag.shelf.dataset.dragging;
    },
  };
}
