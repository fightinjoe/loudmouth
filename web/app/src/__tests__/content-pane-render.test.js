import { describe, it, expect } from "vitest";
import { renderCardsHTML } from "../panes/content-pane-render.js";

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

describe("renderCardsHTML — grouped sections (PH-006)", () => {
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

  it("labels the standalone term under 'Translations' once a group section exists (Journey 1's single-term-no-header state only holds when there are zero group sections yet)", () => {
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

describe("renderCardsHTML — Group wrapper (collapsible sections, Figma node 754:6178)", () => {
  it("wraps a group-sourced section in a card-group, collapsed by default", () => {
    const cards = [
      card({ id: "c1", text: "水", translation: "water", createdAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "c2", text: "お会計", translation: "check please", createdAt: "2026-01-02T00:00:00.000Z", context: "Ordering at a restaurant" }),
    ];
    const html = renderCardsHTML(deck, cards);
    expect(html).toContain('class="card-group"');
    expect(html).toContain('data-collapsed="true"');
  });

  it("does NOT wrap the standalone 'Translations' section in a card-group", () => {
    const cards = [
      card({ id: "c1", text: "水", translation: "water", createdAt: "2026-01-01T00:00:00.000Z" }),
      card({ id: "c2", text: "お会計", translation: "check please", createdAt: "2026-01-02T00:00:00.000Z", context: "Ordering at a restaurant" }),
    ];
    const html = renderCardsHTML(deck, cards);
    const translationsIdx = html.indexOf(">Translations<");
    const firstGroupIdx = html.indexOf('class="card-group"');
    // The standalone section's rows render before any card-group markup appears.
    expect(translationsIdx).toBeGreaterThanOrEqual(0);
    expect(firstGroupIdx).toBeGreaterThan(translationsIdx);
  });

  it("footer shows a combined count label for untyped cards, and both View/Collapse labels (CSS picks the visible one)", () => {
    const cards = [
      card({ id: "c1", text: "お会計", translation: "check please", createdAt: "2026-01-01T00:00:00.000Z", context: "Ordering at a restaurant" }),
      card({ id: "c2", text: "メニュー", translation: "menu", createdAt: "2026-01-02T00:00:00.000Z", context: "Ordering at a restaurant" }),
    ];
    const html = renderCardsHTML(deck, cards);
    expect(html).toContain("2 words / phrases");
    expect(html).toContain("card-group-footer-view");
    expect(html).toContain("card-group-footer-collapse");
    expect(html).toContain('data-action="content/toggle-group"');
  });

  it("uses a homogeneous 'words' label when every card in the group is type: word", () => {
    const cards = [
      { ...card({ id: "c1", text: "水", translation: "water", createdAt: "2026-01-01T00:00:00.000Z", context: "Drinks" }), type: "word" },
      { ...card({ id: "c2", text: "茶", translation: "tea", createdAt: "2026-01-02T00:00:00.000Z", context: "Drinks" }), type: "word" },
    ];
    const html = renderCardsHTML(deck, cards);
    expect(html).toContain("2 words");
  });
});
