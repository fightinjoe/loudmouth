// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { categoryCount, entryChapterKey, getDeckChapters } from "../js/phrasebook-chapters";
import { renderDeckBody } from "../panes/content-pane-render";
import { renderChapterMenu, renderChapterSheetBody } from "../components/chapter-sheet";

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
    ...(occurrence.groupId ? { groupId: occurrence.groupId, section: occurrence.section ?? "exampleConversation" } : {}),
    ...(occurrence.speaker ? { speaker: occurrence.speaker } : {}),
    ...(occurrence.exchangeId ? { exchangeId: occurrence.exchangeId, turnIndex: occurrence.turnIndex } : {}),
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

/** A word placed in a topic's word family. */
const placed = (key, groupId, familyId, translation, position = 0, starredAt = null) => ({
  ...word, key, cardId: key, card: { ...word.card, translation, senseKey: translation },
  membership: membership(key, position, starredAt),
  wordPlacement: { id: key, deckId: deck.id, groupId, familyId, cardId: key, position },
});

const groups = [
  { id: "group-later", deckId: deck.id, title: "Ordering", position: 1, exchanges: [], wordFamilies: [] },
  { id: "group-first", deckId: deck.id, title: "Ordering", position: 0,
    exchanges: [{ id: "exchange-first", title: "An invitation", position: 0 }],
    wordFamilies: [{ id: "family-first", title: "Drinks", position: 0 }] },
];

/** Three topics: Ordering and Paying with content (one family and one exchange left empty), Small talk without any. */
const restaurant = [
  { id: "g-order", deckId: deck.id, title: "Ordering", position: 0,
    exchanges: [{ id: "x-table", title: "Getting a table", position: 0 }, { id: "x-empty", title: "Unused", position: 1 }],
    wordFamilies: [{ id: "f-drinks", title: "Drinks", position: 0 }, { id: "f-empty", title: "Cutlery", position: 1 }] },
  { id: "g-pay", deckId: deck.id, title: "Paying", position: 1,
    exchanges: [{ id: "x-bill", title: "Asking for the bill", position: 0 }],
    wordFamilies: [{ id: "f-money", title: "Money", position: 0 }] },
  { id: "g-quiet", deckId: deck.id, title: "Small talk", position: 2, exchanges: [], wordFamilies: [] },
];

const restaurantEntries = () => [
  placed("w-water", "g-order", "f-drinks", "water", 0),
  placed("w-tea", "g-order", "f-drinks", "tea", 1),
  placed("w-yen", "g-pay", "f-money", "yen", 0),
  phrase("say-menu", "say-menu", "The menu, please", { groupId: "g-order", section: "thingsToSay", position: 0 }),
  phrase("say-water", "say-water", "Water, please", { groupId: "g-order", section: "thingsToSay", position: 1 }),
  phrase("say-card", "say-card", "By card, please", { groupId: "g-pay", section: "thingsToSay", position: 0 }),
  phrase("table-ask", "table-ask", "A table for two", { groupId: "g-order", section: "likelyExchanges", exchangeId: "x-table", turnIndex: 0, speaker: "you" }),
  phrase("table-reply", "table-reply", "This way", { groupId: "g-order", section: "likelyExchanges", exchangeId: "x-table", turnIndex: 1, speaker: "partner" }),
  phrase("bill-ask", "bill-ask", "The bill, please", { groupId: "g-pay", section: "likelyExchanges", exchangeId: "x-bill", turnIndex: 0, speaker: "you" }),
  phrase("loose", "loose", "Imported"),
];

const conversationLines = (groupId, count) => Array.from({ length: count }, (_, index) =>
  phrase(`${groupId}-line-${index}`, `${groupId}-line-${index}`, `Line ${index}`, {
    groupId, section: "exampleConversation", position: index, speaker: index % 2 ? "partner" : "you",
  }));

function landing(entries, deckGroups) {
  const root = document.createElement("div");
  root.innerHTML = renderDeckBody(deck, entries, deckGroups);
  return root;
}

