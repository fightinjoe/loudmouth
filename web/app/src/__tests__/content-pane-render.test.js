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
