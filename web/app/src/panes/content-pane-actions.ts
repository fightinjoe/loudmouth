import { toggleCardStar } from "../js/db";
import type { AppHost } from "../js/app-types";
import type { LibraryEntry } from "../js/library-types";
import { speak, ttsText } from "../js/tts";
import { isStoredDeck } from "./content-pane";

export interface RegisterCardActionsOptions {
  host: AppHost;
  rootEl: HTMLElement;
  isEdit: () => boolean;
  resetReveal: () => void;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The change could not be saved.";
}

function contentRoot(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>("#content-pane");
}

function showInlineError(element: HTMLElement, message: string | null): void {
  const errorElement = contentRoot(element)
    ?.querySelector<HTMLElement>('[data-region="content-error"]');
  if (!errorElement) return;
  errorElement.textContent = message ?? "";
  errorElement.hidden = message === null;
}

function setStarPending(element: HTMLElement, cardId: string, pending: boolean): void {
  contentRoot(element)?.querySelectorAll<HTMLButtonElement>(".card-star[data-card-id]")
    .forEach((button) => {
      if (button.dataset.cardId !== cardId) return;
      // Native disabled blurs the focused star before collection reconciliation
      // can move focus to its successor (or the previous topic on the last star).
      button.disabled = pending && button !== document.activeElement;
      if (pending) {
        button.setAttribute("aria-busy", "true");
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("aria-busy");
        button.removeAttribute("aria-disabled");
      }
    });
}