/** Each deck group's label with its cards' heading, reveal target, and count. */
function deckGroups(card) {
  return [...card.querySelectorAll(".chapter-row .deck-group")].map((group) => [group.getAttribute("aria-label"),
    [...group.querySelectorAll(".deck-card")].map((button) => [
      button.querySelector(".deck-card-label").textContent, button.dataset.focus, button.querySelector(".deck-card-foot").textContent,
    ])]);
}

function sheetBody(chapter, tab = "words") {
  const root = document.createElement("div");
  root.innerHTML = renderChapterSheetBody(chapter, {
    readingDisplay: "reading",
    readOnly: false,
    tab,
    contextFor: () => "",
  });
  return root;
}

const chapterFor = (entries, deckGroups, key) => getDeckChapters(entries, deckGroups).find((chapter) => chapter.key === key);

describe("phrasebook chapters", () => {
  it("returns the four categories, then non-empty collections, then Starred, with duplicate-title topics in stored order", () => {
    const entries = [
      phrase("loose-new", "phrase-a", "newest", { position: 0 }),
      phrase("loose-old", "phrase-b", "older", { position: 1 }),
      phrase("later-row", "phrase-c", "later group", { groupId: "group-later" }),
      phrase("first-row", "phrase-d", "first group", { groupId: "group-first" }),
      chunk,
      word,
    ];

    const chapters = getDeckChapters(entries, groups);
    expect(chapters.map((chapter) => chapter.key)).toEqual([
      "category:words", "category:phrases", "category:exchanges", "category:conversation",
      "translations", "words", "chunks", "starred",
    ]);
    const conversation = chapters.find((chapter) => chapter.key === "category:conversation");
    expect(conversation.topics.map((topic) => topic.groupId)).toEqual(["group-first", "group-later"]);
    expect(conversation.topics.map((topic) => topic.exampleConversation.map((entry) => entry.key))).toEqual([["first-row"], ["later-row"]]);
    expect(chapters.find((chapter) => chapter.key === "translations").entries.map((entry) => entry.key)).toEqual(["loose-new", "loose-old"]);
    expect(chapters.find((chapter) => chapter.key === "words").entries.map((entry) => entry.key)).toEqual([word.key]);

    expect(getDeckChapters([], []).map((chapter) => chapter.key)).toEqual([
      "category:words", "category:phrases", "category:exchanges", "category:conversation", "starred",
    ]);
  });

  it("counts word families and exchanges with content, and topics with key phrases or conversation", () => {
    const entries = [...restaurantEntries(), ...conversationLines("g-pay", 2)];
    const count = (key) => categoryCount(chapterFor(entries, restaurant, key));
    expect(["category:words", "category:phrases", "category:exchanges", "category:conversation"].map(count)).toEqual([2, 2, 2, 1]);
    expect(categoryCount(chapterFor([], restaurant, "category:words"))).toBe(0);
  });

  it.each([
    ["a placed word", placed("w", "g-order", "f-drinks", "water"), "category:words"],
    ["a key phrase", phrase("p", "p", "please", { groupId: "g-order", section: "thingsToSay" }), "category:phrases"],
    ["an exchange line", phrase("x", "x", "hello", { groupId: "g-order", section: "likelyExchanges", exchangeId: "x-table", turnIndex: 0 }), "category:exchanges"],
    ["a conversation line", phrase("c", "c", "hi", { groupId: "g-order", section: "exampleConversation" }), "category:conversation"],
    ["an unplaced phrase", phrase("t", "t", "imported"), "translations"],
    ["an unplaced word", word, "words"],
    ["a chunk", chunk, "chunks"],
  ])("shows %s in context in its chapter", (_name, entry, key) => {
    expect(entryChapterKey(entry)).toBe(key);
  });
});

