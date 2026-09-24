import type {
  BreakdownRequest,
  BreakdownResponse,
} from "@catchphrase/card-schema";
import { cardIdentity } from "@catchphrase/card-schema";
import {
  renderExplanations,
  renderReadyBody,
  renderSource,
} from "../components/phrase-breakdown";
import { icon } from "../components/icon";
import {
  breakdownCandidates,
  candidateAt,
  cardRequest,
  readCache,
  writeCache,
} from "../js/phrase-breakdown";
import { db, getCards, toggleCardStar } from "../js/db";
import { getPhraseBreakdown } from "../js/phrasebook-api";
import { speak, ttsText } from "../js/tts";
import { escapeHTML } from "../js/utils";
import type { AppHost, AppSlices, AppTransitions } from "../js/app-types";
import type {
  Deck,
  Group,
  LibraryEntry,
  ReadingDisplay,
} from "../js/library-types";

const MOTION_MS = 400;
let requestSequence = 0;


export interface DetailsOpen {
  entry: LibraryEntry;
  deck?: Deck;
  group?: Group;
  opener: HTMLElement;
  readingDisplay?: ReadingDisplay;
  showEnglish?: boolean;
  showReadings?: boolean;
}

export interface TargetState {
  cardId?: string;
  starredAt: string | null;
  pending: boolean;
  error?: string;
}

interface DetailsBaseState {
  entry: LibraryEntry;
  deck?: Deck;
  group?: Group;
  opener: HTMLElement;
  readingDisplay: ReadingDisplay;
  showEnglish: boolean;
  showReadings: boolean;
  selectedIndex: number;
  all: boolean;
  requestId: number;
  targets: Record<string, TargetState>;
}

export interface DetailsLoadingState extends DetailsBaseState {
  status: "loading";
  breakdown: null;
  regenerating: false;
  error: null;
}

export interface DetailsErrorState extends DetailsBaseState {
  status: "error";
  breakdown: null;

  regenerating: false;
  error: string;
}

export interface DetailsReadyState extends DetailsBaseState {
  status: "ready";
  breakdown: BreakdownResponse;
  regenerating: boolean;
  error: string | null;
}

export type DetailsState =
  | DetailsLoadingState
  | DetailsErrorState
  | DetailsReadyState;
export type DetailsSlice = DetailsState | null;

const initialState: DetailsSlice = null;

function nextRequestId(): number {
  requestSequence += 1;
  return requestSequence;
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function geometryElement(opener: HTMLElement): HTMLElement {
  return opener.closest<HTMLElement>(".card-row") ?? opener;
}

function frame(rect: DOMRect, extras: Record<string, string> = {}): Record<string, string> {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    ...extras,
  };
}

function contentChanged(
  next: AppSlices["content"],
  prev: AppSlices["content"],
): boolean {
  return next.deckId !== prev.deckId
    || next.deck !== prev.deck
    || next.browse !== prev.browse
    || next.pageKey !== prev.pageKey
    || next.editMode !== prev.editMode;
}

function readyState(
  slice: DetailsState,
  breakdown: BreakdownResponse,
): DetailsReadyState {
  const replacing = slice.status === "ready";
  return {
    ...slice,
    status: "ready",
    breakdown,
    regenerating: false,
    error: null,
    selectedIndex: replacing
      ? Math.min(slice.selectedIndex, breakdown.chunks.length - 1)
      : 0,
    all: replacing && slice.all && breakdown.chunks.length > 1,
    targets: {},
  };
}

