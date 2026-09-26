type Alignment = "first" | "last" | "center" | "visual" | "manual";

type Geometry = {
  left: number;
  midpoint: number;
  alignment: Alignment;
  signature: string;
};

type SelectionMotion = { startedAt: number; progress: number };
type EntranceMotion = { startedAt: number; progress: number };

const SELECTION_DURATION = 280;
const ENTRANCE_DURATION = 360;
const easeOut = (progress: number): number => 1 - (1 - progress) ** 3;

/** Owns only strip geometry; the pane retains all tab and panel elements. */
export function wireTabMotion(rootEl: HTMLElement) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let row: HTMLElement | null = null;
  let strip: HTMLElement | null = null;
  let slot: HTMLElement | null = null;
  let pinned: HTMLElement | null = null;
  let selected: HTMLElement | null = null;
  let manual = false;
  let geometry: Geometry | null = null;
  let captured: Geometry | null = null;
  let selection: SelectionMotion | null = null;
  let entrance: EntranceMotion | null = null;
  let frame: number | null = null;
  let observed = new Set<HTMLElement>();

  function topics(): HTMLElement[] {
    return [...strip?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []];
  }

  function maximum(): number {
    return strip ? Math.max(0, strip.scrollWidth - strip.clientWidth) : 0;
  }

  function destination(): number {
    if (!row || !strip || !selected || !strip.contains(selected)) return strip?.scrollLeft ?? 0;
    const tabs = topics();
    const index = tabs.indexOf(selected);
    if (index <= 0) return 0;
    if (index === tabs.length - 1) return maximum();
    const bounds = row.getBoundingClientRect();
    const tab = selected.getBoundingClientRect();
    return Math.max(0, Math.min(maximum(), strip.scrollLeft
      + tab.left + tab.width / 2 - bounds.left - bounds.width / 2));
  }

  function signature(): string {
    if (!row || !strip) return "";
    const bounds = row.getBoundingClientRect();
    return [bounds.left, bounds.width, strip.clientWidth, strip.scrollWidth,
      pinned?.getBoundingClientRect().width ?? 0,
      ...topics().flatMap((tab) => [tab.offsetLeft, tab.getBoundingClientRect().width]),
    ].join(":");
  }

  function measure(): Geometry | null {
    if (!row || !strip) return null;
    let alignment: Alignment = "manual";
    if (!manual && selected && strip.contains(selected)) {
      const tabs = topics();
      const index = tabs.indexOf(selected);
      alignment = selection ? "visual" : index === 0 ? "first"
        : index === tabs.length - 1 ? "last" : "center";
    }
    const bounds = row.getBoundingClientRect();
    const tab = selected?.getBoundingClientRect();
    return {
      left: strip.scrollLeft,
      midpoint: tab ? tab.left + tab.width / 2 - bounds.left - bounds.width / 2 : 0,
      alignment,
      signature: signature(),
    };
  }

  function updateEdge(): void {
    row?.toggleAttribute("data-scrolled", Boolean(strip && strip.scrollLeft > 0));
  }

  function remember(): void {
    updateEdge();
    geometry = measure();
  }

  function compensate(before: Geometry | null): void {
    if (!strip || !row || !before) return;
    if (before.alignment === "first") strip.scrollLeft = 0;
    else if (before.alignment === "last") strip.scrollLeft = maximum();
    else if (before.alignment === "center") strip.scrollLeft = destination();
    else if (before.alignment === "visual" && selected && strip.contains(selected)) {
      const bounds = row.getBoundingClientRect();
      const tab = selected.getBoundingClientRect();
      strip.scrollLeft += tab.left + tab.width / 2 - bounds.left - bounds.width / 2 - before.midpoint;
    } else strip.scrollLeft = before.left;
  }

  function applyEntrance(progress: number): void {
    if (!slot || !pinned) return;
    // Measure the intrinsic tab, never its temporarily clipped slot.
    slot.style.width = `${pinned.getBoundingClientRect().width * progress}px`;
    slot.style.opacity = String(progress);
  }

  function clearEntrance(): void {
    slot?.style.removeProperty("width");
    slot?.style.removeProperty("opacity");
    entrance = null;
  }

  function requestFrame(): void {
    if (frame === null && (selection || entrance)) frame = requestAnimationFrame(tick);
  }

  function tick(now: number): void {
    frame = null;
    if (!row?.isConnected || !strip) {
      selection = null;
      clearEntrance();
      return;
    }
    const before = measure();
    if (entrance) {
      const progress = Math.min(1, (now - entrance.startedAt) / ENTRANCE_DURATION);
      entrance.progress = easeOut(progress);
      if (progress === 1) clearEntrance();
      else applyEntrance(entrance.progress);
      compensate(before);
    }
    if (selection) {
      const progress = Math.min(1, (now - selection.startedAt) / SELECTION_DURATION);
      const eased = easeOut(progress);
      const remaining = 1 - selection.progress;
      const fraction = remaining > 0 ? (eased - selection.progress) / remaining : 1;
      strip.scrollLeft += (destination() - strip.scrollLeft) * fraction;
      selection.progress = eased;
      if (progress === 1) selection = null;
    }
    remember();
    requestFrame();
  }

  function layoutChanged(): void {
    if (!row?.isConnected || !strip || !geometry || signature() === geometry.signature) return;
    const before = geometry;
    if (entrance) applyEntrance(entrance.progress);
    compensate(before);
    remember();
  }

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(layoutChanged) : null;

  function watchLayout(): void {
    const next = new Set([row, strip, pinned, ...topics()].filter((el): el is HTMLElement => Boolean(el)));
    for (const element of observed) if (!next.has(element)) observer?.unobserve(element);
    for (const element of next) if (!observed.has(element)) observer?.observe(element);
    observed = next;
  }

  function onScroll(): void {
    // Native scrolling can deliver a scroll event after a coordinated width
    // write. Never use that event to restart motion or reset the edge fade.
    remember();
  }

  function captureTabGeometry(): void {
    captured = measure();
  }

  function sync(pageKey: string | null, animate: boolean, preserveStrip: boolean): void {
    const nextRow = rootEl.querySelector<HTMLElement>('[data-region="deck-tabs"]');
    const nextStrip = nextRow?.querySelector<HTMLElement>('[data-region="deck-tab-scroll"]') ?? null;
    const nextSlot = nextRow?.querySelector<HTMLElement>(".deck-pinned-slot") ?? null;
    const nextPinned = nextSlot?.querySelector<HTMLElement>('[role="tab"]') ?? null;
    const changedRow = row !== nextRow || strip !== nextStrip;
    const appeared = Boolean(nextPinned && (changedRow || !pinned));
    const before = changedRow ? null : captured ?? geometry;
    captured = null;
    if (changedRow) {
      strip?.removeEventListener("scroll", onScroll);
      clearEntrance();
      selection = null;
      manual = false;
      geometry = null;
    }
    row = nextRow;
    strip = nextStrip;
    slot = nextSlot;
    pinned = nextPinned;
    if (changedRow) strip?.addEventListener("scroll", onScroll, { passive: true });
    const nextSelected = [...row?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []]
      .find((tab) => tab.dataset.pageKey === pageKey) ?? null;
    const changedSelection = nextSelected !== selected;
    selected = nextSelected;
    if (!row || !strip) {
      clearEntrance();
      watchLayout();
      return;
    }
    if (!pinned) clearEntrance();
    if (appeared && !reducedMotion.matches) {
      entrance = { startedAt: performance.now(), progress: 0 };
      applyEntrance(0);
    } else if (entrance) applyEntrance(entrance.progress);

    if (!selected || !strip.contains(selected)) {
      selection = null;
      manual = true;
      // Selecting Starred must not move the topic strip, even mid-animation.
      if (preserveStrip && before) strip.scrollLeft = before.left;
    } else if (preserveStrip && before) {
      // Returning from an emptied Starred page preserves the manual offset.
      if (changedSelection) selection = null;
      compensate(before);
    } else {
      manual = false;
      selection = null;
      if (animate && !reducedMotion.matches && Math.abs(destination() - strip.scrollLeft) >= 1) {
        selection = { startedAt: performance.now(), progress: 0 };
      } else strip.scrollLeft = destination();
    }
    remember();
    watchLayout();
    requestFrame();
  }

  function takeOver(event: Event): void {
    if (!(event.target instanceof Element) || !event.target.closest('[data-region="deck-tabs"]')) return;
    selection = null;
    manual = true;
    remember();
  }

  rootEl.addEventListener("pointerdown", takeOver, { passive: true });
  rootEl.addEventListener("touchstart", takeOver, { passive: true });
  rootEl.addEventListener("wheel", takeOver, { passive: true });
  window.addEventListener("resize", layoutChanged);
  document.fonts?.addEventListener("loadingdone", layoutChanged);
  function settleReducedMotion(): void {
    if (!reducedMotion.matches) return;
    const before = measure();
    const settleSelection = Boolean(selection);
    clearEntrance();
    compensate(before);
    selection = null;
    if (settleSelection && strip) strip.scrollLeft = destination();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    remember();
  }
  reducedMotion.addEventListener("change", settleReducedMotion);

  function dispose(): void {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    selection = null;
    clearEntrance();
    observer?.disconnect();
    observed.clear();
    strip?.removeEventListener("scroll", onScroll);
    rootEl.removeEventListener("pointerdown", takeOver);
    rootEl.removeEventListener("touchstart", takeOver);
    rootEl.removeEventListener("wheel", takeOver);
    window.removeEventListener("resize", layoutChanged);
    document.fonts?.removeEventListener("loadingdone", layoutChanged);
    reducedMotion.removeEventListener("change", settleReducedMotion);
  }

  return { captureTabGeometry, sync, dispose };
}