describe("phrasebook landing by category", () => {
  it("shows only categories with content, in fixed order, before collections", () => {
    const root = landing(restaurantEntries(), restaurant);

    expect([...root.querySelectorAll('[data-region="chapter-list"] > .chapter-card')].map((card) => card.dataset.chapterKey))
      .toEqual(["category:words", "category:phrases", "category:exchanges", "translations"]);
    expect([...root.querySelectorAll('.chapter-card[data-chapter-kind="category"]')].map((card) => [
      card.dataset.category,
      card.querySelector(".chapter-card-glyph").textContent,
      card.querySelector(".chapter-card-name").textContent.replace(/\s+/g, " ").trim(),
    ])).toEqual([
      ["words", "Aa", "Words · 2 groups"],
      ["phrases", "“", "Key phrases · 2 topics"],
      ["exchanges", "⇆", "Exchanges · 2 exchanges"],
    ]);
    const header = root.querySelector('.chapter-card[data-category="words"] .chapter-card-header');
    expect(header.dataset).toMatchObject({ action: "content/open-chapter", chapterKey: "category:words" });
    expect(header.dataset.focus).toBeUndefined();
    expect(root.querySelectorAll('.chapter-row[tabindex="0"]')).toHaveLength(4);
    expect(root.querySelector('[data-region="starred-card"]').children).toHaveLength(0);
    expect(landing([], restaurant).querySelector('[data-region="chapter-list"] .chapter-card')).toBeNull();
  });

  it("heads Words and Exchanges cards by family or exchange, one deck group per topic with content", () => {
    const root = landing(restaurantEntries(), restaurant);
    const words = root.querySelector('.chapter-card[data-category="words"]');
    expect(deckGroups(words)).toEqual([
      ["Ordering", [["Drinks", "family:f-drinks", "2 words"]]],
      ["Paying", [["Money", "family:f-money", "1 word"]]],
    ]);
    expect(words.querySelector(".deck-card .deck-card-english").textContent).toBe("water");
    expect([...words.querySelectorAll(".deck-card")].every((card) => card.dataset.chapterKey === "category:words")).toBe(true);
    expect(deckGroups(root.querySelector('.chapter-card[data-category="exchanges"]'))).toEqual([
      ["Ordering", [["Getting a table", "exchange:x-table", "2 lines"]]],
      ["Paying", [["Asking for the bill", "exchange:x-bill", "1 line"]]],
    ]);
  });

  it("heads Key phrases and Conversation cards by topic in one deck group", () => {
    const entries = [...restaurantEntries(), ...conversationLines("g-order", 4)];
    const root = landing(entries, restaurant);
    const phrases = root.querySelector('.chapter-card[data-category="phrases"]');
    expect(deckGroups(phrases)).toEqual([
      ["Key phrases by topic", [["Ordering", "topic:g-order", "2 phrases"], ["Paying", "topic:g-pay", "1 phrase"]]],
    ]);
    expect(phrases.querySelector(".deck-card-english").textContent).toBe("The menu, please");
    const conversation = root.querySelector('.chapter-card[data-category="conversation"]');
    expect(deckGroups(conversation)).toEqual([["Conversations by topic", [["Ordering", "topic:g-order", "4 lines"]]]]);
    expect([...conversation.querySelectorAll(".deck-card--conversation .deck-card-line")].map((line) => line.dataset.speaker))
      .toEqual(["you", "partner", "you"]);
  });
});

