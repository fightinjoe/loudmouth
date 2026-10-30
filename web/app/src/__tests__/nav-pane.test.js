// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { dbState } = vi.hoisted(() => ({
  dbState: { allDecks: [], cardsByDeck: {}, cardsByLang: {} },
}));
vi.mock("../js/db", () => ({
  getCards: vi.fn(async (deckId) => dbState.cardsByDeck[deckId] ?? []),
  getCardsByLang: vi.fn(async (lang) => dbState.cardsByLang[lang] ?? []),
  getLangs: vi.fn(async () => Object.keys(dbState.cardsByLang)),
  getDecks: vi.fn(async (lang) => lang ? dbState.allDecks.filter((d) => d.lang === lang) : [...dbState.allDecks]),
  updateDeckAccessTime: vi.fn(async () => {}),
}));

import navPane, { loadLangBrowse } from "../panes/nav-pane";
import { getDecks, updateDeckAccessTime } from "../js/db";
import { createUIState, createHost } from "../js/uiState";
import { createDelegate } from "../js/delegate";

let cleanups;
let frames;
let nextFrame;
let reduced;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const deck = (id, name, lang, createdAt = "2026-01-01T00:00:00.000Z") => ({ id, name, lang, createdAt });

function mountPane({ asApp = false } = {}) {
  const ui = createUIState({ nav: navPane.initialState, shell: { exposed: "foreground" } });
  ui.registerTransitions(navPane.transitions);
  ui.registerTransitions({
    "shell/close": () => ({ exposed: "foreground" }),
    "shell/open": () => ({ exposed: "background" }),
    "action/open": (s) => s,
    "content/select-deck": (s) => s,
    "content/browse": (s) => s,
  });
  const wrapper = document.createElement("div");
  wrapper.innerHTML = navPane.render(navPane.initialState);
  document.body.appendChild(wrapper);
  const bindEl = asApp ? wrapper.querySelector("#nav-pane") : wrapper;
  const delegate = createDelegate(bindEl);
  const host = createHost({ ui, delegate, stageEl: document.createElement("div") });
  const cleanup = navPane.bindEvents(bindEl, host);
  cleanups.push(cleanup);
  const transition = vi.spyOn(ui, "transition");
  return { ui, rootEl: wrapper, cleanup, transition };
}

function tick(time) {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
}

beforeEach(() => {
  document.body.innerHTML = "";
  dbState.allDecks = [];
  dbState.cardsByDeck = {};
  dbState.cardsByLang = {};
  cleanups = [];
  frames = new Map();
  nextFrame = 0;
  reduced = { matches: false };
  vi.clearAllMocks();
  vi.spyOn(window, "matchMedia").mockReturnValue(reduced);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id) => frames.delete(id)));
});
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("navigation welcome", () => {
  it("offers real creation, including prefilled situation ideas", async () => {
    const { rootEl, transition } = mountPane();
    await flush();
    expect(rootEl.querySelector("#nav-pane").dataset.state).toBe("empty");
    expect(rootEl.querySelectorAll('[data-action="nav/open-deck"],[data-action="nav/browse-lang"]')).toHaveLength(0);
    rootEl.querySelector('.nav-welcome [data-action="nav/open-new-phrasebook"]').click();
    expect(transition).toHaveBeenCalledWith("action/open", { kind: "creation", payload: {} });
    const example = rootEl.querySelector(".nav-example");
    example.click();
    expect(transition).toHaveBeenCalledWith("action/open", { kind: "creation", payload: { seed: example.textContent } });
  });

  it.each(["wheel", "pointerdown", "touchstart", "keydown"])("stops moving ideas after manual %s interaction", async (event) => {
    const { rootEl } = mountPane();
    await flush();
    const ideas = rootEl.querySelector(".nav-examples");
    Object.defineProperties(ideas, { scrollHeight: { value: 700 }, clientHeight: { value: 240 } });
    tick(100);
    tick(150);
    tick(200);
    expect(ideas.scrollTop).toBeGreaterThan(0);
    ideas.dispatchEvent(new Event(event));
    const position = ideas.scrollTop;
    tick(250);
    tick(300);
    expect(ideas.scrollTop).toBe(position);
  });

  it("pauses idea movement on focus and for reduced motion", async () => {
    const { rootEl } = mountPane();
    await flush();
    const ideas = rootEl.querySelector(".nav-examples");
    Object.defineProperties(ideas, { scrollHeight: { value: 700 }, clientHeight: { value: 240 } });
    rootEl.querySelector(".nav-example").focus();
    tick(100);
    tick(150);
    tick(200);
    expect(ideas.scrollTop).toBe(0);
    document.activeElement.blur();
    reduced.matches = true;
    tick(250);
    tick(300);
    expect(ideas.scrollTop).toBe(0);
  });
});

