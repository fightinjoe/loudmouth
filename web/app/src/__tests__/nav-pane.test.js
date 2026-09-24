// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbState } = vi.hoisted(() => ({
  dbState: { recentDecks: [], allDecks: [], cardsByDeck: {}, cardsByLang: {} },
}));

vi.mock("../js/db", () => ({
  getCards: vi.fn(async (deckId) => dbState.cardsByDeck[deckId] ?? []),
  getCardsByLang: vi.fn(async (lang) => dbState.cardsByLang[lang] ?? []),
  getLangs: vi.fn(async () => Object.keys(dbState.cardsByLang)),
  getDecks: vi.fn(async (lang) =>
    lang ? dbState.allDecks.filter((d) => d.lang === lang) : dbState.allDecks,
  ),
  getRecentDecks: vi.fn(async (n) => dbState.recentDecks.slice(0, n)),
  updateDeckAccessTime: vi.fn(async () => {}),
}));

import navPane, { loadLangBrowse } from "../panes/nav-pane";
import { createUIState, createHost } from "../js/uiState";
import { createDelegate } from "../js/delegate";

function mountPane({ asApp = false } = {}) {
  const ui = createUIState({ nav: navPane.initialState, shell: {} });
  ui.registerTransitions(navPane.transitions);
  ui.registerTransitions({
    "shell/close": (s) => s,
    "action/open": (s) => s,
    "content/select-deck": (s) => s,
    "content/browse": (s) => s,
  });

  const wrapper = document.createElement("div");
  wrapper.innerHTML = navPane.render(navPane.initialState);
  document.body.appendChild(wrapper);

  // app.js binds with navEl = #nav-pane itself (app.js:81), not a wrapper.
  const bindEl = asApp ? wrapper.querySelector("#nav-pane") : wrapper;
  const delegate = createDelegate(bindEl);
  const host = createHost({ ui, delegate, stageEl: document.createElement("div") });
  navPane.bindEvents(bindEl, host);
  return { ui, rootEl: wrapper };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const deck = (id, name, lang) => ({ id, name, lang });

beforeEach(() => {
  document.body.innerHTML = "";
  dbState.recentDecks = [];
  dbState.allDecks = [];
  dbState.cardsByDeck = {};
  dbState.cardsByLang = {};
});

describe("nav pane — first run", () => {
  it("shows only the header and the create callout; both sections hide themselves", async () => {
    const { rootEl } = mountPane();
    await flush();

    expect(rootEl.querySelectorAll('[data-action="nav/open-deck"],[data-action="nav/browse-lang"]')).toHaveLength(0);
    expect(rootEl.querySelector('[data-action="nav/open-new-phrasebook"]')).not.toBeNull();
    expect(rootEl.querySelector(".nav-create-btn")).toBeNull();
    expect(rootEl.querySelector("#nav-pane").dataset.state).toBe("empty");
  });
});

describe("nav pane — Jump back in", () => {
  it("renders the three most recent phrasebooks and highlights the newest", async () => {
    dbState.recentDecks = [
      deck("d1", "Osaka dinner", "ja"),
      deck("d2", "Izakaya", "ja"),
      deck("d3", "Oaxaca", "es"),
    ];
    dbState.allDecks = [...dbState.recentDecks];
    dbState.cardsByDeck = { d1: [{ card: { type: "word" } }, { card: { type: "phrase" } }] };

    const { rootEl } = mountPane();
    await flush();

    const cards = rootEl.querySelectorAll('[data-action="nav/open-deck"]');
    expect(cards).toHaveLength(3);
    expect(cards[0].dataset.highlighted).toBe("true");
    expect(cards[1].dataset.highlighted).toBeUndefined();
  });

  it("swaps the callout for the pinned button once a phrasebook exists", async () => {
    dbState.recentDecks = [deck("d1", "Osaka dinner", "ja")];
    dbState.allDecks = [...dbState.recentDecks];

    const { rootEl } = mountPane();
    await flush();

    expect(rootEl.querySelector(".nav-create-btn")).not.toBeNull();
    expect(rootEl.querySelector("#nav-pane").dataset.state).toBe("populated");
  });

  it("stamps access time and opens the deck in the content pane", async () => {
    dbState.recentDecks = [deck("d1", "Osaka dinner", "ja")];
    dbState.allDecks = [...dbState.recentDecks];

    const { ui, rootEl } = mountPane();
    await flush();

    const selects = [];
    const realTransition = ui.transition;
    ui.transition = (verb, payload) => {
      if (verb === "content/select-deck") selects.push(payload);
      return realTransition(verb, payload);
    };

    rootEl.querySelector('[data-action="nav/open-deck"]').click();
    await flush();
    expect(selects).toEqual([{ id: "d1" }]);
  });
});

describe("nav pane — Library", () => {
  it("renders one card per language with a phrasebook count, ordered by language code", async () => {
    dbState.allDecks = [
      deck("d1", "Osaka dinner", "ja"),
      deck("d2", "Izakaya", "ja"),
      deck("d3", "Oaxaca", "es"),
    ];
    dbState.recentDecks = [...dbState.allDecks];

    const { rootEl } = mountPane();
    await flush();

    const langCards = [...rootEl.querySelectorAll('[data-action="nav/browse-lang"]')];
    expect(langCards.map((c) => c.dataset.lang)).toEqual(["es", "ja"]);
    expect(langCards[0].textContent).toContain("Spanish");
    expect(langCards[0].textContent).toContain("1 phrasebook");
    expect(langCards[1].textContent).toContain("2 phrasebooks");
  });

  it("stays fixed-height as phrasebooks grow: card count is 3 recent + one per language", async () => {
    dbState.allDecks = [
      ...Array.from({ length: 6 }, (_, i) => deck(`j${i}`, `JA ${i}`, "ja")),
      ...Array.from({ length: 3 }, (_, i) => deck(`e${i}`, `ES ${i}`, "es")),
    ];
    dbState.recentDecks = dbState.allDecks.slice(0, 3);

    const { rootEl } = mountPane();
    await flush();

    expect(rootEl.querySelectorAll(".deck-picker-card")).toHaveLength(3 + 2);
  });

  it("opens that language's phrasebook list in the content pane, not a deck", async () => {
    dbState.allDecks = [deck("d1", "Osaka dinner", "ja")];
    dbState.recentDecks = [...dbState.allDecks];

    const { ui, rootEl } = mountPane();
    await flush();

    const browses = [];
    const realTransition = ui.transition;
    ui.transition = (verb, payload) => {
      if (verb === "content/browse") browses.push(payload);
      return realTransition(verb, payload);
    };

    rootEl.querySelector('[data-action="nav/browse-lang"]').click();
    await flush();

    expect(browses).toHaveLength(1);
    expect(browses[0].title).toContain("Japanese");
    expect(browses[0].groupsHtml).toContain('data-action="content/browse-select"');
    expect(browses[0].groupsHtml).toContain("Osaka dinner");
  });

  it("keeps orphaned saved cards reachable without any phrasebook", async () => {
    dbState.cardsByLang = {ja:[{key:"orphan",cardId:"orphan",card:{type:"chunk",lang:"ja"}}]};
    const {rootEl} = mountPane();
    await flush();
    expect(rootEl.querySelector('[data-action="nav/browse-lang"]').dataset.lang).toBe("ja");
    expect(rootEl.querySelector("#nav-pane").dataset.state).toBe("populated");
    const browse = await loadLangBrowse("ja");
    const panel = document.createElement("div");
    panel.innerHTML = browse.groupsHtml;
    expect(panel.querySelector('[data-action="content/browse-select"]').dataset.deckId).toBe("lang:ja");
  });
});

describe("nav pane — loadLangBrowse", () => {
  it("lists only that language's phrasebooks, sorted by name", async () => {
    dbState.allDecks = [
      deck("d1", "Zoo trip", "ja"),
      deck("d2", "Airport", "ja"),
      deck("d3", "Oaxaca", "es"),
    ];

    const browse = await loadLangBrowse("ja");
    const titles = [...browse.groupsHtml.matchAll(/text-body-lg fg-body">([^<]+)</g)].map((m) => m[1]);
    expect(titles).toEqual(["Airport", "Zoo trip"]);
  });
});

describe("nav pane — binding shape", () => {
  // Regression: bindEvents looked up #nav-pane with querySelector, which finds
  // only descendants. app.js passes the pane element itself, so paneEl was null
  // and data-state never left "empty" — the empty state's taller scroll padding
  // stayed applied once phrasebooks existed.
  it("stamps data-state when bound the way app.js binds it (rootEl IS #nav-pane)", async () => {
    dbState.recentDecks = [deck("d1", "Osaka dinner", "ja")];
    dbState.allDecks = [...dbState.recentDecks];

    const { rootEl } = mountPane({ asApp: true });
    await flush();

    expect(rootEl.querySelector("#nav-pane").dataset.state).toBe("populated");
  });
});

describe("nav pane — untrusted persisted metadata", () => {
  it("renders deck names literally and keeps hostile IDs inside one data attribute", async () => {
    const injectedElement = '<img src=x onerror="window.__injected=true">';
    const hostileId = 'deck" onmouseover="window.__injected=true';
    dbState.recentDecks = [{ id: hostileId, name: injectedElement, lang: "ja" }];
    dbState.allDecks = [...dbState.recentDecks];

    const { rootEl } = mountPane();
    await flush();

    const row = rootEl.querySelector('[data-action="nav/open-deck"]');
    expect(rootEl.querySelector("img")).toBeNull();
    expect(row.querySelector(".text-body-lg").textContent).toBe(injectedElement);
    expect(row.dataset.deckId).toBe(hostileId);
    expect(row.hasAttribute("onmouseover")).toBe(false);
  });
});