describe("category chapter sheet", () => {
  it("lists every topic's word families and exchanges with the topic beneath each heading", () => {
    const entries = restaurantEntries();
    const sections = (root, attribute) => [...root.querySelectorAll(`.chapter-group[${attribute}]`)].map((section) => [
      section.getAttribute(attribute),
      section.querySelector(".chapter-group-title").textContent,
      section.querySelector(".chapter-group-context").textContent,
      section.querySelectorAll(".card-row-wrapper").length,
    ]);

    const words = sheetBody(chapterFor(entries, restaurant, "category:words"));
    expect(words.querySelector(".chapter-tabs").dataset.tabCount).toBe("1");
    expect([...words.querySelectorAll(".chapter-page")].map((page) => [page.dataset.tab, page.hasAttribute("inert")])).toEqual([["words", false]]);
    expect(sections(words, "data-family-id")).toEqual([
      ["f-drinks", "Drinks", "Ordering", 2], ["f-empty", "Cutlery", "Ordering", 0], ["f-money", "Money", "Paying", 1],
    ]);
    expect(words.querySelector('[data-family-id="f-empty"] .chapter-empty')).not.toBeNull();
    expect([...words.querySelectorAll('[data-reorder-region="family:f-drinks"] .card-row-wrapper')].map((row) => row.dataset.entryKey))
      .toEqual(["w-water", "w-tea"]);

    const exchanges = sheetBody(chapterFor(entries, restaurant, "category:exchanges"));
    expect(sections(exchanges, "data-exchange-id")).toEqual([
      ["x-table", "Getting a table", "Ordering", 2], ["x-empty", "Unused", "Ordering", 0], ["x-bill", "Asking for the bill", "Paying", 1],
    ]);
  });

  it("heads Key phrases and Conversation sections by topic and explains an empty category", () => {
    const entries = [...restaurantEntries(), ...conversationLines("g-pay", 2)];
    const phrases = sheetBody(chapterFor(entries, restaurant, "category:phrases"));
    expect([...phrases.querySelectorAll(".chapter-group[data-topic-id]")].map((section) => [
      section.dataset.topicId, section.querySelector(".chapter-group-title").textContent,
      section.querySelector(".chapter-group-context"),
      [...section.querySelectorAll(".card-row-wrapper")].map((row) => row.dataset.entryKey),
    ])).toEqual([
      ["g-order", "Ordering", null, ["say-menu", "say-water"]],
      ["g-pay", "Paying", null, ["say-card"]],
    ]);
    expect(phrases.querySelector('[data-reorder-region="thingsToSay:g-pay"] [data-entry-key="say-card"]')).not.toBeNull();
    expect(phrases.querySelector('[data-reorder-region^="thingsToSay"] [data-speaker]')).toBeNull();

    const conversation = sheetBody(chapterFor(entries, restaurant, "category:conversation"));
    expect([...conversation.querySelectorAll(".chapter-group[data-topic-id]")].map((section) => section.dataset.topicId)).toEqual(["g-pay"]);
    expect(conversation.querySelectorAll('[data-reorder-region="exampleConversation:g-pay"] .card-row-wrapper')).toHaveLength(2);

    const empty = sheetBody(chapterFor(restaurantEntries(), restaurant, "category:conversation"));
    expect(empty.querySelector(".chapter-group")).toBeNull();
    expect(empty.querySelector(".chapter-empty").textContent).toBe("No conversation in this phrasebook.");
  });

  it("renders repeated interpretations as explicit options within their exchange turn", () => {
    const entries = [
      phrase("occ-you", "shared", "please go ahead", {
        groupId: "group-first",
        section: "likelyExchanges", exchangeId: "exchange-first", turnIndex: 0,
        position: 0,
        speaker: "you",
      }),
      phrase("occ-alternative", "shared", "after you", {
        groupId: "group-first",
        position: 1,
        speaker: "you",
        section: "likelyExchanges", exchangeId: "exchange-first", turnIndex: 0,
      }),
      phrase("occ-partner", "reply", "Thank you", {
        groupId: "group-first", position: 0, speaker: "partner",
        section: "likelyExchanges", exchangeId: "exchange-first", turnIndex: 1,
      }),
    ];
    const root = sheetBody(chapterFor(entries, groups, "category:exchanges"));

    const rows = [...root.querySelectorAll('.chapter-page[data-tab="exchanges"] .card-row-wrapper')];
    expect(rows.map((row) => row.dataset.entryKey)).toEqual(["occ-you", "occ-alternative", "occ-partner"]);
    expect(rows.map((row) => row.querySelector(".card-term-english").textContent)).toEqual([
      "please go ahead",
      "after you",
      "Thank you",
    ]);
    expect(rows.map((row) => row.dataset.speaker)).toEqual(["you", "you", "partner"]);
    expect(rows[1].querySelector(".card-option-separator")).not.toBeNull();
    expect(rows[2].querySelector(".card-option-separator")).toBeNull();
    expect(root.querySelector('[data-exchange-id="exchange-first"] .chapter-group-title').textContent).toBe("An invitation");
    expect(rows[0].closest("[data-reorder-region]").dataset.reorderRegion).toBe("exchange:exchange-first:0");
    expect(rows[1].closest("[data-reorder-region]")).toBe(rows[0].closest("[data-reorder-region]"));
    expect(rows[2].closest("[data-reorder-region]").dataset.reorderRegion).toBe("exchange:exchange-first:1");
  });
});