describe("navigation phrasebook library", () => {
  it("retains every book in recency order, including books beyond the previous three-book limit", async () => {
    dbState.allDecks = Array.from({ length: 9 }, (_, index) => deck(`d${index}`, `Book ${index}`, "ja", `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`));
    dbState.allDecks[0].lastAccessedAt = "2026-02-01T00:00:00.000Z";
    const { rootEl, transition } = mountPane({ asApp: true });
    await flush();
    const books = [...rootEl.querySelectorAll('[data-action="nav/open-deck"]')];
    expect(books.map((book) => book.dataset.deckId)).toEqual(["d0", "d8", "d7", "d6", "d5", "d4", "d3", "d2", "d1"]);
    expect(rootEl.querySelector("#nav-pane").dataset.state).toBe("populated");
    books.at(-1).click();
    await flush();
    expect(updateDeckAccessTime).toHaveBeenCalledWith("d1");
    expect(transition).toHaveBeenCalledWith("content/select-deck", { id: "d1" });
    expect(transition).toHaveBeenCalledWith("shell/close");
  });

  it("counts distinct saved cards, not repeated placements in a book", async () => {
    dbState.allDecks = [deck("d1", "Osaka dinner", "ja")];
    dbState.cardsByDeck.d1 = [{ cardId: "a" }, { cardId: "a" }, { cardId: "b" }];
    const { rootEl } = mountPane();
    await flush();
    expect(rootEl.querySelector('[data-action="nav/open-deck"]').textContent).toContain("2 saved cards");
    const browse = await loadLangBrowse("ja");
    const panel = document.createElement("div");
    panel.innerHTML = browse.groupsHtml;
    expect(panel.textContent).toContain("2 saved cards");
  });

  it("uses only each book's ready art and falls back when an image fails", async () => {
    const image = "data:image/png;base64,aGVsbG8=";
    dbState.allDecks = [
      { ...deck("a", "Ready", "es"), illustration: { state: "ready", image: { dataUrl: image } } },
      { ...deck("b", "Pending", "ja"), illustration: { state: "pending" } },
      { ...deck("c", "Failed", "ja"), illustration: { state: "failed" } },
      deck("d", "No art", "ja"),
    ];
    const { rootEl } = mountPane();
    await flush();
    const art = rootEl.querySelector(".nav-book-art");
    expect(rootEl.querySelectorAll(".nav-book-art")).toHaveLength(1);
    expect(art.getAttribute("src")).toBe(image);
    art.dispatchEvent(new Event("error"));
    expect(art.dataset.failed).toBe("true");
  });

  it("refreshes saved art on reveal without losing shelf position or access to creation", async () => {
    dbState.allDecks = [deck("d1", "Osaka dinner", "ja")];
    const { rootEl, ui, transition } = mountPane();
    await flush();
    const shelf = rootEl.querySelector(".nav-book-shelf");
    shelf.scrollLeft = 150;
    const image = "data:image/png;base64,aGVsbG8=";
    dbState.allDecks[0].illustration = { state: "ready", image: { dataUrl: image } };
    ui.transition("shell/open");
    await flush();
    expect(rootEl.querySelector(".nav-book-shelf")).toBe(shelf);
    expect(shelf.scrollLeft).toBe(150);
    expect(shelf.querySelector(".nav-book-art").getAttribute("src")).toBe(image);
    rootEl.querySelector('.nav-library-actions [data-action="nav/open-new-phrasebook"]').click();
    expect(transition).toHaveBeenCalledWith("action/open", { kind: "creation", payload: {} });
  });

  it("supports keyboard movement on focused horizontal shelves without hijacking book keys", async () => {
    const { rootEl } = mountPane();
    await flush();
    const shelf = rootEl.querySelector(".nav-book-shelf");
    Object.defineProperties(shelf, { clientWidth: { value: 400 }, scrollWidth: { value: 1200 } });
    shelf.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(shelf.scrollLeft).toBe(300);
    shelf.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(shelf.scrollLeft).toBe(1200);
    shelf.querySelector("button").dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(shelf.scrollLeft).toBe(1200);
    shelf.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(shelf.scrollLeft).toBe(0);
  });
});

