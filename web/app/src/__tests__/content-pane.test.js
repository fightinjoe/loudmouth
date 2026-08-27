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
    if (!deckId) return { deck: null, cards: [] };
    return { deck: { ...store[deckId] }, cards: [] };
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
const { createDeck, importCards, updateDeckAccessTime } = vi.hoisted(() => ({
  createDeck: vi.fn(async (name, lang, opts) => ({ id: "real-001", name, lang, ability: opts?.ability, seedId: opts?.seedId })),
  importCards: vi.fn(async () => {}),
  updateDeckAccessTime: vi.fn(async () => {}),
}));
vi.mock("../js/db.js", () => ({ updateDeckCardOrder: vi.fn(), createDeck, importCards, updateDeckAccessTime }));

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

describe("content pane — Add/Review entry points (PH-002/PH-007/PH-009)", () => {
  it("content/add opens the lookup action pane for the selected deck, with hasTranslatedBefore=false for an empty phrasebook", async () => {
    const { ui, rootEl } = mountPane();
    ui.transition("content/select-deck", { id: "d1" });
    await flush();

    const opens = [];
    const realTransition = ui.transition;
    ui.transition = (verb, payload) => {
      if (verb === "action/open") opens.push(payload);
      return realTransition(verb, payload);
    };

    // Inject a real 'content/add' trigger the way renderDeckBody would —
    // this suite mocks the render module, so we supply just the button the
    // delegate needs, then click it for real to exercise the actual
    // registered handler (not a re-implementation of its logic).
    const btn = document.createElement("button");
    btn.dataset.action = "content/add";
    rootEl.appendChild(btn);
    btn.click();

    expect(opens).toHaveLength(1);
    expect(opens[0]).toEqual({
      kind: "lookup",
      payload: { deck: expect.objectContaining({ id: "d1" }), hasTranslatedBefore: false },
    });
  });

  it("content/review opens the review action pane for the selected deck", async () => {
    const { ui, rootEl } = mountPane();
    ui.transition("content/select-deck", { id: "d1" });
    await flush();

    const opens = [];
    const realTransition = ui.transition;
    ui.transition = (verb, payload) => {
      if (verb === "action/open") opens.push(payload);
      return realTransition(verb, payload);
    };

    const btn = document.createElement("button");
    btn.dataset.action = "content/review";
    rootEl.appendChild(btn);
    btn.click();

    expect(opens).toHaveLength(1);
    expect(opens[0].kind).toBe("review");
    expect(opens[0].payload.deck).toEqual(expect.objectContaining({ id: "d1" }));
  });
});

describe("content pane — group collapse/expand (Figma node 754:6178)", () => {
  it("content/toggle-group flips data-collapsed on the clicked group, no ui.transition/re-render", () => {
    const { ui, rootEl } = mountPane();
    const before = ui.get("content");

    const group = document.createElement("div");
    group.className = "card-group";
    group.dataset.collapsed = "true";
    const footer = document.createElement("button");
    footer.dataset.action = "content/toggle-group";
    group.appendChild(footer);
    rootEl.appendChild(group);

    footer.click();
    expect(group.dataset.collapsed).toBe("false");

    footer.click();
    expect(group.dataset.collapsed).toBe("true");

    // Purely a DOM toggle — the content slice itself is untouched.
    expect(ui.get("content")).toBe(before);
  });

  it("toggling one group does not affect a sibling group", () => {
    const { rootEl } = mountPane();

    const groupA = document.createElement("div");
    groupA.className = "card-group";
    groupA.dataset.collapsed = "true";
    const footerA = document.createElement("button");
    footerA.dataset.action = "content/toggle-group";
    groupA.appendChild(footerA);

    const groupB = document.createElement("div");
    groupB.className = "card-group";
    groupB.dataset.collapsed = "true";

    rootEl.appendChild(groupA);
    rootEl.appendChild(groupB);

    footerA.click();
    expect(groupA.dataset.collapsed).toBe("false");
    expect(groupB.dataset.collapsed).toBe("true");
  });
});

describe("content pane — save-preview (PH-008)", () => {
  beforeEach(() => {
    createDeck.mockClear();
    importCards.mockClear();
    updateDeckAccessTime.mockClear();
  });

  it("persists an unsaved preview deck: creates it, imports clean cards, stamps access, and selects the real deck", async () => {
    const { ui, rootEl } = mountPane();
    const previewDeck = {
      id: "preview:seed-greetings-ja",
      name: '"Greetings" phrasebook',
      lang: "ja",
      ability: "beginner",
      preview: true,
      seedId: "seed-greetings-ja",
    };
    const previewCards = [
      { id: "preview-0", createdAt: "1970-01-01T00:00:00.000Z", deckIds: [], lang: "ja", text: "こんにちは", translation: "hello" },
    ];
    ui.transition("content/loaded", { deck: previewDeck, cards: previewCards });

    const btn = document.createElement("button");
    btn.dataset.action = "content/save-preview";
    rootEl.appendChild(btn);
    btn.click();

    await vi.waitFor(() => expect(ui.get("content").deckId).toBe("real-001"));

    expect(createDeck).toHaveBeenCalledWith('"Greetings" phrasebook', "ja", {
      ability: "beginner",
      seedId: "seed-greetings-ja",
    });
    // The preview-only id/createdAt/deckIds are stripped before persisting —
    // importCards must assign real ones (see content-pane.js comment).
    const [savedCards, savedDeckId] = importCards.mock.calls[0];
    expect(savedCards).toEqual([{ lang: "ja", text: "こんにちは", translation: "hello" }]);
    expect(savedDeckId).toBe("real-001");
    expect(updateDeckAccessTime).toHaveBeenCalledWith("real-001");
  });

  it("is a no-op when the current deck is not a preview", async () => {
    const { ui, rootEl } = mountPane();
    ui.transition("content/select-deck", { id: "d1" });
    await flush();

    const btn = document.createElement("button");
    btn.dataset.action = "content/save-preview";
    rootEl.appendChild(btn);
    btn.click();
    await flush();

    expect(createDeck).not.toHaveBeenCalled();
  });
});