describe("chapter menu", () => {
  const menuKeys = (chapters, currentKey) => {
    const root = document.createElement("div");
    root.innerHTML = renderChapterMenu(chapters, currentKey);
    return [...root.querySelectorAll(".chapter-menu-item")].map((item) => [item.dataset.chapterKey, item.getAttribute("aria-checked")]);
  };

  it("lists categories with content and collections, plus the current chapter even while it is empty", () => {
    const chapters = getDeckChapters(restaurantEntries(), restaurant);
    expect(menuKeys(chapters, "category:words")).toEqual([
      ["category:words", "true"], ["category:phrases", "false"], ["category:exchanges", "false"], ["translations", "false"],
    ]);
    expect(menuKeys(chapters, "category:conversation")).toEqual([
      ["category:words", "false"], ["category:phrases", "false"], ["category:exchanges", "false"],
      ["category:conversation", "true"], ["translations", "false"],
    ]);
    const root = document.createElement("div");
    root.innerHTML = renderChapterMenu(chapters, "category:words");
    expect(root.querySelector('[data-chapter-key="category:words"] .chapter-menu-marker').textContent).toBe("Aa");
    expect(root.querySelector('[data-chapter-key="category:words"] .chapter-menu-name').textContent).toBe("Words");
  });

  it("leads with Starred only while something is starred", () => {
    const entries = restaurantEntries();
    expect(menuKeys(getDeckChapters(entries, restaurant), "category:phrases").map(([key]) => key)).not.toContain("starred");
    entries[0] = { ...entries[0], membership: membership(entries[0].cardId, 0, "2026-02-01T00:00:00.000Z") };
    expect(menuKeys(getDeckChapters(entries, restaurant), "category:phrases").map(([key]) => key)).toEqual([
      "starred", "category:words", "category:phrases", "category:exchanges", "translations",
    ]);
  });
});

