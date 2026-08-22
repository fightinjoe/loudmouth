// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

const { getCards } = vi.hoisted(() => ({ getCards: vi.fn(async () => []) }));

vi.mock("../js/db.js", () => ({
  createDeck: vi.fn(async () => ({ id: "should-not-be-called" })),
  updateDeckMode: vi.fn(),
  updateDeckName: vi.fn(),
  updateDeckOrder: vi.fn(),
  updateDeckReadingDisplay: vi.fn(),
  deleteDeck: vi.fn(),
  getCards,
  saveTermCard: vi.fn(),
  updateDeckVibe: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
}));

vi.mock("../js/lookup-api.js", () => ({ lookup: vi.fn() }));


import actionPane from "../panes/action-pane.js";
import { createUIState, createHost } from "../js/uiState.js";
import { createDelegate } from "../js/delegate.js";

function mountPane() {
  const ui = createUIState({
    action: actionPane.initialState,
    content: { deck: null, cards: [], deckId: null },
    shell: { exposed: "foreground" },
  });
  ui.registerTransitions(actionPane.transitions);
  ui.registerTransitions({
    "shell/close": () => ({ exposed: "foreground" }),
    "shell/open": () => ({ exposed: "background" }),
    "nav/reload": (s) => s,
    "content/select-deck": (s, { id }) => ({ ...s, deckId: id }),
    "content/loaded": (s, payload) => ({ ...s, deck: payload.deck, cards: payload.cards }),
  });

  const rootEl = document.createElement("div");
  rootEl.innerHTML = actionPane.render();
  document.body.appendChild(rootEl);

  const stageEl = document.createElement("div");
  const host = createHost({ ui, delegate: createDelegate(rootEl), stageEl });
  actionPane.bindEvents(rootEl, host);
  return { ui, rootEl };
}

describe("action pane — new-phrasebook confirm-suggestion hand-off (PH-008)", () => {
  it("confirming a suggestion builds an unsaved preview deck via content/loaded and closes the sheet, without calling createDeck", async () => {
    const suggestion = {
      id: "seed-greetings-ja",
      emoji: "👋",
      title: "Greetings",
      lang: "ja",
      terms: [{ lang: "ja", type: "phrase", text: "こんにちは", translation: "hello" }],
    };
    const { ui, rootEl } = mountPane();

    ui.transition("action/open", { kind: "new-phrasebook", payload: { suggestion } });

    const createBtn = rootEl.querySelector('[data-action="new-phrasebook/create"]');
    expect(createBtn.textContent.trim()).toBe('View "Greetings" phrasebook');
    createBtn.click();

    const content = ui.get("content");
    expect(content.deck).toEqual(expect.objectContaining({
      name: "Greetings",
      lang: "ja",
      preview: true,
      seedId: "seed-greetings-ja",
    }));
    expect(content.cards).toHaveLength(1);
    expect(content.cards[0]).toEqual(expect.objectContaining({ text: "こんにちは", translation: "hello" }));

    const { createDeck } = await import("../js/db.js");
    expect(createDeck).not.toHaveBeenCalled();

    // The bottom-sheet close animation is transition-gated (see
    // bottom-sheet.js) — simulate it finishing.
    const panel = rootEl.querySelector(".new-phrasebook-panel");
    panel.dispatchEvent(new Event("transitionend"));
    expect(panel.isConnected).toBe(false);
  });
});

describe("action pane — lookup dismiss auto-deletes an empty freshly-created phrasebook", () => {
  const deck = { id: "d1", name: "New phrasebook", lang: "ja", ability: "beginner", formality: "polite", audience: "staff" };

  it("deletes the deck and returns to the nav pane when dismissed with zero cards saved", async () => {
    const { deleteDeck } = await import("../js/db.js");
    deleteDeck.mockClear();
    getCards.mockClear();
    getCards.mockResolvedValueOnce([]);

    const { ui, rootEl } = mountPane();
    ui.transition("action/open", {
      kind: "lookup",
      payload: { deck, hasTranslatedBefore: false, deleteIfEmpty: true },
    });

    rootEl.querySelector('[data-action="lookup/back"]').click();
    const panel = rootEl.querySelector(".lookup-panel");
    panel.dispatchEvent(new Event("transitionend"));
    await vi.waitFor(() => expect(deleteDeck).toHaveBeenCalledWith("d1"));

    expect(ui.get("content").deckId).toBe(null);
    expect(ui.get("shell").exposed).toBe("background");
  });

  it("does NOT delete the deck when at least one card was saved", async () => {
    const { deleteDeck } = await import("../js/db.js");
    deleteDeck.mockClear();
    getCards.mockClear();
    getCards.mockResolvedValueOnce([{ id: "c1" }]);

    const { ui, rootEl } = mountPane();
    ui.transition("action/open", {
      kind: "lookup",
      payload: { deck, hasTranslatedBefore: false, deleteIfEmpty: true },
    });

    rootEl.querySelector('[data-action="lookup/back"]').click();
    const panel = rootEl.querySelector(".lookup-panel");
    panel.dispatchEvent(new Event("transitionend"));
    await vi.waitFor(() => expect(getCards).toHaveBeenCalledWith("d1"));

    expect(deleteDeck).not.toHaveBeenCalled();
  });

  it("does NOT check for deletion when deleteIfEmpty is not set (e.g. Add to an existing deck)", async () => {
    const { deleteDeck } = await import("../js/db.js");
    deleteDeck.mockClear();
    getCards.mockClear();

    const { ui, rootEl } = mountPane();
    ui.transition("action/open", {
      kind: "lookup",
      payload: { deck, hasTranslatedBefore: true },
    });

    rootEl.querySelector('[data-action="lookup/back"]').click();
    const panel = rootEl.querySelector(".lookup-panel");
    panel.dispatchEvent(new Event("transitionend"));
    await vi.waitFor(() => expect(ui.get("action")).toBeFalsy());

    expect(getCards).not.toHaveBeenCalled();
    expect(deleteDeck).not.toHaveBeenCalled();
  });
});
