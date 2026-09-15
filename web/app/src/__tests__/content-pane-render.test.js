// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { getDeckPages, renderDeckBody } from "../panes/content-pane-render.js";

const deck = { id: "d1", name: "Dinner phrasebook", lang: "ja", readingDisplay: "reading" };

function card(overrides) {
  return {
    id: overrides.id,
    lang: "ja",
    text: overrides.text,
    translation: overrides.translation,
    createdAt: overrides.createdAt,
    context: overrides.context,
    type: overrides.type,
    notes: overrides.notes,
  };
}

describe("phrasebook conversation pages", () => {
  it("puts ungrouped phrases in a Translations page and Vocab last", () => {
    const cards = [
      card({ id: "c1", text: "晩ご飯", translation: "dinner", createdAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "c2", text: "お会計", translation: "check please", createdAt: "2026-01-02T00:00:00.000Z", context: "Ordering" }),
      card({ id: "c3", text: "ありがとう", translation: "thank you", createdAt: "2026-01-03T00:00:00.000Z" }),
      card({ id: "c4", text: "水", translation: "water", type: "word", context: "Ordering" }),
    ];

    const pages = getDeckPages(cards);
    expect(pages.map((page) => page.title)).toEqual(["Translations", "Ordering", "Vocab"]);
    expect(pages[0].cards.map((item) => item.id)).toEqual(["c3", "c1"]);
    expect(pages[1].cards.map((item) => item.id)).toEqual(["c2"]);
    expect(pages[2].cards.map((item) => item.id)).toEqual(["c4"]);
  });

  it("renders one accessible tab and panel per conversation without repeated headings or counts", () => {
    const root = document.createElement("div");
    root.innerHTML = renderDeckBody(deck, [
      card({ id: "c1", text: "こんにちは", translation: "hello", context: "Arriving", notes: '{"speaker":"you"}' }),
      card({ id: "c2", text: "どうぞ", translation: "come in", context: "Arriving", notes: '{"speaker":"partner"}' }),
      card({ id: "c3", text: "もちろん", translation: "of course", context: "Arriving", notes: '{"speaker":"partner","or":true}' }),
      card({ id: "c4", text: "水", translation: "water", type: "word", context: "Arriving" }),
    ]);

    expect([...root.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim()))
      .toEqual(["Arriving", "Vocab"]);
    expect(root.querySelector(".deck-view-section-header")).toBeNull();
    expect(root.textContent).not.toContain("Conversation 1");
    expect(root.textContent).not.toContain("lines");
    expect(root.textContent).not.toContain("You");
    expect(root.textContent).not.toContain("Partner");
    expect(root.querySelector(".card-alternative").textContent).toBe("or");
    expect(root.querySelector('[data-speaker="you"]')).not.toBeNull();
    expect(root.querySelector('[data-speaker="partner"]')).not.toBeNull();
    expect(root.querySelectorAll('[role="tabpanel"]')[1].hasAttribute("inert")).toBe(true);
  });

  it("renders an empty phrasebook as a single left-anchored Vocab page", () => {
    const root = document.createElement("div");
    root.innerHTML = renderDeckBody(deck, []);

    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(root.querySelector('[role="tab"]').textContent.trim()).toBe("Vocab");
    expect(root.textContent).not.toContain("Conversations");
    expect(root.textContent).not.toContain("Starred");
    expect(root.querySelector('[role="tabpanel"]').textContent)
      .toContain("No vocabulary in this phrasebook.");
  });
});

describe("content rendering — untrusted persisted data", () => {
  it("renders card, context, and deck strings literally while preserving safe ruby markup", () => {
    const injectedElement = '<img src=x onerror="window.__injected=true">';
    const hostileId = 'card" onmouseover="window.__injected=true';
    const root = document.createElement("div");
    root.innerHTML = renderDeckBody(
      { ...deck, name: injectedElement },
      [{
        ...card({
          id: hostileId,
          text: injectedElement,
          translation: injectedElement,
          createdAt: "2026-01-01T00:00:00.000Z",
          context: injectedElement,
        }),
        reading: [[injectedElement, 'reading"><img src=x onerror=alert(1)>']],
      }],
    );

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".pane-header-title").textContent).toBe(injectedElement);
    expect(root.querySelector('[role="tab"]').textContent.trim()).toBe(injectedElement);
    expect(root.querySelector(".card-term-english").textContent).toBe(injectedElement);
    expect(root.querySelector(".card-row-wrapper").dataset.cardId).toBe(hostileId);
    expect(root.querySelector(".card-row-wrapper").hasAttribute("onmouseover")).toBe(false);
    expect(root.querySelector(".card-term-target ruby")).not.toBeNull();
    expect(root.querySelector(".card-term-target ruby").childNodes[0].textContent).toBe(injectedElement);
    expect(root.querySelector(".card-term-target rt").textContent)
      .toBe('reading"><img src=x onerror=alert(1)>');
  });
});