describe("Starred and collection chapters", () => {
  it("splits Starred into words and phrases with each entry's topic context", () => {
    const starredAt = "2026-02-01T00:00:00.000Z";
    const placedWord = placed("placed-word", "group-first", "family-first", "water", 0, starredAt);
    const said = { ...phrase("said", "said-card", "please", { groupId: "group-first", section: "thingsToSay" }), membership: membership("said-card", 0, starredAt) };
    const starred = chapterFor([placedWord, said], groups, "starred");
    const root = document.createElement("div");
    root.innerHTML = renderChapterSheetBody(starred, {
      readingDisplay: "reading", readOnly: false, tab: "phrases",
      contextFor: (entry) => entry.key === "placed-word" ? "Ordering · Drinks" : "Ordering",
    });

    expect([...root.querySelectorAll(".chapter-tab")].map((tab) => [tab.dataset.tab, tab.getAttribute("aria-selected")]))
      .toEqual([["words", "false"], ["phrases", "true"]]);
    const items = (tab) => [...root.querySelectorAll(`.chapter-page[data-tab="${tab}"] .starred-item`)]
      .map((item) => [item.dataset.entryKey, item.querySelector(".starred-context").textContent,
        item.querySelector('[data-action="content/open-in-context"]').dataset.entryKey]);
    expect(items("words")).toEqual([["placed-word", "Ordering · Drinks", "placed-word"]]);
    expect(items("phrases")).toEqual([["said", "Ordering", "said"]]);
    expect(root.querySelector('.chapter-page[data-tab="words"]').hasAttribute("inert")).toBe(true);
  });

  it("uses decorative ready artwork and neutral patterned fallback without adding a flow image", () => {
    const root = document.createElement("div");
    const illustration = { requestId: "art-1", prompt: "Pattern", state: "pending" };
    root.innerHTML = renderDeckBody({ ...deck, illustration }, [], []);
    expect(root.querySelector(".textbook-pattern").style.backgroundImage).toContain("/textbook/frogs.png");
    root.innerHTML = renderDeckBody({ ...deck, illustration: {
      ...illustration, state: "ready",
      image: { dataUrl: "data:image/png;base64,aGVsbG8=", mediaType: "image/png", width: 1600, height: 900 },
    } }, [], []);
    expect(root.querySelector(".textbook-pattern").style.backgroundImage).toContain("data:image/png;base64,aGVsbG8=");
    root.innerHTML = renderDeckBody({ ...deck, illustration: { ...illustration, state: "failed" } }, [], []);
    expect(root.querySelector(".textbook-pattern").style.backgroundImage).toContain("/textbook/frogs.png");
    expect(root.querySelector("img")).toBeNull();
  });

  it("renders Chunks in full highlighted historical context", () => {
    const root = sheetBody(chapterFor([chunk], [], "chunks"));

    expect(root.querySelectorAll(".chapter-tab")).toHaveLength(1);
    expect(root.querySelector(".chapter-page:not([inert])")).not.toBeNull();
    expect(root.querySelector('[data-reorder-region="chunks"] .source-context').textContent)
      .toBe("肉も魚も食べません。");
    expect(root.querySelector('[data-reorder-region="chunks"] mark').textContent).toBe("肉も");
    expect(root.querySelector('[data-reorder-region="chunks"] .card-row-wrapper').dataset.entryKey)
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
    const hostileGroups = [{ id: "hostile-group", deckId: deck.id, title: injected, position: 0, exchanges: [], wordFamilies: [] }];
    const chapters = getDeckChapters([entry], hostileGroups);
    const root = document.createElement("div");
    root.innerHTML = renderDeckBody({ ...deck, name: injected }, [entry], hostileGroups)
      + renderChapterMenu(chapters, "category:conversation")
      + renderChapterSheetBody(chapters.find((chapter) => chapter.key === "category:conversation"), { readingDisplay: "reading", readOnly: false, tab: "words", contextFor: () => injected });

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".phrasebook-title").textContent).toBe(injected);
    expect(root.querySelector(".phrasebook-minibar").textContent).toBe(injected);
    expect(root.querySelector('.chapter-card[data-category="conversation"] .deck-card-label').textContent).toBe(injected);
    expect(root.querySelector('.chapter-card[data-category="conversation"] .deck-group').getAttribute("aria-label")).toBe("Conversations by topic");
    expect(root.querySelector('.chapter-group[data-topic-id="hostile-group"] .chapter-group-title').textContent).toBe(injected);
    expect(root.querySelector(".deck-card-line").textContent).toBe(injected);
    expect(root.querySelector(".card-term-english").textContent).toBe(injected);
    expect(root.querySelector(".card-row-wrapper").dataset.entryKey).toBe(hostileKey);
    expect(root.querySelector(".card-star").dataset.cardId).toBe(hostileCardId);
    expect(root.querySelector(".card-row-wrapper").hasAttribute("onmouseover")).toBe(false);
    expect(root.querySelector(".card-term-target ruby").childNodes[0].textContent).toBe(injected);
    expect(root.querySelector(".card-term-target rt").textContent)
      .toBe('reading"><img src=x onerror=alert(1)>');
  });
});
