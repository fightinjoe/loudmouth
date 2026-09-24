import type { AppUI } from "../js/app-types";

/** Options shared by the content pane's shell, pager, reveal, and reorder gestures. */
export interface WireContentGesturesOptions {
  rootEl: HTMLElement;
  handleEl: HTMLElement;
  reorderHandleEl: HTMLElement;
  ui: AppUI;
  isEdit: () => boolean;
}

export interface SyncPagerOptions {
  animate?: boolean;
  focus?: boolean;
}

/** Imperative gesture state retained by the content pane between renders. */
export interface ContentGesturesHandle {
  resetReveal: () => void;
  syncPager: (pageKey: string | null, options?: SyncPagerOptions) => void;
  isAnyRevealed: () => boolean;
}

type Axis = "h" | "v";

type Point = {
  x: number;
  y: number;
};

type PageDrag = Point & {
  pages: HTMLElement;
  pointerId: number;
  startLeft: number;
  index: number;
  active: boolean;
  fromLeft: boolean;
  shell: boolean;
};

type ReorderState = {
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
const PAGE_THRESHOLD = 45;
const PAGE_AXIS_LOCK = 8;
const PAGE_GUTTER = 50;
const PAGE_DURATION = 280;
const CARD_WRAPPER_SEL = ".card-row-wrapper";
const ROW_SEL = ".card-row";
const SWIPED_CLASS = "card-row-wrapper--swiped";
const REORDER_THRESHOLD_PX = 4;
const REORDER_PLACEHOLDER_CLASS = "card-row-reorder-placeholder";
const REORDER_REORDERING_CLASS = "deck-page-list--reordering";
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

/**
 * Wires the content pane's gesture surfaces without taking ownership of its
 * rendered DOM. Callers keep the returned handle for render-time pager sync
 * and reveal reset.
 */
export function wireContentGestures({
  rootEl,
  handleEl,
  reorderHandleEl,
  ui,
  isEdit,
}: WireContentGesturesOptions): ContentGesturesHandle {
  // ── Shell edge swipe ────────────────────────────────────────────────────
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
  }, { passive: true });

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
  }, { passive: false });

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
  }, { passive: true });
  handleEl.addEventListener("touchcancel", (event) => {
    const touch = firstTouch(event.changedTouches);
    endShell(touch?.clientX ?? shellStartX ?? 0);
  }, { passive: true });

  // ── Phrasebook pager ────────────────────────────────────────────────────
  const scrollAnimations = new WeakMap<HTMLElement, number>();
  let observedPages: HTMLElement | null = null;
  let observedWidth = 0;
  let pageDrag: PageDrag | null = null;
  let suppressPageClick = false;

  function stopScrollAnimation(element: HTMLElement): void {
    const frame = scrollAnimations.get(element);
    if (frame !== undefined) cancelAnimationFrame(frame);
    scrollAnimations.delete(element);
  }

  function reduceMotion(): boolean {
    return typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function animateScroll(
    element: HTMLElement,
    requestedLeft: number,
    animate = true,
  ): void {
    stopScrollAnimation(element);
    const from = element.scrollLeft;
    const to = Math.max(0, Math.min(
      requestedLeft,
      Math.max(0, element.scrollWidth - element.clientWidth),
    ));
    if (!animate || reduceMotion() || Math.abs(to - from) < 1) {
      element.scrollLeft = to;
      return;
    }
    const startedAt = performance.now();
    function step(now: number): void {
      if (!element.isConnected) {
        scrollAnimations.delete(element);
        return;
      }
      const progress = Math.min(1, (now - startedAt) / PAGE_DURATION);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.scrollLeft = from + (to - from) * eased;
      if (progress < 1) {
        scrollAnimations.set(element, requestAnimationFrame(step));
      } else {
        scrollAnimations.delete(element);
      }
    }
    scrollAnimations.set(element, requestAnimationFrame(step));
  }

  function watchPagerSize(pages: HTMLElement | null): void {
    if (observedPages === pages) return;
    if (observedPages) resizeObserver?.unobserve(observedPages);
    observedPages = pages;
    observedWidth = pages?.clientWidth ?? 0;
    if (pages) resizeObserver?.observe(pages);
  }

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => {
        const target = entries[0]?.target;
        if (!(target instanceof HTMLElement)
          || !target.isConnected
          || target.clientWidth === observedWidth) return;
        observedWidth = target.clientWidth;
        syncPager(ui.get("content").pageKey, { animate: false });
      })
    : null;

  function revealTab(
    strip: HTMLElement,
    tab: HTMLElement,
    index: number,
    count: number,
    animate: boolean,
  ): void {
    const stripRect = strip.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const centered = strip.scrollLeft
      + tabRect.left
      - stripRect.left
      + (tabRect.width - strip.clientWidth) / 2;
    const destination = index === 0
      ? 0
      : index === count - 1
      ? strip.scrollWidth - strip.clientWidth
      : centered;
    animateScroll(strip, destination, animate);
  }

  function syncPager(
    pageKey: string | null,
    { animate = true, focus = false }: SyncPagerOptions = {},
  ): void {
    const pages = rootEl.querySelector<HTMLElement>('[data-region="deck-pages"]');
    const strip = rootEl.querySelector<HTMLElement>('[data-region="deck-tabs"]');
    handleEl.toggleAttribute("data-paging", Boolean(pages) && !isEdit());
    if (!pages || !strip) {
      watchPagerSize(null);
      return;
    }
    watchPagerSize(pages);

    const tabs = [...strip.querySelectorAll<HTMLElement>('[role="tab"]')];
    const panels = [...pages.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    let index = tabs.findIndex((tab) => tab.dataset.pageKey === pageKey);
    if (index < 0) index = 0;

    tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel, panelIndex) => {
      panel.inert = panelIndex !== index;
    });

    const selectedTab = tabs[index];
    if (!selectedTab) return;
    revealTab(strip, selectedTab, index, tabs.length, animate);
    animateScroll(pages, index * pages.clientWidth, animate);
    if (focus) selectedTab.focus({ preventScroll: true });
  }

  function selectPage(pageKey: string, options?: SyncPagerOptions): void {
    ui.transition("content/set-page", { pageKey });
    // A bounded swipe or re-select returns the same slice reference, so the
    // subscriber may not run. Always finish alignment from the current offset.
    syncPager(pageKey, options);
  }

  rootEl.addEventListener("keydown", (event) => {
    const tab = closestHTMLElement(event.target, ".deck-tab");
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const parent = tab.parentElement;
    if (!parent) return;
    const tabs = [...parent.querySelectorAll<HTMLElement>(".deck-tab")];
    const current = tabs.indexOf(tab);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
      ? tabs.length - 1
      : Math.max(0, Math.min(
          tabs.length - 1,
          current + (event.key === "ArrowRight" ? 1 : -1),
        ));
    const nextPageKey = tabs[next]?.dataset.pageKey;
    if (!nextPageKey) return;
    event.preventDefault();
    selectPage(nextPageKey, { focus: true });
  });

  rootEl.addEventListener("pointerdown", (event) => {
    const pages = closestHTMLElement(event.target, '[data-region="deck-pages"]');
    if (!pages || isEdit() || !event.isPrimary || event.button !== 0) return;
    const bounds = pages.getBoundingClientRect();
    const fromLeft = event.clientX - bounds.left <= PAGE_GUTTER;
    const fromRight = bounds.right - event.clientX <= PAGE_GUTTER;
    if (!fromLeft && !fromRight) return;
    stopScrollAnimation(pages);
    const selectedTab = rootEl.querySelector<HTMLElement>('.deck-tab[aria-selected="true"]');
    const tabs = [...rootEl.querySelectorAll<HTMLElement>(".deck-tab")];
    pageDrag = {
      pages,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startLeft: pages.scrollLeft,
      index: Math.max(0, selectedTab ? tabs.indexOf(selectedTab) : -1),
      active: false,
      fromLeft,
      shell: false,
    };
  });

  rootEl.addEventListener("pointermove", (event) => {
    if (!pageDrag || event.pointerId !== pageDrag.pointerId) return;
    const dx = event.clientX - pageDrag.x;
    const dy = event.clientY - pageDrag.y;
    if (!pageDrag.active) {
      if (Math.abs(dx) <= PAGE_AXIS_LOCK && Math.abs(dy) <= PAGE_AXIS_LOCK) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        pageDrag = null;
        return;
      }
      // Each gutter only accepts an inward swipe.
      if ((pageDrag.fromLeft && dx < 0) || (!pageDrag.fromLeft && dx > 0)) {
        pageDrag = null;
        return;
      }
      pageDrag.shell = pageDrag.fromLeft && pageDrag.index === 0;
      pageDrag.active = true;
      pageDrag.pages.dataset.dragging = "";
      rootEl.setPointerCapture?.(event.pointerId);
      pageDrag.pages.style.userSelect = "none";
    }
    event.preventDefault();
    if (pageDrag.shell) {
      rootEl.dataset.dragging = "";
      rootEl.style.transform = `translateX(${Math.max(0, Math.min(pageDrag.pages.clientWidth, dx))}px)`;
    } else {
      const width = pageDrag.pages.clientWidth;
      pageDrag.pages.scrollLeft = pageDrag.startLeft - Math.max(-width, Math.min(width, dx));
    }
  }, { passive: false });

  rootEl.addEventListener("touchmove", (event) => {
    // Pointer capture and pointermove.preventDefault() do not claim native
    // touch scrolling. Once horizontal intent is locked, prevent the browser
    // from taking over on vertical drift and cancelling our pointer stream.
    if (pageDrag?.active && event.touches.length === 1 && event.cancelable) {
      event.preventDefault();
    }
  }, { passive: false });

  function endPageDrag(event: PointerEvent, cancelled = false): void {
    if (!pageDrag || event.pointerId !== pageDrag.pointerId) return;
    const drag = pageDrag;
    pageDrag = null;
    delete drag.pages.dataset.dragging;
    drag.pages.style.userSelect = "";
    if (rootEl.hasPointerCapture?.(event.pointerId)) rootEl.releasePointerCapture(event.pointerId);
    if (drag.shell) {
      delete rootEl.dataset.dragging;
      rootEl.style.transform = "";
    }
    const tabs = [...rootEl.querySelectorAll<HTMLElement>(".deck-tab")];
    if (!tabs.length) return;
    let nextIndex = drag.index;
    if (drag.active && !cancelled) {
      const dx = event.clientX - drag.x;
      if (Math.abs(dx) > PAGE_THRESHOLD) {
        if (drag.shell) ui.transition("shell/toggle");
        else nextIndex += dx < 0 ? 1 : -1;
      }
      suppressPageClick = true;
      setTimeout(() => {
        suppressPageClick = false;
      }, 0);
    }
    nextIndex = Math.max(0, Math.min(tabs.length - 1, nextIndex));
    const nextPageKey = tabs[nextIndex]?.dataset.pageKey;
    if (nextPageKey) selectPage(nextPageKey);
  }

  rootEl.addEventListener("pointerup", (event) => endPageDrag(event));
  rootEl.addEventListener("pointercancel", (event) => endPageDrag(event, true));
  rootEl.addEventListener("lostpointercapture", (event) => {
    // Touch starts with implicit capture on the card; transferring it to the
    // pane must not cancel the drag when that child's lost event bubbles.
    if (event.target === rootEl) endPageDrag(event, true);
  });
  rootEl.addEventListener("click", (event) => {
    if (!suppressPageClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressPageClick = false;
  }, true);
  rootEl.addEventListener("pointerdown", (event) => {
    const strip = closestHTMLElement(event.target, '[data-region="deck-tabs"]');
    if (strip) stopScrollAnimation(strip);
  }, { passive: true });
  rootEl.addEventListener("wheel", (event) => {
    const strip = closestHTMLElement(event.target, '[data-region="deck-tabs"]');
    if (strip) stopScrollAnimation(strip);
  }, { passive: true });

  // ── Legacy row reveal ───────────────────────────────────────────────────
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
    // Horizontal list-interior movement belongs to the phrasebook pager.
    if (!touch || !wrapper || wrapper.closest(".deck-pages")) return;
    const row = cardRow(wrapper);
    if (!row) return;
    revealStart = { x: touch.clientX, y: touch.clientY };
    revealTarget = wrapper;
    revealAxis = null;
    row.dataset.dragging = "";
  }, { passive: false });

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
  }, { passive: false });

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
  });

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
  });

  // ── Edit-mode reorder ──────────────────────────────────────────────────
  let reorderState: ReorderState | null = null;

  function listRegion(): HTMLElement | null {
    return rootEl.querySelector<HTMLElement>(
      '.deck-page:not([inert]) [data-region="card-list"], .deck-view-list[data-region="card-list"]',
    );
  }

  function visibleRows(region: HTMLElement | null): HTMLElement[] {
    return region
      ? [...region.querySelectorAll<HTMLElement>(`${CARD_WRAPPER_SEL}[data-entry-key]`)]
      : [];
  }


  function updatePlaceholderPosition(state: ReorderState, ghostMidY: number): number {
    const region = listRegion();
    if (!region) return state.currentIndex;
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
    const region = listRegion();
    if (!region) return;
    const allRows = visibleRows(region);
    // The edge handle is outside inset and speaker-aligned bubbles; match its vertical row.
    const startIndex = allRows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return touch.clientY >= rect.top && touch.clientY < rect.bottom;
    });
    const row = allRows[startIndex];
    if (!row) return;
    reorderState = {
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
  }, { passive: true });

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
      const region = listRegion();
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
  }, { passive: false });

  function endReorder(): void {
    if (!reorderState) return;
    const { ghostEl, placeholderEl, startIndex, currentIndex } = reorderState;
    const region = listRegion();
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

  reorderHandleEl.addEventListener("touchend", endReorder);
  reorderHandleEl.addEventListener("touchcancel", () => {
    if (!reorderState) return;
    const { ghostEl, placeholderEl, startIndex } = reorderState;
    const region = listRegion();
    if (region) {
      const siblings = visibleRows(region).filter((row) => row !== placeholderEl);
      region.insertBefore(placeholderEl, siblings[startIndex] ?? null);
      region.classList.remove(REORDER_REORDERING_CLASS);
      delete region.dataset.dragging;
    }
    ghostEl?.remove();
    placeholderEl.classList.remove(REORDER_PLACEHOLDER_CLASS);
    reorderState = null;
  });

  return {
    resetReveal,
    syncPager,
    isAnyRevealed: () => activeSwiped !== null,
  };
}