describe("navigation languages", () => {
  it("lists languages with real phrasebook totals and opens their browse views", async () => {
    dbState.allDecks = [deck("d1", "Osaka dinner", "ja"), deck("d2", "Izakaya", "ja"), deck("d3", "Oaxaca", "es")];
    const { rootEl, transition } = mountPane();
    await flush();
    const languages = [...rootEl.querySelectorAll('[data-action="nav/browse-lang"]')];
    expect(languages.map((button) => button.dataset.lang)).toEqual(["es", "ja"]);
    expect(languages[0].textContent).toContain("1 phrasebook");
    expect(languages[1].textContent).toContain("2 phrasebooks");
    languages[1].click();
    await flush();
    const browse = transition.mock.calls.find(([verb]) => verb === "content/browse")[1];
    const panel = document.createElement("div");
    panel.innerHTML = browse.groupsHtml;
    expect([...panel.querySelectorAll('[data-action="content/browse-select"]')].map((button) => button.dataset.deckId)).toEqual(["d2", "d1"]);
  });

  it("keeps orphaned saved cards reachable without a phrasebook", async () => {
    dbState.cardsByLang = { ja: [{ cardId: "orphan" }] };
    const { rootEl } = mountPane();
    await flush();
    expect(rootEl.querySelector('[data-action="nav/browse-lang"]').dataset.lang).toBe("ja");
    expect(rootEl.querySelector("#nav-pane").dataset.state).toBe("populated");
    const browse = await loadLangBrowse("ja");
    const panel = document.createElement("div");
    panel.innerHTML = browse.groupsHtml;
    expect(panel.querySelector('[data-action="content/browse-select"]').dataset.deckId).toBe("lang:ja");
  });
});

describe("navigation errors and lifecycle", () => {
  it("exposes load failures and a working retry", async () => {
    getDecks.mockRejectedValueOnce(new Error("Storage unavailable"));
    const { rootEl } = mountPane();
    await flush();
    expect(rootEl.querySelector('[role="alert"]').textContent).toBe("Storage unavailable");
    expect(rootEl.querySelector("#nav-pane").dataset.error).toBe("true");
    dbState.allDecks = [deck("d1", "Osaka dinner", "ja")];
    rootEl.querySelector('[data-action="nav/retry"]').click();
    await flush();
    expect(rootEl.querySelector("#nav-pane").dataset.error).toBe("false");
    expect(rootEl.querySelector('[data-action="nav/open-deck"]').dataset.deckId).toBe("d1");
  });

  it("unregisters delegated actions and cancels animation when disposed", async () => {
    const { rootEl, cleanup, transition } = mountPane();
    await flush();
    cleanup();
    transition.mockClear();
    rootEl.querySelector(".nav-example").click();
    expect(transition).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("renders hostile persisted names and IDs literally", async () => {
    const name = '<img src=x onerror="window.__injected=true">';
    const id = 'deck" onmouseover="window.__injected=true';
    dbState.allDecks = [deck(id, name, "ja")];
    const { rootEl } = mountPane();
    await flush();
    const book = rootEl.querySelector('[data-action="nav/open-deck"]');
    expect(book.querySelector("strong").textContent).toBe(name);
    expect(book.querySelector("img")).toBeNull();
    expect(book.dataset.deckId).toBe(id);
    expect(book.hasAttribute("onmouseover")).toBe(false);
  });
});