const transitions: AppTransitions = {
  "details/open": (_slice, payload) => ({
    entry: payload.entry,
    ...(payload.deck === undefined ? {} : { deck: payload.deck }),
    ...(payload.group === undefined ? {} : { group: payload.group }),
    opener: payload.opener,
    readingDisplay: payload.readingDisplay ?? "reading",
    showEnglish: payload.showEnglish !== false,
    showReadings: payload.showReadings !== false,
    status: "loading",
    breakdown: null,
    regenerating: false,
    error: null,
    selectedIndex: 0,
    all: false,
    requestId: nextRequestId(),
    targets: {},
  }),
  "details/close": () => null,
  "details/retry": (slice) => {
    if (!slice) return slice;
    if (slice.status === "error") {
      return {
        ...slice,
        status: "loading",
        error: null,
        requestId: nextRequestId(),
      };
    }
    if (slice.status === "ready" && slice.error && !slice.regenerating) {
      return {
        ...slice,
        regenerating: true,
        error: null,
        requestId: nextRequestId(),
      };
    }
    return slice;
  },
  "details/regenerate": (slice) => slice?.status === "ready" && !slice.regenerating
    ? {
        ...slice,
        regenerating: true,
        error: null,
        requestId: nextRequestId(),
      }
    : slice,
  "details/loaded": (slice, payload) => slice && slice.requestId === payload.requestId
    ? readyState(slice, payload.breakdown)
    : slice,
  "details/failed": (slice, payload) => {
    if (!slice || slice.requestId !== payload.requestId) return slice;
    if (slice.status === "ready") {
      return {
        ...slice,
        regenerating: false,
        error: payload.error,
      };
    }
    return {
      ...slice,
      status: "error",
      breakdown: null,
      regenerating: false,
      error: payload.error,
    };
  },
  "details/select-part": (slice, payload) => {
    if (!slice || slice.status !== "ready"
      || !Number.isInteger(payload.index)
      || payload.index < 0
      || payload.index >= slice.breakdown.chunks.length
      || (!slice.all && payload.index === slice.selectedIndex)) {
      return slice;
    }
    return { ...slice, selectedIndex: payload.index, all: false };
  },
  "details/toggle-all": (slice) => slice?.status === "ready"
    && slice.breakdown.chunks.length > 1
    ? { ...slice, all: !slice.all }
    : slice,
  "details/targets-resolved": (slice, payload) => {
    if (!slice || slice.status !== "ready" || slice.requestId !== payload.requestId) return slice;
    const targets: Record<string, TargetState> = {};
    for (const [identity, target] of Object.entries(payload.targets)) {
      const current = slice.targets[identity];
      targets[identity] = {
        ...target,
        pending: current?.pending ?? target.pending,
        ...(current?.error === undefined ? {} : { error: current.error }),
      };
    }
    return { ...slice, targets };
  },
  "details/target-pending": (slice, payload) => {
    if (!slice || slice.status !== "ready") return slice;
    const target = slice.targets[payload.identity];
    if (!target) return slice;
    return {
      ...slice,
      targets: {
        ...slice.targets,
        [payload.identity]: {
          ...target,
          pending: payload.pending,
          error: undefined,
        },
      },
    };
  },
  "details/target-failed": (slice, payload) => {
    if (!slice || slice.status !== "ready") return slice;
    const target = slice.targets[payload.identity];
    if (!target) return slice;
    return {
      ...slice,
      targets: {
        ...slice.targets,
        [payload.identity]: {
          ...target,
          pending: false,
          error: payload.error,
        },
      },
    };
  },
};

interface OriginGeometry {
  rect: DOMRect;
  backgroundColor: string;
  borderRadius: string;
  element: HTMLElement;
}

async function readTargetStates(slice: DetailsReadyState): Promise<Record<string, TargetState>> {
  const identities = [...new Set(
    breakdownCandidates(slice.breakdown).map((location) => location.identity),
  )];
  if (identities.length === 0) return {};
  const records = await db.cards.where("identityKey").anyOf(identities).toArray();
  const recordByIdentity = new Map(records.map((record) => [record.identityKey, record]));
  const deck = slice.deck;
  const memberships = deck
    ? await db.memberships.bulkGet(
        records.map((record): [string, string] => [deck.id, record.id]),
      )
    : [];
  const membershipByCard = new Map<string, NonNullable<(typeof memberships)[number]>>();
  for (const membership of memberships) {
    if (membership) membershipByCard.set(membership.cardId, membership);
  }
  return Object.fromEntries(identities.map((identity) => {
    const record = recordByIdentity.get(identity);
    const membership = record ? membershipByCard.get(record.id) : undefined;
    return [identity, {
      ...(record === undefined ? {} : { cardId: record.id }),
      starredAt: membership?.starredAt ?? null,
      pending: false,
    }];
  }));
}

