import { toggleCardStar } from "../js/db";
import type { AppHost } from "../js/app-types";
import type { LibraryEntry } from "../js/library-types";
import { speak, ttsText } from "../js/tts";
import { isStoredDeck } from "./content-pane";

export interface RegisterCardActionsOptions {
  host: AppHost;
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
      button.disabled = pending;
      if (pending) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
    });
}

export function registerCardActions(
  { host, isEdit, resetReveal }: RegisterCardActionsOptions,
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

  const starCard = async (_event: MouseEvent, element: HTMLElement): Promise<void> => {
    if (isEdit()) return;
    resetReveal();
    const slice = ui.get("content");
    const deck = slice.deck;
    const entry = entryFor(element);
    if (!isStoredDeck(deck) || !entry?.membership
      || entry.membership.deckId !== deck.id) return;

    const originDeckId = deck.id;
    const cardId = entry.cardId;
    showInlineError(element, null);
    setStarPending(element, cardId, true);
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
        setStarPending(element, cardId, false);
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
      if (entry.card.type === "word") {
        speak(ttsText(entry.card), entry.card.lang);
        return;
      }
      if (entry.card.type === "chunk") {
        speak(entry.card.source.snapshot.text, entry.card.lang);
        return;
      }
      if (ui.get("action")) return;

      const content = ui.get("content");
      const group = entry.occurrence?.groupId
        ? content.groups.find((candidate) => candidate.id === entry.occurrence?.groupId)
        : undefined;
      const opener = element.querySelector<HTMLElement>(".card-term") ?? element;
      ui.transition("details/open", {
        entry,
        ...(isStoredDeck(content.deck) ? { deck: content.deck } : {}),
        ...(group ? { group } : {}),
        opener,
        readingDisplay: content.deck?.readingDisplay ?? "reading",
        showEnglish: true,
        showReadings: true,
      });
    }],

    ["content/play-card", (_event, element) => {
      if (isEdit()) return;
      const entry = entryFor(element);
      if (!entry) return;
      const text = entry.card.type === "chunk"
        ? entry.card.source.snapshot.text
        : ttsText(entry.card);
      speak(text, entry.card.lang);
    }],
  ];

  for (const [name, handler] of actions) delegate.register(name, handler);

  return () => {
    for (const [name] of actions) delegate.unregister(name);
  };
}
