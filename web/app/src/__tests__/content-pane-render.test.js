// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderCardsHTML, renderDeckBody } from "../panes/content-pane-render.js";

const deck = { id: "d1", name: "Dinner phrasebook", lang: "ja", readingDisplay: "reading" };

function card(overrides) {
  return {
    id: overrides.id,
    lang: "ja",
    text: overrides.text,
    translation: overrides.translation,
    createdAt: overrides.createdAt,
    context: overrides.context,
  };
}

describe("renderCardsHTML — grouped sections", () => {
  it("renders a single standalone term with no section header", () => {
    const cards = [card({ id: "c1", text: "晩ご飯", translation: "dinner", createdAt: "2026-01-01T00:00:00.000Z" })];
    const html = renderCardsHTML(deck, cards);
    expect(html).not.toContain("deck-view-section-header");
    expect(html).toContain("dinner");
  });

  it("renders multiple standalone terms with no header when no group exists yet", () => {
    const cards = [
      card({ id: "c1", text: "晩ご飯", translation: "dinner", createdAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "c2", text: "水", translation: "water", createdAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const html = renderCardsHTML(deck, cards);
    expect(html).not.toContain("deck-view-section-header");
  });

  it("sections group-sourced terms under their group's title", () => {
    const cards = [
      card({ id: "c1", text: "晩ご飯", translation: "dinner", createdAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "c2", text: "お会計", translation: "check please", createdAt: "2026-01-02T00:00:00.000Z", context: "Ordering at a restaurant" }),
    ];
    const html = renderCardsHTML(deck, cards);
    expect(html).toContain("Ordering at a restaurant");
  });

  it("labels a standalone term under 'Translations' once a group section exists", () => {
    const cards = [
      card({ id: "c1", text: "晩ご飯", translation: "dinner", createdAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "c2", text: "お会計", translation: "check please", createdAt: "2026-01-02T00:00:00.000Z", context: "Ordering at a restaurant" }),
    ];
    const html = renderCardsHTML(deck, cards);
    expect(html).toContain(">Translations<");
    expect(html).toContain("dinner");
    expect(html).toContain("Ordering at a restaurant");
  });

  it("uses a 'Translations' header, newest-first, once multiple standalone terms coexist with a group", () => {
    const cards = [
      card({ id: "c1", text: "晩ご飯", translation: "dinner", createdAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "c2", text: "お会計", translation: "check please", createdAt: "2026-01-02T00:00:00.000Z", context: "Ordering at a restaurant" }),
      card({ id: "c3", text: "ありがとう", translation: "thank you", createdAt: "2026-01-03T00:00:00.000Z" }),
    ];
    const html = renderCardsHTML(deck, cards);
    expect(html).toContain(">Translations<");
    // Newest standalone term ("thank you") appears before the older one ("dinner").
    expect(html.indexOf("thank you")).toBeLessThan(html.indexOf("dinner"));
    // Translations section (standalone) renders before the group section.
    expect(html.indexOf(">Translations<")).toBeLessThan(html.indexOf("Ordering at a restaurant"));
  });

  it("orders group sections by their earliest card, oldest section first", () => {
    const cards = [
      card({ id: "c1", text: "1", translation: "later group card", createdAt: "2026-01-05T00:00:00.000Z", context: "Later group" }),
      card({ id: "c2", text: "2", translation: "earlier group card", createdAt: "2026-01-01T00:00:00.000Z", context: "Earlier group" }),
    ];
    const html = renderCardsHTML(deck, cards);
    expect(html.indexOf("Earlier group")).toBeLessThan(html.indexOf("Later group"));
  });

  it("returns the empty-cards message for a deck with no cards", () => {
    const html = renderCardsHTML(deck, []);
    expect(html).toContain("No cards in this deck");
  });
});

describe("renderCardsHTML — vocabulary filtering", () => {
  it("renders type: word cards as a flat vocab list on the vocab tab, excluded from conversations", () => {
    const cards = [
      { ...card({ id: "c1", text: "水", translation: "water", createdAt: "2026-01-01T00:00:00.000Z", context: "At the market" }), type: "word" },
      { ...card({ id: "c2", text: "茶", translation: "tea", createdAt: "2026-01-02T00:00:00.000Z" }), type: "word" },
    ];
    const vocabHtml = renderCardsHTML(deck, cards, "vocab");
    expect(vocabHtml).toContain('data-card-id="c1"');
    expect(vocabHtml).toContain('data-card-id="c2"');
    expect(vocabHtml).not.toContain("card-group");
    const convHtml = renderCardsHTML(deck, cards, "conversations");
    expect(convHtml).toContain("No cards in this deck");
  });
});

describe("content rendering — untrusted persisted data", () => {
  it("renders card, section, and deck strings literally while preserving safe ruby markup", () => {
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
    expect(root.querySelector(".deck-view-section-header").textContent).toBe(injectedElement);
    expect(root.querySelector(".card-term-english").textContent).toBe(injectedElement);
    expect(root.querySelector(".card-row-wrapper").dataset.cardId).toBe(hostileId);
    expect(root.querySelector(".card-row-wrapper").hasAttribute("onmouseover")).toBe(false);
    expect(root.querySelector(".card-term-target ruby")).not.toBeNull();
    expect(root.querySelector(".card-term-target ruby").childNodes[0].textContent).toBe(injectedElement);
    expect(root.querySelector(".card-term-target rt").textContent).toBe('reading"><img src=x onerror=alert(1)>');
  });
});
