// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbState } = vi.hoisted(() => ({
  dbState: { seededIds: new Set(), recentDecks: [], allDecks: [] },
}));

vi.mock("../js/db.js", () => ({
  getCards: vi.fn(async () => []),
  getDecks: vi.fn(async () => dbState.allDecks),
  getRecentDecks: vi.fn(async () => dbState.recentDecks),
  getSeededDeckIds: vi.fn(async () => dbState.seededIds),
  updateDeckAccessTime: vi.fn(async () => {}),
}));

import navPane from "../panes/nav-pane.js";
import { createUIState, createHost } from "../js/uiState.js";
import { createDelegate } from "../js/delegate.js";
import { SUGGESTED_PHRASEBOOKS } from "../js/suggested-phrasebooks.js";

function mountPane() {
  const ui = createUIState({ nav: navPane.initialState, shell: {} });
  ui.registerTransitions(navPane.transitions);
  ui.registerTransitions({
    "shell/close": (s) => s,
    "action/open": (s) => s,
    "content/select-deck": (s) => s,
  });

  const rootEl = document.createElement("div");
  rootEl.innerHTML = navPane.render(navPane.initialState);
  document.body.appendChild(rootEl);

  const delegate = createDelegate(rootEl);
  const host = createHost({ ui, delegate, stageEl: document.createElement("div") });
  navPane.bindEvents(rootEl, host);
  return { ui, rootEl };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  dbState.seededIds = new Set();
  dbState.recentDecks = [];
  dbState.allDecks = [];
});

describe("nav pane — Suggested phrasebooks (PH-008)", () => {
  it("renders every suggestion when none have been seeded yet", async () => {
    const { rootEl } = mountPane();
    await flush();
    const rows = rootEl.querySelectorAll('[data-action="nav/view-suggested"]');
    expect(rows).toHaveLength(SUGGESTED_PHRASEBOOKS.length);
    expect(rootEl.textContent).toContain("Suggested phrasebooks");
    expect(rootEl.textContent).toContain("Greetings");
  });

  it("dedupes: a suggestion already materialized as a real deck (matching seedId) drops out of the list", async () => {
    dbState.seededIds = new Set(["seed-greetings-ja"]);
    const { rootEl } = mountPane();
    await flush();
    const rows = [...rootEl.querySelectorAll('[data-action="nav/view-suggested"]')];
    expect(rows.map((r) => r.dataset.suggestionId)).not.toContain("seed-greetings-ja");
    expect(rows).toHaveLength(SUGGESTED_PHRASEBOOKS.length - 1);
  });

  it("hides the whole Suggested section once every suggestion has been added", async () => {
    dbState.seededIds = new Set(SUGGESTED_PHRASEBOOKS.map((s) => s.id));
    const { rootEl } = mountPane();
    await flush();
    expect(rootEl.textContent).not.toContain("Suggested phrasebooks");
  });

  it("tapping View opens the new-phrasebook action pane with the matching suggestion payload", async () => {
    const { ui, rootEl } = mountPane();
    await flush();

    const opens = [];
    const realTransition = ui.transition;
    ui.transition = (verb, payload) => {
      if (verb === "action/open") opens.push(payload);
      return realTransition(verb, payload);
    };

    const firstRow = rootEl.querySelector('[data-action="nav/view-suggested"]');
    firstRow.click();

    expect(opens).toHaveLength(1);
    expect(opens[0].kind).toBe("new-phrasebook");
    expect(opens[0].payload.suggestion.id).toBe(firstRow.dataset.suggestionId);
  });
});
