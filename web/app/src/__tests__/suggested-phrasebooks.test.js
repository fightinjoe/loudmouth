import { describe, it, expect } from "vitest";
import { SUGGESTED_PHRASEBOOKS, pendingSuggestions } from "../js/suggested-phrasebooks.js";

describe("SUGGESTED_PHRASEBOOKS", () => {
  it("has a unique id per entry", () => {
    const ids = SUGGESTED_PHRASEBOOKS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has at least one placeholder term", () => {
    for (const s of SUGGESTED_PHRASEBOOKS) {
      expect(s.terms.length).toBeGreaterThan(0);
    }
  });
});

describe("pendingSuggestions", () => {
  it("returns every suggestion when nothing has been seeded", () => {
    expect(pendingSuggestions(new Set())).toHaveLength(SUGGESTED_PHRASEBOOKS.length);
  });

  it("excludes a suggestion whose id is already in the seeded set", () => {
    const [first] = SUGGESTED_PHRASEBOOKS;
    const pending = pendingSuggestions(new Set([first.id]));
    expect(pending.find((s) => s.id === first.id)).toBeUndefined();
    expect(pending).toHaveLength(SUGGESTED_PHRASEBOOKS.length - 1);
  });

  it("returns an empty list once every suggestion has been seeded", () => {
    const all = new Set(SUGGESTED_PHRASEBOOKS.map((s) => s.id));
    expect(pendingSuggestions(all)).toHaveLength(0);
  });
});