const detailsPane = {
  namespace: "details",
  initialState,
  transitions,

  render(): string {
    return `<div id="details-layer" data-details-state="closed" data-details-view="loading" aria-hidden="true">
      <button type="button" class="details-scrim" data-action="details/close" tabindex="-1" aria-label="Close phrase breakdown"></button>
      <section class="details-surface" role="dialog" aria-modal="true" aria-label="Phrase breakdown">
        <div class="details-scroll">
          <div class="details-source" data-region="details-source"></div>
          <div class="details-body details-reveal" data-region="details-body"></div>
        </div>
        <button type="button" class="details-close details-reveal" data-action="details/close">Close</button>
      </section>
    </div>`;
  },

  bindEvents(rootEl: HTMLElement, host: AppHost): () => void {
    const { ui, delegate, stageEl } = host;
    if (!delegate || !stageEl) throw new Error("Details pane requires a delegate and stage");
    const surface = rootEl.querySelector<HTMLElement>(".details-surface");
    const scrollEl = rootEl.querySelector<HTMLElement>(".details-scroll");
    const sourceEl = rootEl.querySelector<HTMLElement>('[data-region="details-source"]');
    const bodyEl = rootEl.querySelector<HTMLElement>('[data-region="details-body"]');
    const closeEl = rootEl.querySelector<HTMLButtonElement>(".details-close");
    const appShell = stageEl.querySelector<HTMLElement>("#app-shell");
    if (!surface || !scrollEl || !sourceEl || !bodyEl || !closeEl) {
      throw new Error("Details pane is missing required elements");
    }

    let requestController: AbortController | null = null;
    let motion: Animation | null = null;
    let motionFallback: number | undefined;
    let lifecycle = 0;
    let targetResolution = 0;
    let origin: OriginGeometry | null = null;

    function reducedMotion(): boolean {
      return typeof matchMedia === "function"
        && matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function cancelMotion(): void {
      motion?.cancel();
      clearTimeout(motionFallback);
      motion = null;
      motionFallback = undefined;
    }

    function settleMotion(animation: Animation, callback: () => void): void {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        if (motion === animation) {
          animation.cancel();
          motion = null;
        }
        clearTimeout(motionFallback);
        motionFallback = undefined;
        callback();
      };
      animation.onfinish = finish;
      motionFallback = setTimeout(finish, MOTION_MS + 80);
    }

    function restoreOrigin(): void {
      if (origin) delete origin.element.dataset.detailsOrigin;
    }

    function setClosed(opener?: HTMLElement): void {
      restoreOrigin();
      rootEl.inert = true;
      if (appShell) appShell.inert = false;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      rootEl.dataset.detailsState = "closed";
      rootEl.setAttribute("aria-hidden", "true");
    }

    const beginOpen = (slice: DetailsState): void => {
      const token = ++lifecycle;
      cancelMotion();
      restoreOrigin();
      scrollEl.scrollTop = 0;
      const target = geometryElement(slice.opener);
      const rect = target.isConnected
        ? target.getBoundingClientRect()
        : surface.getBoundingClientRect();
      const style = target.isConnected ? getComputedStyle(target) : getComputedStyle(surface);
      origin = {
        rect,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        element: target,
      };
      target.dataset.detailsOrigin = "";
      rootEl.inert = false;
      rootEl.removeAttribute("aria-hidden");
      rootEl.dataset.detailsState = "opening";
      if (appShell) appShell.inert = true;
      closeEl.focus({ preventScroll: true });
      if (reducedMotion()) {
        rootEl.dataset.detailsState = "open";
        return;
      }
      const destination = surface.getBoundingClientRect();
      motion = surface.animate([
        frame(rect, {
          backgroundColor: origin.backgroundColor,
          borderRadius: origin.borderRadius || "16px",
        }),
        frame(destination, {
          backgroundColor: getComputedStyle(surface).backgroundColor,
          borderRadius: "20px",
        }),
      ], { duration: MOTION_MS, easing: "cubic-bezier(.22,.75,.2,1)" });
      settleMotion(motion, () => {
        if (token === lifecycle && ui.get("details")) {
          rootEl.dataset.detailsState = "open";
        }
      });
    };

    const beginClose = (slice: DetailsState): void => {
      const token = ++lifecycle;
      const from = surface.getBoundingClientRect();
      const { backgroundColor, borderRadius } = getComputedStyle(surface);
      cancelMotion();
      sourceEl.innerHTML = renderSource(slice, false);
      rootEl.dataset.detailsState = "closing";
      const target = geometryElement(slice.opener);
      const to = target.isConnected ? target.getBoundingClientRect() : origin?.rect ?? from;
      const targetStyle = target.isConnected ? getComputedStyle(target) : null;
      const finish = (): void => {
        if (token !== lifecycle || ui.get("details")) return;
        setClosed(slice.opener);
      };
      if (reducedMotion()) {
        finish();
        return;
      }
      motion = surface.animate([
        frame(from, { backgroundColor, borderRadius }),
        frame(to, {
          backgroundColor: targetStyle?.backgroundColor ?? origin?.backgroundColor ?? "",
          borderRadius: targetStyle?.borderRadius ?? origin?.borderRadius ?? "16px",
        }),
      ], { duration: MOTION_MS, easing: "cubic-bezier(.22,.75,.2,1)" });
      settleMotion(motion, finish);
    };

    function closeImmediately(): void {
      if (ui.get("details")) ui.transition("details/close");
      ++lifecycle;
      ++targetResolution;
      cancelMotion();
      setClosed();
    }

    function syncTargetControls(slice: DetailsReadyState): void {
      rootEl.querySelectorAll<HTMLButtonElement>(".details-target-star").forEach((button) => {
        const identity = button.dataset.targetIdentity;
        if (!identity) return;
        const target = slice.targets[identity];
        const starred = target?.starredAt != null;
        button.disabled = !target || target.pending;
        button.setAttribute("aria-pressed", String(starred));
        button.dataset.selected = String(starred);
        if (!target || target.pending) button.setAttribute("aria-busy", "true");
        else button.removeAttribute("aria-busy");
        const kind = button.dataset.targetKind;
        const chunkIndex = Number(button.dataset.chunkIndex);
        const wordIndex = button.dataset.wordIndex === undefined
          ? undefined
          : Number(button.dataset.wordIndex);
        const candidate = (kind === "word" || kind === "chunk")
          ? candidateAt(slice.breakdown, chunkIndex, kind, wordIndex)
          : null;
        if (candidate) {
          button.setAttribute(
            "aria-label",
            `${starred ? "Unstar" : "Star"}: ${candidate.card.translation}`,
          );
        }
        button.innerHTML = icon(starred ? "star-fill" : "star");
      });
      rootEl.querySelectorAll<HTMLElement>(".details-target-error").forEach((element) => {
        const error = element.dataset.targetIdentity
          ? slice.targets[element.dataset.targetIdentity]?.error
          : undefined;
        element.textContent = error ?? "";
        element.hidden = !error;
      });
    }

    function syncRegeneration(slice: DetailsReadyState): void {
      const regenerate = rootEl.querySelector<HTMLButtonElement>(
        '[data-action="details/regenerate"]',
      );
      if (regenerate) {
        regenerate.disabled = slice.regenerating;
        regenerate.textContent = slice.regenerating ? "REGENERATING…" : "REGENERATE";
        if (slice.regenerating) regenerate.setAttribute("aria-busy", "true");
        else regenerate.removeAttribute("aria-busy");
      }
      const error = rootEl.querySelector<HTMLElement>(".details-regenerate-error");
      if (error) {
        const text = error.querySelector<HTMLElement>("span");
        if (text) text.textContent = slice.error ?? "";
        error.hidden = !slice.error;
      }
    }

    function syncReady(slice: DetailsReadyState, renderTeaching: boolean): void {
      rootEl.querySelectorAll<HTMLElement>(".details-phrase-part").forEach((part) => {
        part.setAttribute(
          "aria-pressed",
          String(slice.all || Number(part.dataset.index) === slice.selectedIndex),
        );
      });
      const shown = slice.all
        ? slice.breakdown.chunks
        : [slice.breakdown.chunks[slice.selectedIndex]];
      const explanations = rootEl.querySelector<HTMLElement>("#details-explanations");
      if (renderTeaching && explanations) {
        explanations.innerHTML = renderExplanations(slice, shown);
      }
      const count = slice.breakdown.chunks.length;
      const countElement = rootEl.querySelector<HTMLElement>('[data-region="details-count"]');
      if (countElement) {
        countElement.textContent = slice.all
          ? `All ${count} parts`
          : `Part ${slice.selectedIndex + 1} of ${count}`;
      }
      const toggle = rootEl.querySelector<HTMLButtonElement>(
        '[data-action="details/toggle-all"]',
      );
      if (toggle) {
        toggle.textContent = slice.all ? "SHOW SELECTED" : "SHOW ALL";
        toggle.setAttribute("aria-pressed", String(slice.all));
      }
      syncTargetControls(slice);
      syncRegeneration(slice);
    }

    async function resolveTargets(slice: DetailsReadyState): Promise<void> {
      const token = ++targetResolution;
      let targets: Record<string, TargetState>;
      try {
        targets = await readTargetStates(slice);
      } catch (error) {
        const message = messageFrom(error, "Saved star state could not be loaded.");
        targets = Object.fromEntries(
          [...new Set(
            breakdownCandidates(slice.breakdown).map((location) => location.identity),
          )].map((identity) => [identity, {
            starredAt: null,
            pending: false,
            error: message,
          }]),
        );
      }
      const current = ui.get("details");
      if (token !== targetResolution
        || current?.status !== "ready"
        || current.requestId !== slice.requestId
        || current.breakdown !== slice.breakdown
        || current.entry !== slice.entry) {
        return;
      }
      ui.transition("details/targets-resolved", {
        requestId: slice.requestId,
        targets,
      });
    }

    const unsubRender = ui.subscribe("details", (next, prev) => {
      if (!next) {
        if (prev) beginClose(prev);
        return;
      }
      const focused = rootEl.contains(document.activeElement)
        ? document.activeElement
        : null;
      rootEl.dataset.detailsView = next.status;
      const newBreakdown = next.status === "ready"
        && (prev?.status !== "ready" || next.breakdown !== prev.breakdown);
      const replaceBody = !prev
        || next.entry !== prev.entry
        || next.status !== prev.status
        || newBreakdown;
      if (replaceBody) {
        sourceEl.innerHTML = renderSource(next, !prev);
        if (next.status === "loading") {
          bodyEl.innerHTML = '<div class="details-notice" role="status" aria-live="polite"><span class="details-spinner" aria-hidden="true"></span><strong>Breaking down this phrase…</strong></div>';
        } else if (next.status === "error") {
          bodyEl.innerHTML = `<div class="details-notice details-error" role="alert">
            <strong>The phrase breakdown couldn’t be generated.</strong>
            <span>${escapeHTML(next.error)}</span>
            <button type="button" data-action="details/retry">Retry</button>
          </div>`;
        } else {
          bodyEl.innerHTML = renderReadyBody(next);
        }
      }
      if (next.status === "ready") {
        const selectionChanged = newBreakdown
          || prev?.status !== "ready"
          || next.selectedIndex !== prev.selectedIndex
          || next.all !== prev.all;
        syncReady(next, selectionChanged);
        if (newBreakdown) void resolveTargets(next);
      }
      if (focused instanceof HTMLElement
        && (!focused.isConnected || focused.closest("[hidden], [inert]"))) {
        closeEl.focus({ preventScroll: true });
      }
      if (!prev || next.entry !== prev.entry) beginOpen(next);
    });

    const unsubRequest = ui.subscribe("details", (next, prev) => {
      if (!next) {
        requestController?.abort();
        requestController = null;
        ++targetResolution;
        return;
      }
      const shouldLoad = next.status === "loading"
        && (prev?.status !== "loading" || next.requestId !== prev.requestId);
      const shouldRegenerate = next.status === "ready"
        && next.regenerating
        && (prev?.status !== "ready"
          || !prev.regenerating
          || next.requestId !== prev.requestId);
      if (!shouldLoad && !shouldRegenerate) return;

      requestController?.abort();
      const controller = new AbortController();
      requestController = controller;
      const requestId = next.requestId;
      let request: BreakdownRequest;
      try {
        request = cardRequest(next.entry, next.deck, next.group);
      } catch (error) {
        requestController = null;
        ui.transition("details/failed", {
          requestId,
          error: messageFrom(error, "Invalid phrase breakdown request."),
        });
        return;
      }
      const cached = shouldRegenerate ? null : readCache(request);
      const task = cached
        ? Promise.resolve(cached)
        : getPhraseBreakdown({
            source: request.source,
            ...(request.context === undefined ? {} : { context: request.context }),
            signal: controller.signal,
          });
      void task.then((breakdown) => {
        if (controller.signal.aborted || requestController !== controller) return;
        const validated = cached ?? writeCache(request, breakdown);
        requestController = null;
        ui.transition("details/loaded", { requestId, breakdown: validated });
      }).catch((error: unknown) => {
        if (controller.signal.aborted
          || requestController !== controller
          || isAbortError(error)) {
          return;
        }
        requestController = null;
        ui.transition("details/failed", {
          requestId,
          error: messageFrom(error, "The phrase breakdown could not be generated."),
        });
      });
    });

    async function toggleTarget(element: HTMLElement): Promise<void> {
      const slice = ui.get("details");
      if (slice?.status !== "ready" || !slice.deck) return;
      const identity = element.dataset.targetIdentity;
      const kind = element.dataset.targetKind;
      const chunkIndex = Number(element.dataset.chunkIndex);
      const wordIndex = element.dataset.wordIndex === undefined
        ? undefined
        : Number(element.dataset.wordIndex);
      if (!identity || (kind !== "word" && kind !== "chunk")
        || !Number.isInteger(chunkIndex)
        || (wordIndex !== undefined && !Number.isInteger(wordIndex))) {
        return;
      }
      const candidate = candidateAt(slice.breakdown, chunkIndex, kind, wordIndex);
      if (!candidate || cardIdentity(candidate.card) !== identity
        || !slice.targets[identity] || slice.targets[identity].pending) {
        return;
      }

      const deckId = slice.deck.id;
      const entry = slice.entry;
      const breakdown = slice.breakdown;
      ui.transition("details/target-pending", { identity, pending: true });
      try {
        await toggleCardStar(deckId, candidate);
      } catch (error) {
        const current = ui.get("details");
        if (current?.status === "ready"
          && current.deck?.id === deckId
          && current.entry === entry
          && current.breakdown === breakdown) {
          ui.transition("details/target-failed", {
            identity,
            error: messageFrom(error, "The learning item could not be saved."),
          });
        }
        const failed = ui.get("details");
        if (failed?.status === "ready"
          && failed.deck?.id === deckId
          && failed.entry === entry
          && failed.breakdown === breakdown) {
          void resolveTargets(failed);
        }
        return;
      }

      let current = ui.get("details");
      if (current?.status !== "ready"
        || current.deck?.id !== deckId
        || current.entry !== entry
        || current.breakdown !== breakdown) {
        return;
      }
      ui.transition("details/target-pending", { identity, pending: false });

      try {
        const cards = await getCards(deckId);
        const content = ui.get("content");
        current = ui.get("details");
        if (content.deckId === deckId
          && current?.status === "ready"
          && current.deck?.id === deckId
          && current.entry === entry
          && current.breakdown === breakdown) {
          ui.transition("content/cards-changed", { cards, deckId });
        }
      } catch {
        // The authoritative target refresh below can still show the committed star.
      }

      current = ui.get("details");
      if (current?.status === "ready"
        && current.deck?.id === deckId
        && current.entry === entry
        && current.breakdown === breakdown) {
        await resolveTargets(current);
      }
    }

    const actions: Array<readonly [
      string,
      (event: MouseEvent, element: HTMLElement) => void,
    ]> = [
      ["details/close", () => ui.transition("details/close")],
      ["details/retry", () => ui.transition("details/retry")],
      ["details/regenerate", () => ui.transition("details/regenerate")],
      ["details/toggle-all", () => ui.transition("details/toggle-all")],
      ["details/select-part", (_event, element) => {
        ui.transition("details/select-part", { index: Number(element.dataset.index) });
      }],
      ["details/play-audio", () => {
        const slice = ui.get("details");
        if (slice) speak(ttsText(slice.entry.card), slice.entry.card.lang);
      }],
      ["details/toggle-target", (_event, element) => {
        void toggleTarget(element);
      }],
    ];
    actions.forEach(([name, handler]) => delegate.register(name, handler));

    const onKeyDown = (event: KeyboardEvent): void => {
      if (rootEl.dataset.detailsState === "closed") return;
      if (event.key === "Escape") {
        event.preventDefault();
        ui.transition("details/close");
        return;
      }
      if (event.target instanceof HTMLElement
        && event.target.matches('.details-phrase-part[role="button"]')
        && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.target.click();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...surface.querySelectorAll<HTMLElement>(
        'button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.closest("[hidden]") && !element.closest("[inert]"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    rootEl.addEventListener("keydown", onKeyDown);

    const unsubAction = ui.subscribe("action", (next) => {
      if (next && rootEl.dataset.detailsState !== "closed") closeImmediately();
    });
    const unsubShell = ui.subscribe("shell", (next, prev) => {
      if (prev && next.exposed !== prev.exposed
        && rootEl.dataset.detailsState !== "closed") {
        closeImmediately();
      }
    });
    const unsubContent = ui.subscribe("content", (next, prev) => {
      if (prev && contentChanged(next, prev)
        && rootEl.dataset.detailsState !== "closed") {
        closeImmediately();
      }
    });

    setClosed();
    return () => {
      ++lifecycle;
      ++targetResolution;
      requestController?.abort();
      cancelMotion();
      unsubRender();
      unsubRequest();
      unsubAction();
      unsubShell();
      unsubContent();
      rootEl.removeEventListener("keydown", onKeyDown);
      actions.forEach(([name]) => delegate.unregister(name));
      setClosed();
    };
  },
};

export default detailsPane;
