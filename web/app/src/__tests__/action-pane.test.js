// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../js/db", () => ({
  updateDeckMode: vi.fn(),
  updateDeckName: vi.fn(),
  updateDeckOrder: vi.fn(),
  updateDeckReadingDisplay: vi.fn(),
  deleteDeck: vi.fn(),
  commitPhrasebook: vi.fn(),
  setDeckIllustration: vi.fn(),
}));

import actionPane from "../panes/action-pane";
import { createDelegate } from "../js/delegate";
import { createHost, createUIState } from "../js/uiState";
import { openBottomSheet } from "../components/bottom-sheet";

const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
  vi.useRealTimers();
});
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
    "nav/reload": (slice) => slice,
    "content/select-deck": (slice, { id }) => ({ ...slice, deckId: id }),
    "content/loaded": (slice, payload) => ({
      ...slice,
      deck: payload.deck,
      cards: payload.cards,
    }),
    "content/reload-deck": (slice) => slice,
  });

  const rootEl = document.createElement("div");
  rootEl.innerHTML = actionPane.render();
  document.body.appendChild(rootEl);

  const stageEl = document.createElement("div");
  const delegate = createDelegate(rootEl);
  const host = createHost({ ui, delegate, stageEl });
  const dispose = actionPane.bindEvents(rootEl, host);
  cleanups.push(() => {
    dispose();
    delegate.dispose();
    rootEl.remove();
  });
  return { ui, rootEl, dispose, stageEl };
}

const deck = {
  id: "d1",
  name: "Directions",
  lang: "ja",
  createdAt: "2026-01-01T00:00:00.000Z",
  mode: "study",
  order: "default",
  readingDisplay: "reading",
};

describe("bottom-sheet dismissal", () => {
  it("cannot reopen or retain a sheet closed before its first animation frame", () => {
    const frames = [];
    vi.stubGlobal("requestAnimationFrame",callback=>{frames.push(callback);return frames.length;});
    const root = document.createElement("div");
    let dismissed = 0;
    try {
      const sheet = openBottomSheet(root,{kind:"creation",bodyHTML:"<button>Continue</button>",onClose:()=>dismissed++});
      sheet.close();
      while (frames.length) frames.shift()(0);
      expect(root.children).toHaveLength(0);
      expect(dismissed).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("removes an inactive closing sheet even when no transition event arrives", async () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    let dismissed = 0;
    try {
      const sheet = openBottomSheet(root,{kind:"review",bodyHTML:"<button>Reveal</button>",onClose:()=>dismissed++});
      sheet.panel.classList.add("bottom-sheet--visible");
      sheet.close();
      expect(sheet.panel.inert).toBe(true);
      await vi.advanceTimersByTimeAsync(400);
      sheet.close();
      expect(root.children).toHaveLength(0);
      expect(dismissed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("action owner disposal", () => {
  it("disposes active and still-closing sheets without closing a newer action", async () => {
    vi.useFakeTimers();
    const { ui, rootEl, dispose, stageEl } = mountPane();
    ui.transition("action/open", { kind: "settings", payload: { deck, cards: [] } });
    rootEl.querySelector(".bottom-sheet").classList.add("bottom-sheet--visible");
    ui.transition("action/open", { kind: "json", payload: { title: "Export", jsonString: "{}" } });
    expect(rootEl.querySelector(".bottom-sheet")).not.toBeNull();
    const action = ui.get("action");
    dispose();
    dispose();
    expect([...rootEl.children]).toEqual([rootEl.querySelector("#action-layer")]);
    await vi.advanceTimersByTimeAsync(500);
    expect(ui.get("action")).toBe(action);
    expect(stageEl.dataset.actionState).toBe("closed");
  });

  it("lets an old animated dismissal finish without dismissing its replacement", async () => {
    vi.useFakeTimers();
    const { ui, rootEl } = mountPane();
    ui.transition("action/open", { kind: "settings", payload: { deck, cards: [] } });
    rootEl.querySelector(".bottom-sheet").classList.add("bottom-sheet--visible");
    ui.transition("action/open", { kind: "json", payload: { title: "Export", jsonString: "{}" } });
    const action = ui.get("action");
    await vi.advanceTimersByTimeAsync(500);
    expect(ui.get("action")).toBe(action);
    expect(rootEl.querySelector(".bottom-sheet")).toBeNull();
  });
});
