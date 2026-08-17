// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The content pane's bindEvents wires a load subscriber that pulls in db,
// tts, gestures, etc. Mock the sibling modules so we can drive the real
// pane logic (transitions + load subscriber) in isolation and assert the
// observable effect: stageEl.dataset.deckMode tracks the deck's mode.

// loadDeckData is the DB fetch the pane runs after select/reload. We back it
// with an in-memory deck whose `mode` we mutate to simulate a settings change.
// vi.mock is hoisted above module init, so the shared refs go through
// vi.hoisted so the factory can close over them safely.
const { deckStore, loadDeckData } = vi.hoisted(() => {
  const store = {
    d1: { id: "d1", name: "Spanish", lang: "es", mode: "study", order: "default", system: false },
  };
  const fn = vi.fn(async (deckId) => {
    if (!deckId) return { deck: null, cards: [], isStarred: false };
    return { deck: { ...store[deckId] }, cards: [], isStarred: false };
  });
  return { deckStore: store, loadDeckData: fn };
});

vi.mock("../panes/content-pane-load.js", () => ({ loadDeckData }));
vi.mock("../panes/content-pane-render.js", () => ({
  renderDeckBody: () => "<div data-region=\"card-list\"></div>",
  renderCardsHTML: () => "",
}));
vi.mock("../panes/content-pane-gestures.js", () => ({
  wireContentGestures: () => ({ resetReveal: () => {} }),
}));
vi.mock("../panes/content-pane-actions.js", () => ({
  registerCardActions: () => () => {},
}));
vi.mock("../js/db.js", () => ({ updateDeckCardOrder: vi.fn() }));

import contentPane from "../panes/content-pane.js";
import { createUIState, createHost } from "../js/uiState.js";
import { createDelegate } from "../js/delegate.js";

function mountPane() {
  const ui = createUIState({ content: contentPane.initialState, shell: {} });
  ui.registerTransitions(contentPane.transitions);
  // Minimal shell/action transitions the pane may dispatch to.
  ui.registerTransitions({
    "shell/toggle": (s) => s,
    "action/open": (s) => s,
    "nav/reload": (s) => s,
  });

  const rootEl = document.createElement("div");
  rootEl.innerHTML = contentPane.render(contentPane.initialState);
  document.body.appendChild(rootEl);

  const stageEl = document.createElement("div");
  const delegate = createDelegate(rootEl);
  const host = createHost({ ui, delegate, stageEl });
  contentPane.bindEvents(rootEl, host);
  return { ui, stageEl, rootEl };
}

// Flush the async load subscriber (loadDeckData is async).
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("content pane — deck mode (card template) reactivity", () => {
  let mounted;
  beforeEach(() => {
    loadDeckData.mockClear();
    deckStore.d1.mode = "study";
    mounted = mountPane();
  });
  afterEach(() => {
    mounted.rootEl.remove();
  });

  it("sets stageEl.dataset.deckMode from the loaded deck on select", async () => {
    mounted.ui.transition("content/select-deck", { id: "d1" });
    await flush();
    expect(mounted.stageEl.dataset.deckMode).toBe("study");
  });

  it("re-fetches and updates deckMode when the mode changes for the already-selected deck", async () => {
    mounted.ui.transition("content/select-deck", { id: "d1" });
    await flush();
    expect(mounted.stageEl.dataset.deckMode).toBe("study");

    // Simulate the deck-settings sheet writing a new card template (mode) to
    // the DB, then dispatching the reload — deckId is unchanged.
    deckStore.d1.mode = "reverse";
    loadDeckData.mockClear();
    mounted.ui.transition("content/reload-deck");
    await flush();

    // The bug: without a reload the guard bailed on unchanged deckId and the
    // stale deck (mode "study") stuck. The fix re-fetches on reload.
    expect(loadDeckData).toHaveBeenCalledWith("d1");
    expect(mounted.stageEl.dataset.deckMode).toBe("reverse");
  });

  it("content/reload-deck bumps the reload counter so the load guard fires", () => {
    const before = mounted.ui.get("content").reload;
    mounted.ui.transition("content/reload-deck");
    const after = mounted.ui.get("content").reload;
    expect(after).toBe(before + 1);
  });
});
