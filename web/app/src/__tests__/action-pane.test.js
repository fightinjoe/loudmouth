// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("../js/db.js", () => ({
  createDeck: vi.fn(async () => ({ id: "should-not-be-called" })),
  updateDeckMode: vi.fn(),
  updateDeckName: vi.fn(),
  updateDeckOrder: vi.fn(),
  updateDeckReadingDisplay: vi.fn(),
  deleteDeck: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
}));

import actionPane from "../panes/action-pane.js";
import { createUIState, createHost } from "../js/uiState.js";
import { createDelegate } from "../js/delegate.js";

function mountPane() {
  const ui = createUIState({ action: actionPane.initialState, content: { deck: null, cards: [] } });
  ui.registerTransitions(actionPane.transitions);
  ui.registerTransitions({
    "shell/close": (s) => s,
    "nav/reload": (s) => s,
    "content/select-deck": (s) => s,
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
