// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  getDeckPages,
  renderDeckBody,
} from "../panes/content-pane-render";

const deck = {
  id: "d1",
  name: "Dinner phrasebook",
  lang: "ja",
  createdAt: "2026-01-01T00:00:00.000Z",
  mode: "study",
  order: "default",
  readingDisplay: "reading",
};

const membership = (cardId, position, starredAt = null) => ({
  deckId: deck.id,
  cardId,
  createdAt: "2026-01-01T00:00:00.000Z",
  position,
  starredAt,
});

const phrase = (key, cardId, translation, occurrence = {}) => ({
  key,
  cardId,
  card: {
    type: "phrase",
    lang: "ja",
    text: "どうぞ",
    translation,
  },
  membership: membership(cardId, 0),
  occurrence: {
    id: key,
    deckId: deck.id,
    cardId,
    position: occurrence.position ?? 0,
    translation,
    ...(occurrence.groupId ? { groupId: occurrence.groupId } : {}),
    ...(occurrence.speaker ? { speaker: occurrence.speaker } : {}),
    ...(occurrence.alternative ? { alternative: true } : {}),
  },
  sources: [],
});

const word = {
  key: '["d1","word-1"]',
  cardId: "word-1",
  card: {
    type: "word",
    lang: "ja",
    text: "水",
    translation: "water",
    partOfSpeech: "noun",
    senseKey: "water",
  },
  membership: membership("word-1", 0),
  sources: [],
};

const chunk = {
  key: '["d1","chunk-1"]',
  cardId: "chunk-1",
  card: {
    type: "chunk",
    lang: "ja",
    text: "肉も",
    translation: "meat too",
    role: "topic phrase",
    explanation: "Adds meat to the list.",
    source: {
      snapshot: {
        lang: "ja",
        text: "肉も魚も食べません。",
        translation: "I don't eat meat or fish.",
      },
      span: { start: 0, end: 2 },
    },
  },
  membership: membership("chunk-1", 0),
  sources: [],
};

const groups = [
  { id: "group-later", deckId: deck.id, title: "Ordering", position: 1 },
  { id: "group-first", deckId: deck.id, title: "Ordering", position: 0 },
];

