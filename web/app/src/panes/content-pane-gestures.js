/**
 * Content pane gestures.
 *
 * The shell keeps its edge handle. Real phrasebooks give horizontal drags
 * in the list interior to page navigation; legacy browse/preview lists keep
 * row reveal. Edit mode disables both and gives the right-side static reorder
 * handle to vertical dragging.
 */

const OPEN_THRESHOLD = 100;
const REVEAL_WIDTH = 104;
const REVEAL_THRESHOLD = 80;
const PAGE_THRESHOLD = 45;
const PAGE_AXIS_LOCK = 8;
const PAGE_DURATION = 280;
const CARD_WRAPPER_SEL = ".card-row-wrapper";
const ROW_SEL = ".card-row";
const SWIPED_CLASS = "card-row-wrapper--swiped";

export function wireContentGestures({ rootEl, handleEl, reorderHandleEl, ui, isEdit }) {
  // ── Shell edge swipe ────────────────────────────────────────────────────
  let shellStartX = null;
  let shellStartY = null;
  let shellAxis = null;
  let shellPaneWidth = 0;
  function shellIsOpen() {
    return ui.get("shell")?.exposed === "background";
  }

  handleEl.addEventListener("touchstart", (event) => {
    shellStartX = event.touches[0].clientX;
    shellStartY = event.touches[0].clientY;
    shellAxis = null;
    shellPaneWidth = rootEl.getBoundingClientRect().width;
  }, { passive: true });

  handleEl.addEventListener("touchmove", (event) => {
    if (shellStartX === null) return;
    const dx = event.touches[0].clientX - shellStartX;
    const dy = event.touches[0].clientY - shellStartY;
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
  handleEl.addEventListener("touchend", (event) => endShell(event.changedTouches[0].clientX), { passive: true });
  handleEl.addEventListener("touchcancel", (event) => endShell(event.changedTouches[0].clientX), { passive: true });

  // ── Phrasebook pager ────────────────────────────────────────────────────
  const scrollAnimations = new WeakMap();
  let observedPages = null;
  let observedWidth = 0;
  let pageDrag = null;
  let suppressPageClick = false;

  function stopScrollAnimation(element) {
    const frame = scrollAnimations.get(element);
    if (frame !== undefined) cancelAnimationFrame(frame);
    scrollAnimations.delete(element);
  }

  function reduceMotion() {
    return typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function animateScroll(element, requestedLeft, animate = true) {
    if (!element) return;
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
    function step(now) {
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

  function watchPagerSize(pages) {
    if (observedPages === pages) return;
    if (observedPages) resizeObserver?.unobserve(observedPages);
    observedPages = pages;
    observedWidth = pages?.clientWidth || 0;
    if (pages) resizeObserver?.observe(pages);
  }

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => {
        const pages = entries[0]?.target;
        if (!pages?.isConnected || pages.clientWidth === observedWidth) return;
        observedWidth = pages.clientWidth;
        syncPager(ui.get("content")?.pageKey, { animate: false });
      })
    : null;

  function revealTab(strip, tab, index, count, animate) {
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

  function syncPager(pageKey, { animate = true, focus = false } = {}) {
    const pages = rootEl.querySelector('[data-region="deck-pages"]');
    const strip = rootEl.querySelector('[data-region="deck-tabs"]');
    if (!pages || !strip) {
      watchPagerSize(null);
      return;
    }
    watchPagerSize(pages);

    const tabs = [...strip.querySelectorAll('[role="tab"]')];
    const panels = [...pages.querySelectorAll('[role="tabpanel"]')];
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

  function selectPage(pageKey, options) {
    ui.transition("content/set-page", { pageKey });
    // A bounded swipe or re-select returns the same slice reference, so the
    // subscriber may not run. Always finish alignment from the current offset.
    syncPager(pageKey, options);
  }

  rootEl.addEventListener("keydown", (event) => {
    const tab = event.target.closest?.(".deck-tab");
    if (!tab) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...tab.parentElement.querySelectorAll(".deck-tab")];
    const current = tabs.indexOf(tab);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
      ? tabs.length - 1
      : Math.max(0, Math.min(
          tabs.length - 1,
          current + (event.key === "ArrowRight" ? 1 : -1),
        ));
    event.preventDefault();
    selectPage(tabs[next].dataset.pageKey, { focus: true });
  });

  rootEl.addEventListener("pointerdown", (event) => {
    const pages = event.target.closest?.('[data-region="deck-pages"]');
    if (!pages || isEdit() || !event.isPrimary || event.button !== 0) return;
    stopScrollAnimation(pages);
    const selectedTab = rootEl.querySelector('.deck-tab[aria-selected="true"]');
    const tabs = [...rootEl.querySelectorAll(".deck-tab")];
    pageDrag = {
      pages,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startLeft: pages.scrollLeft,
      index: Math.max(0, tabs.indexOf(selectedTab)),
      active: false,
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
      pageDrag.active = true;
      pageDrag.pages.dataset.dragging = "";
      pageDrag.pages.setPointerCapture?.(event.pointerId);
      pageDrag.pages.style.userSelect = "none";
    }
    event.preventDefault();
    pageDrag.pages.scrollLeft = pageDrag.startLeft - dx;
  }, { passive: false });

  function endPageDrag(event, cancelled = false) {
    if (!pageDrag || event.pointerId !== pageDrag.pointerId) return;
    const drag = pageDrag;
    pageDrag = null;
    delete drag.pages.dataset.dragging;
    drag.pages.style.userSelect = "";
    const tabs = [...rootEl.querySelectorAll(".deck-tab")];
    if (!tabs.length) return;
    let nextIndex = drag.index;
    if (drag.active && !cancelled) {
      const dx = event.clientX - drag.x;
      if (Math.abs(dx) > PAGE_THRESHOLD) nextIndex += dx < 0 ? 1 : -1;
      suppressPageClick = true;
      setTimeout(() => {
        suppressPageClick = false;
      }, 0);
    }
    nextIndex = Math.max(0, Math.min(tabs.length - 1, nextIndex));
    selectPage(tabs[nextIndex].dataset.pageKey);
  }

  rootEl.addEventListener("pointerup", (event) => endPageDrag(event));
  rootEl.addEventListener("pointercancel", (event) => endPageDrag(event, true));
  rootEl.addEventListener("click", (event) => {
    if (!suppressPageClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressPageClick = false;
  }, true);
  rootEl.addEventListener("pointerdown", (event) => {
    const strip = event.target.closest?.('[data-region="deck-tabs"]');
    if (strip) stopScrollAnimation(strip);
  }, { passive: true });
  rootEl.addEventListener("wheel", (event) => {
    const strip = event.target.closest?.('[data-region="deck-tabs"]');
    if (strip) stopScrollAnimation(strip);
  }, { passive: true });

  // ── Legacy row reveal ───────────────────────────────────────────────────
  let revealStart = null;
  let revealAxis = null;
  let revealTarget = null;
  let activeSwiped = null;

  function resetReveal() {
    if (!activeSwiped) return;
    activeSwiped.classList.remove(SWIPED_CLASS);
    activeSwiped.querySelector(ROW_SEL).style.transform = "";
    activeSwiped = null;
  }

  rootEl.addEventListener("touchstart", (event) => {
    if (isEdit()) return;
    const wrapper = event.target.closest(CARD_WRAPPER_SEL);
    // Horizontal list-interior movement belongs to the phrasebook pager.
    if (!wrapper || wrapper.closest(".deck-pages")) return;
    revealStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    revealTarget = wrapper;
    revealAxis = null;
    wrapper.querySelector(ROW_SEL).dataset.dragging = "";
  }, { passive: false });

  rootEl.addEventListener("touchmove", (event) => {
    if (!revealTarget) return;
    const dx = event.touches[0].clientX - revealStart.x;
    const dy = event.touches[0].clientY - revealStart.y;
    if (!revealAxis) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      revealAxis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (revealAxis !== "h") {
        delete revealTarget.querySelector(ROW_SEL).dataset.dragging;
        revealTarget = null;
        revealAxis = null;
        return;
      }
    }
    event.preventDefault();
    const base = revealTarget.classList.contains(SWIPED_CLASS) ? -REVEAL_WIDTH : 0;
    const clamped = Math.max(-REVEAL_WIDTH, Math.min(0, base + dx));
    revealTarget.querySelector(ROW_SEL).style.transform = `translateX(${clamped}px)`;
  }, { passive: false });

  rootEl.addEventListener("touchend", (event) => {
    if (!revealTarget) return;
    const row = revealTarget.querySelector(ROW_SEL);
    delete row.dataset.dragging;
    if (revealAxis === "h") {
      const dx = event.changedTouches[0].clientX - revealStart.x;
      const base = revealTarget.classList.contains(SWIPED_CLASS) ? -REVEAL_WIDTH : 0;
      if (base + dx < -REVEAL_THRESHOLD) {
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

  // ── Edit-mode reorder ──────────────────────────────────────────────────
  const REORDER_THRESHOLD_PX = 4;
  const REORDER_PLACEHOLDER_CLASS = "card-row-reorder-placeholder";
  const REORDER_REORDERING_CLASS = "deck-page-list--reordering";
  const REORDER_GHOST_CLASS = "card-row-reorder-ghost";
  let reorderState = null;

  function listRegion() {
    return rootEl.querySelector(
      '.deck-page:not([inert]) [data-region="card-list"], .deck-view-list[data-region="card-list"]',
    );
  }

  function visibleRows(region) {
    return region
      ? [...region.querySelectorAll(`${CARD_WRAPPER_SEL}[data-card-id]`)]
      : [];
  }

  function findRowAt(x, y) {
    const previous = reorderHandleEl.style.pointerEvents;
    reorderHandleEl.style.pointerEvents = "none";
    const element = document.elementFromPoint(x, y);
    reorderHandleEl.style.pointerEvents = previous;
    return element?.closest(CARD_WRAPPER_SEL) || null;
  }

  function updatePlaceholderPosition(state, ghostMidY) {
    const region = listRegion();
    if (!region) return state.currentIndex;
    const siblings = visibleRows(region).filter((row) => row !== state.placeholderEl);
    let slot = 0;
    for (let index = 0; index < siblings.length; index++) {
      const rect = siblings[index].getBoundingClientRect();
      if (ghostMidY > rect.top + rect.height / 2) slot = index + 1;
    }
    if (slot !== state.currentIndex) {
      region.insertBefore(state.placeholderEl, siblings[slot] ?? null);
    }
    return slot;
  }

  reorderHandleEl.addEventListener("touchstart", (event) => {
    if (!isEdit()) return;
    const touch = event.touches[0];
    const row = findRowAt(touch.clientX, touch.clientY);
    const region = listRegion();
    if (!row || !region || !region.contains(row)) return;
    const allRows = visibleRows(region);
    const startIndex = allRows.indexOf(row);
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
    if (!reorderState) return;
    const touch = event.touches[0];
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
      reorderState.active = true;
      const region = listRegion();
      const row = reorderState.placeholderEl;
      const rect = row.getBoundingClientRect();
      const ghost = row.cloneNode(true);
      ghost.classList.add(REORDER_GHOST_CLASS);
      ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:500;pointer-events:none;`;
      document.body.appendChild(ghost);
      reorderState.ghostEl = ghost;
      row.classList.add(REORDER_PLACEHOLDER_CLASS);
      region?.classList.add(REORDER_REORDERING_CLASS);
      if (region) region.dataset.dragging = "";
    }
    reorderState.ghostEl.style.top = `${reorderState.ghostStartTop + dy}px`;
    const ghostRect = reorderState.ghostEl.getBoundingClientRect();
    reorderState.currentIndex = updatePlaceholderPosition(
      reorderState,
      ghostRect.top + ghostRect.height / 2,
    );
  }, { passive: false });

  function endReorder() {
    if (!reorderState) return;
    const { ghostEl, placeholderEl, startIndex, currentIndex } = reorderState;
    const region = listRegion();
    if (ghostEl) ghostEl.remove();
    placeholderEl.classList.remove(REORDER_PLACEHOLDER_CLASS);
    region?.classList.remove(REORDER_REORDERING_CLASS);
    if (region) delete region.dataset.dragging;
    const pageOrder = visibleRows(region).map((row) => row.dataset.cardId);
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
    if (ghostEl) ghostEl.remove();
    placeholderEl.classList.remove(REORDER_PLACEHOLDER_CLASS);
    reorderState = null;
  });

  return {
    resetReveal,
    syncPager,
    isAnyRevealed: () => activeSwiped !== null,
  };
}