export function registerCardActions(
  { host, rootEl, isEdit, resetReveal }: RegisterCardActionsOptions,
): () => void {
  const { ui, delegate } = host;
  if (!delegate) throw new Error("Content card actions require an event delegate");

  function entryFor(element: HTMLElement): LibraryEntry | undefined {
    const entryKey = element.dataset.entryKey;
    return ui.get("content").cards.find((entry) => entry.key === entryKey);
  }

  function openEditor(element: HTMLElement): void {
    resetReveal();
    const entry = entryFor(element);
    if (entry) {
      ui.transition("action/open", { kind: "card-edit", payload: { entry } });
    }
  }

  function openDetails(element: HTMLElement): void {
    if (isEdit() || ui.get("action") || ui.get("details")) return;
    const entry = entryFor(element);
    if (entry?.card.type !== "phrase"
      || element.closest(".card-row-wrapper--swiped")) return;
    const content = ui.get("content");
    const group = entry.occurrence?.groupId
      ? content.groups.find((candidate) => candidate.id === entry.occurrence?.groupId)
      : undefined;
    ui.transition("details/open", {
      entry,
      ...(isStoredDeck(content.deck) ? { deck: content.deck } : {}),
      ...(group ? { group } : {}),
      opener: element.querySelector<HTMLElement>(".card-term") ?? element,
      readingDisplay: content.deck?.readingDisplay ?? "reading",
      showEnglish: true,
      showReadings: true,
    });
  }

  // Observe the pointer without capturing it or preventing movement: the pager,
  // scroll surface, swipe reveal, and reorder gestures retain ownership.
  let hold: {
    element: HTMLElement;
    pointerId: number;
    x: number;
    y: number;
    timer: number;
  } | null = null;
  let suppressedClick: HTMLElement | null = null;
  const document = rootEl.ownerDocument;
  const window = document.defaultView!;
  const listeners = new window.AbortController();
  const { signal } = listeners;

  function cancelHold(): void {
    if (hold) window.clearTimeout(hold.timer);
    hold = null;
  }

  function cancelInteraction(): void {
    if (hold) suppressedClick = hold.element;
    cancelHold();
  }

  function phraseRow(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)
      || target.closest(".card-row-reorder-handle")) return null;
    const row = target.closest<HTMLElement>("[data-action]");
    if (!row || !rootEl.contains(row) || row.dataset.action !== "content/open-card"
      || entryFor(row)?.card.type !== "phrase") return null;
    return row;
  }

  window.addEventListener("pointerdown", cancelInteraction, { signal, capture: true });
  rootEl.addEventListener("pointerdown", (event) => {
    cancelHold();
    suppressedClick = null;
    const element = phraseRow(event.target);
    if (!element || isEdit() || ui.get("action") || ui.get("details")
      || !event.isPrimary || event.button !== 0
      || element.closest(".card-row-wrapper--swiped")) return;
    hold = {
      element,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(() => {
        cancelHold();
        if (!element.isConnected || !rootEl.contains(element)) return;
        suppressedClick = element;
        openDetails(element);
      }, 500),
    };
  }, { signal });
  window.addEventListener("pointermove", (event) => {
    if (hold?.pointerId === event.pointerId
      && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8) {
      cancelInteraction();
    }
  }, { signal, passive: true });
  window.addEventListener("pointerup", (event) => {
    if (hold?.pointerId === event.pointerId) cancelHold();
  }, { signal });
  window.addEventListener("pointercancel", cancelInteraction, { signal });
  window.addEventListener("lostpointercapture", cancelInteraction, { signal });
  window.addEventListener("blur", cancelInteraction, { signal });
  document.addEventListener("visibilitychange", cancelInteraction, { signal });
  document.addEventListener("scroll", cancelInteraction, { signal, capture: true, passive: true });
  rootEl.addEventListener("click", (event) => {
    if (!(event.target instanceof Node) || !suppressedClick?.contains(event.target)) return;
    suppressedClick = null;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { signal, capture: true });
  rootEl.addEventListener("contextmenu", (event) => {
    const element = phraseRow(event.target);
    if (!element || isEdit()) return;
    event.preventDefault();
    if (suppressedClick === element) return;
    cancelHold();
    suppressedClick = element;
    openDetails(element);
  }, { signal });
  rootEl.addEventListener("keydown", (event) => {
    cancelHold();
    suppressedClick = null;
    if (!(event.key === "F10" && event.shiftKey) && event.key !== "ContextMenu") return;
    const element = phraseRow(event.target);
    if (!element || isEdit()) return;
    event.preventDefault();
    suppressedClick = element;
    openDetails(element);
  }, { signal });
  const unsubscribe = (["content", "nav", "shell", "action", "details"] as const)
    .map((slice) => ui.subscribe(slice, cancelInteraction));

  const starCard = async (_event: MouseEvent, element: HTMLElement): Promise<void> => {
    if (isEdit() || element.getAttribute("aria-busy") === "true") return;
    resetReveal();
    const slice = ui.get("content");
    const deck = slice.deck;
    const entry = entryFor(element);
    if (!isStoredDeck(deck) || !entry?.membership
      || entry.membership.deckId !== deck.id) return;

    const originDeckId = deck.id;
    const cardId = entry.cardId;
    // A successful unstar can remove the clicked collection row.
    const actionRoot = contentRoot(element) ?? element;
    showInlineError(element, null);
    setStarPending(actionRoot, cardId, true);
    try {
      const result = await toggleCardStar(originDeckId, { cardId });
      const current = ui.get("content");
      if (isStoredDeck(current.deck) && current.deck.id === originDeckId) {
        ui.transition("content/card-star-changed", {
          deckId: originDeckId,
          cardId: result.cardId,
          starredAt: result.starredAt,
        });
      }
    } catch (error) {
      const current = ui.get("content");
      if (isStoredDeck(current.deck) && current.deck.id === originDeckId) {
        showInlineError(element, messageFrom(error));
      }
    } finally {
      const current = ui.get("content");
      if (isStoredDeck(current.deck) && current.deck.id === originDeckId) {
        setStarPending(actionRoot, cardId, false);
      }
    }
  };

  const actions: Array<readonly [string, (event: MouseEvent, element: HTMLElement) => void]> = [
    ["content/star-card", (event, element) => { void starCard(event, element); }],

    ["content/edit-card", (_event, element) => {
      if (!isEdit()) openEditor(element);
    }],

    // Deletion is confirmed by the editor. Resolving by entry key preserves
    // the active occurrence translation when a Phrase appears more than once.
    ["content/delete-card", (_event, element) => {
      if (!isEdit()) openEditor(element);
    }],

    ["content/open-card", (_event, element) => {
      if (isEdit()) {
        openEditor(element);
        return;
      }
      const wrapper = element.closest(".card-row-wrapper");
      if (wrapper?.classList.contains("card-row-wrapper--swiped")) {
        resetReveal();
        return;
      }
      const entry = entryFor(element);
      if (!entry) return;
      if (ui.get("action") || ui.get("details")) return;
      const text = entry.card.type === "chunk"
        ? entry.card.source.snapshot.text
        : ttsText(entry.card);
      speak(text, entry.card.lang);
    }],
  ];

  for (const [name, handler] of actions) delegate.register(name, handler);

  return () => {
    cancelHold();
    suppressedClick = null;
    listeners.abort();
    unsubscribe.forEach((stop) => stop());
    for (const [name] of actions) delegate.unregister(name);
  };
}