describe("phrasebook joined-entry pages", () => {
  it("preserves groupless order and duplicate-title group identity before Chunks and Vocab", () => {
    const entries = [
      phrase("loose-new", "phrase-a", "newest", { position: 0 }),
      phrase("loose-old", "phrase-b", "older", { position: 1 }),
      phrase("later-row", "phrase-c", "later group", { groupId: "group-later" }),
      phrase("first-row", "phrase-d", "first group", { groupId: "group-first" }),
      chunk,
      word,
    ];

    const pages = getDeckPages(entries, groups);
    expect(pages.map((page) => page.key)).toEqual([
      "translations",
      "group:group-first",
      "group:group-later",
      "chunks",
      "vocab",
    ]);
    expect(pages.map((page) => page.title)).toEqual([
      "Translations",
      "Ordering",
      "Ordering",
      "Chunks",
      "Vocab",
    ]);
    expect(pages[0].entries.map((entry) => entry.key)).toEqual(["loose-new", "loose-old"]);
    expect(pages[1].entries.map((entry) => entry.key)).toEqual(["first-row"]);
    expect(pages[2].entries.map((entry) => entry.key)).toEqual(["later-row"]);
  });

  it("renders each repeated occurrence's interpretation, speaker, alternative, and entry key", () => {
    const entries = [
      phrase("occ-you", "shared", "please go ahead", {
        groupId: "group-first",
        position: 0,
        speaker: "you",
      }),
      phrase("occ-partner", "shared", "after you", {
        groupId: "group-first",
        position: 1,
        speaker: "partner",
        alternative: true,
      }),
    ];
    const root = document.createElement("div");
    root.innerHTML = renderDeckBody(deck, entries, groups, "group:group-first");

    const tabs = [...root.querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent.trim())).toEqual(["Ordering", "Ordering", "Vocab"]);
    const rows = [...root.querySelectorAll('.deck-page[data-page-key="group:group-first"] .card-row-wrapper')];
    expect(rows.map((row) => row.dataset.entryKey)).toEqual(["occ-you", "occ-partner"]);
    expect(rows.map((row) => row.querySelector(".card-term-english").textContent)).toEqual([
      "please go ahead",
      "after you",
    ]);
    expect(rows[0].dataset.speaker).toBe("you");
    expect(rows[1].dataset.speaker).toBe("partner");
    expect(rows[1].querySelector(".card-alternative").textContent).toBe("or");
  });

  it("renders Chunks in full highlighted historical context", () => {
    const root = document.createElement("div");
    root.innerHTML = renderDeckBody(deck, [chunk], [], "chunks");

    expect(root.querySelector('[data-page-key="chunks"] .source-context').textContent)
      .toBe("肉も魚も食べません。");
    expect(root.querySelector('[data-page-key="chunks"] mark').textContent).toBe("肉も");
    expect(root.querySelector('[data-page-key="chunks"] .card-row-wrapper').dataset.entryKey)
      .toBe(chunk.key);
  });

  it("shows every saved card type in a language-library view without star controls", () => {
    const systemDeck = {
      id: "lang:ja",
      name: "All Japanese Cards",
      lang: "ja",
      mode: "study",
      order: "default",
      readingDisplay: "reading",
      system: true,
    };
    const libraryPhrase = {
      ...phrase("phrase-record", "phrase-record", "come in"),
      membership: undefined,
      occurrence: undefined,
    };
    const libraryChunk = { ...chunk, membership: undefined };
    const libraryWord = { ...word, membership: undefined };
    const root = document.createElement("div");
    root.innerHTML = renderDeckBody(
      systemDeck,
      [libraryPhrase, libraryChunk, libraryWord],
      [],
      null,
    );

    expect(root.querySelectorAll(".card-row-wrapper")).toHaveLength(3);
    expect(root.querySelectorAll(".card-star")).toHaveLength(0);
    expect(root.textContent).toContain("come in");
    expect(root.textContent).toContain("meat too");
    expect(root.textContent).toContain("water");
  });
});

describe("content rendering safety", () => {
  it("renders deck, group, entry, and card strings literally while preserving safe ruby", () => {
    const injected = '<img src=x onerror="window.__injected=true">';
    const hostileKey = 'entry" onmouseover="window.__injected=true';
    const hostileCardId = 'card" onmouseover="window.__injected=true';
    const entry = {
      ...phrase(hostileKey, hostileCardId, injected, { groupId: "hostile-group" }),
      card: {
        type: "phrase",
        lang: "ja",
        text: injected,
        translation: injected,
        reading: [[injected, 'reading"><img src=x onerror=alert(1)>']],
      },
    };
    const root = document.createElement("div");
    root.innerHTML = renderDeckBody(
      { ...deck, name: injected },
      [entry],
      [{ id: "hostile-group", deckId: deck.id, title: injected, position: 0 }],
      "group:hostile-group",
    );

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".pane-header-title").textContent).toBe(injected);
    expect(root.querySelector('[role="tab"]').textContent.trim()).toBe(injected);
    expect(root.querySelector(".card-term-english").textContent).toBe(injected);
    expect(root.querySelector(".card-row-wrapper").dataset.entryKey).toBe(hostileKey);
    expect(root.querySelector(".card-star").dataset.cardId).toBe(hostileCardId);
    expect(root.querySelector(".card-row-wrapper").hasAttribute("onmouseover")).toBe(false);
    expect(root.querySelector(".card-term-target ruby").childNodes[0].textContent).toBe(injected);
    expect(root.querySelector(".card-term-target rt").textContent)
      .toBe('reading"><img src=x onerror=alert(1)>');
  });
});
