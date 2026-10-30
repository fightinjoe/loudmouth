// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import Dexie from "dexie";
import {
  applyCardOrder,
  commitPhrasebook,
  createDb,
  deleteDeck,
  exportAllData,
  getCards,
  getCardsByLang,
  getReviewCards,
  importCards,
  initializeLibrary,
  removeCardFromDeck,
  restoreAllData,
  setDeckIllustration,
  toggleCardStar,
  updateDeckEntryOrder,
} from "../js/db";
import {
  LANGUAGE_ABILITY_PREFIX,
  LAST_DECK_KEY,
  CREATION_LANGUAGE_KEY,
  getLastCreationLanguage,
  setLastCreationLanguage,
  getLastAbility,
  getLastDeckId,
  setLastAbility,
  setLastDeckId,
} from "../js/preferences";

let store;

beforeEach(async () => {
  const indexedDB = new IDBFactory();
  store = createDb({ indexedDB, IDBKeyRange });
  await store.open();
  localStorage.clear();
  sessionStorage.clear();
});

function fixtureId(label) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(label)) return label;
  const hex = createHash("sha256").update(label).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function phrase(id, text, translation, extra = {}) {
  return {
    id: fixtureId(id),
    card: { type: "phrase", lang: "es", text, translation },
    ...extra,
  };
}

function word(text, translation, senseKey, sources) {
  return {
    card: {
      type: "word",
      lang: "es",
      text,
      translation,
      partOfSpeech: "noun",
      senseKey,
    },
    ...(sources ? { sources } : {}),
  };
}

function topic(id, title = "Conversation", text = "Hola", translation = "Hello") {
  return {
    id: fixtureId(id), title,
    thingsToSay: [phrase(`${id}-essential`, text, translation)],
    words: [],
    likelyExchanges: [{
      id: fixtureId(`${id}-exchange`), title: "Greeting",
      lines: [
        { speaker: "you", responses: [phrase(`${id}-option`, "Buenas noches", "Good evening")] },
        { speaker: "partner", responses: [phrase(`${id}-response`, "Igualmente", "Likewise")] },
      ],
    }],
    exampleConversation: [
      phrase(`${id}-you`, "¿Cómo estás?", "How are you?", { speaker: "you" }),
      phrase(`${id}-partner`, "Bien.", "Well.", { speaker: "partner" }),
    ],
  };
}

const image = {
  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAYAAAA7KqwyAAAAFklEQVR4nGP4sGVaAyWYYdSAUQOAGAAeWIiwsY03XwAAAABJRU5ErkJggg==",
  mediaType: "image/png", width: 16, height: 9,
};

function evidence(text, translation, start, end, occurrenceId) {
  return {
    snapshot: { lang: "es", text, translation },
    ...(occurrenceId ? { ref: { occurrenceId: fixtureId(occurrenceId) } } : {}),
    span: { start, end },
  };
}

function suggestedBook(name = "Book", text = "Hola", translation = "Hello") {
  return {
    name,
    lang: "es",
    groups: [topic(`${name}-group`, name, text, translation)],
    selectedIndexes: [0],
  };
}

async function createBook(name = "Book", text = "Hola", translation = "Hello", targetStore = store) {
  return commitPhrasebook(
    suggestedBook(name, text, translation),
    { store: targetStore },
  );
}

describe("commitPhrasebook", () => {
  it("deduplicates only final retained topics in original order without mutating speculative input", async () => {
    const discarded = topic("discarded", "Unchecked", "Buenos días", "Hello");
    const first = topic("first", "Same title", "Hola", "Hello");
    const last = topic("last", "Same title", "Buenas", "Hello");
    for (const group of [discarded, first, last]) group.words = [{ id: fixtureId(`${group.id}-family`), title: "Words", items: [word("agua", "water", "water"), word("pan", "bread", "bread")] }];
    const input = {
      name: "Selected", lang: "es", groups: [discarded, first, last], selectedIndexes: [2, 1],
    };
    const original = structuredClone(input);
    const deck = await commitPhrasebook(input, { store });
    const groups = await store.groups.where("deckId").equals(deck.id).sortBy("position");
    const entries = await getCards(deck.id, store);
    expect(input).toEqual(original);
    expect(groups.map((group) => group.title)).toEqual(["Same title", "Same title"]);
    expect(entries.filter((entry) => entry.occurrence?.section === "thingsToSay")
      .map((entry) => [entry.card.text, entry.occurrence.groupId]))
      .toEqual([["Hola", groups[0].id]]);
    expect(entries.filter((entry) => entry.wordPlacement)
      .map((entry) => [entry.card.text, entry.wordPlacement.groupId]))
      .toEqual([["agua", groups[0].id], ["pan", groups[0].id], ["agua", groups[1].id], ["pan", groups[1].id]]);
    expect(entries.filter((entry) => entry.occurrence?.groupId === groups[1].id)
      .map((entry) => entry.occurrence.section)).toEqual(["likelyExchanges", "likelyExchanges", "exampleConversation", "exampleConversation"]);
    expect((await store.cards.toArray()).some((row) => ["Buenos días", "Buenas"].includes(row.content.text))).toBe(false);
  });

  it("uses exact English essentials only, preserving within-topic repeats and every dialogue line", async () => {
    const first = topic("first");
    first.thingsToSay.push(phrase("first-repeat", "Hola", "Hello"));
    first.likelyExchanges[0].lines[0].responses.push(phrase("another-response", "Hola", "Hello"));
    const last = topic("last", "Later", "Buenas", "Hello");
    last.thingsToSay.push(
      phrase("case", "Buenas tardes", "hello"),
      phrase("punctuation", "Saludos", "Hello!"),
      phrase("dialogue-match", "¿Cómo estás?", "How are you?"),
    );
    last.exampleConversation.push(phrase("last-repeat", "Hola", "Hello", { speaker: "you" }));
    const deck = await commitPhrasebook({
      name: "Essentials", lang: "es", groups: [first, last], selectedIndexes: [0, 1],
    }, { store });
    const entries = await getCards(deck.id, store);
    expect(entries.filter((entry) => entry.occurrence?.section === "thingsToSay")
      .map((entry) => entry.card.translation)).toEqual(["Hello", "Hello", "hello", "Hello!", "How are you?"]);
    expect(entries.filter((entry) => entry.occurrence?.section === "exampleConversation")
      .map((entry) => [entry.card, entry.occurrence.speaker]))
      .toEqual([first, last].flatMap((group) =>
        group.exampleConversation.map((line) => [line.card, line.speaker])));
  });

  it("keeps related forms, distinct senses and POS, and non-exact vocabulary variants", async () => {
    const first = topic("first");
    first.words = [{ id: fixtureId(`${first.id}-family`), title: "Words", items: [
      word("alergia", "allergy", "allergy"), word("alergia", "allergy", "allergy"),
      word("banco", "bank", "financial"),
    ] }];
    const last = topic("last");
    const allergic = word("alérgico", "allergic", "allergic");
    allergic.card.partOfSpeech = "adjective";
    const verb = word("banco", "bank", "financial");
    verb.card.partOfSpeech = "verb";
    last.words = [{ id: fixtureId(`${last.id}-family`), title: "Words", items: [
      word("alergia", "allergy", "allergy"),
      allergic,
      word("banco", "bench", "seat"),
      verb,
      word("alergia", "an allergy", "allergy"),
      word("Alergia", "allergy", "allergy"),
    ] }];
    const deck = await commitPhrasebook({
      name: "Vocabulary", lang: "es", groups: [first, last], selectedIndexes: [0, 1],
    }, { store });
    const groups = await store.groups.where("deckId").equals(deck.id).sortBy("position");
    const words = (await getCards(deck.id, store)).filter((entry) => entry.wordPlacement);
    expect(words.filter((entry) => entry.wordPlacement.groupId === groups[0].id)
      .map((entry) => entry.card.text)).toEqual(["alergia", "alergia", "banco"]);
    expect(words.filter((entry) => entry.wordPlacement.groupId === groups[1].id)
      .map((entry) => [entry.card.text, entry.card.partOfSpeech, entry.card.senseKey]))
      .toEqual([
        ["alergia", "noun", "allergy"],
        ["alérgico", "adjective", "allergic"], ["banco", "noun", "seat"],
        ["banco", "verb", "financial"], ["alergia", "noun", "allergy"], ["Alergia", "noun", "allergy"],
      ]);
    // Canonical identity sharing is unchanged even when exact placement identity differs.
    expect(new Set(words.filter((entry) => entry.card.text === "alergia").map((entry) => entry.cardId)).size).toBe(1);
  });

  it("retains repeated vocabulary provenance without dangling or misleading essential references", async () => {
    const first = topic("first", "First", "Hola", "Hello");
    const last = topic("last", "Last", "Buenas", "Hello");
    first.words = [{ id: fixtureId(`${first.id}-family`), title: "Words", items: [word("hola", "hello", "greeting", [evidence("Hola", "Hello", 0, 4, "first-essential")])] }];
    last.words = [{ id: fixtureId(`${last.id}-family`), title: "Words", items: [word("hola", "hello", "greeting", [
      evidence("Buenas", "Hello", 0, 6, "last-essential"),
      evidence("¿Cómo estás?", "How are you?", 1, 5, "last-you"),
      evidence("Buenas noches", "Good evening", 0, 6, "last-option"),
    ])] }];
    for (const group of [first, last]) group.words[0].items.push(word("saludo", "greeting", "greeting"));
    const deck = await commitPhrasebook({
      name: "Evidence", lang: "es", groups: [first, last], selectedIndexes: [0, 1],
    }, { store });
    const entries = await getCards(deck.id, store);
    const words = entries.filter((entry) => entry.wordPlacement);
    expect(words.map((entry) => entry.card.text)).toEqual(["hola", "saludo", "hola", "saludo"]);
    expect(words[0].sources).toHaveLength(4);
    expect(words[0].sources.find((source) => source.snapshot.text === "Buenas"))
      .toEqual(evidence("Buenas", "Hello", 0, 6));
    for (const source of words[0].sources.filter((source) => source.ref)) {
      const entry = entries.find((candidate) => candidate.key === source.ref.occurrenceId);
      expect(entry.cardId).toBe(source.ref.cardId);
      expect(source.snapshot).toEqual({
        lang: entry.card.lang, text: entry.card.text, translation: entry.card.translation,
      });
    }
    const memberships = await store.memberships.where("deckId").equals(deck.id).toArray();
    expect(new Set(memberships.map((row) => row.cardId))).toEqual(new Set(entries.map((entry) => entry.cardId)));
    expect((await store.cards.toArray()).some((row) => row.content.text === "Buenas")).toBe(false);
    await toggleCardStar(deck.id, { cardId: words[0].cardId }, store);
    expect((await getReviewCards(deck.id, store)).map((entry) => entry.cardId)).toEqual([words[0].cardId]);
    const backup = await exportAllData(store);
    await restoreAllData(backup, store);
    expect(await exportAllData(store)).toEqual(backup);
  });

  it("validates a duplicate selected essential's evidence before removing its placement", async () => {
    const first = topic("first");
    const last = topic("last");
    last.words = [{ id: fixtureId(`${last.id}-family`), title: "Words", items: [word("hola", "hello", "greeting", [evidence("Hola", "Wrong", 0, 4, "last-essential")])] }];
    last.words[0].items.push(word("saludo", "greeting", "greeting"));
    const before = await exportAllData(store);
    await expect(commitPhrasebook({
      name: "Invalid duplicate", lang: "es", groups: [first, last], selectedIndexes: [0, 1],
    }, { store })).rejects.toThrow();
    expect(await exportAllData(store)).toEqual(before);
  });

  it("persists authored topic metadata without fabricating generation settings", async () => {
    const input = suggestedBook("Suggestion");
    input.ability = "conversational";
    input.seedId = "seed-es";
    const deck = await commitPhrasebook(input, { store });
    expect(await store.groups.where("deckId").equals(deck.id).count()).toBe(1);
    expect(deck).toMatchObject({ ability: "conversational", seedId: "seed-es" });
    expect(deck).not.toHaveProperty("generation");
    const essential = (await getCards(deck.id, store)).find((entry) => entry.occurrence?.section === "thingsToSay");
    expect(essential.occurrence).not.toHaveProperty("speaker");
    expect(essential.occurrence).not.toHaveProperty("alternative");
  });

  it("rolls back every relationship when a write fails", async () => {
    await createBook("Existing", "Antes", "Before");
    const before = await exportAllData(store);
    store.memberships.hook("creating", () => {
      throw new Error("injected membership failure");
    });

    await expect(createBook("Failure", "Después", "After")).rejects.toThrow("injected");
    expect(await exportAllData(store)).toEqual(before);
  });

  it("aborts an in-flight transaction without leaving rows", async () => {
    const controller = new AbortController();
    store.cards.hook("creating", () => controller.abort());

    await expect(commitPhrasebook(suggestedBook("Abort"), {
      signal: controller.signal,
      store,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(await store.decks.count()).toBe(0);
    expect(await store.cards.count()).toBe(0);
    expect(await store.memberships.count()).toBe(0);
  });

  it("preserves hostile answer keys through commit and backup restore", async () => {
    const input = suggestedBook("Hostile context");
    input.generation = {seed:"dinner",ability:"basics",answers:JSON.parse('{"__proto__":"family","constructor":"friends"}')};
    const deck = await commitPhrasebook(input, {store});
    await restoreAllData(await exportAllData(store), store);
    expect((await store.decks.get(deck.id)).generation.answers).toEqual(input.generation.answers);
    expect(Object.hasOwn((await store.decks.get(deck.id)).generation.answers, "__proto__")).toBe(true);
  });

  it.each([
    ["non-UUID group id", (group) => { group.id = "invalid-group"; }],
    ["non-UUID phrase id", (group) => { group.thingsToSay[0].id = "invalid-phrase"; }],
    ["old phrases", (group) => { group.phrases = []; }],
    ["old featured ids", (group) => { group.featuredPhraseIds = []; }],
    ["missing essentials", (group) => { delete group.thingsToSay; }],
    ["empty essentials", (group) => { group.thingsToSay = []; }],
    ["too many essentials", (group) => { group.thingsToSay = Array.from({length:9}, (_, i) => phrase(`e-${i}`, "Hola", "Hello")); }],
    ["missing title", (group) => { delete group.title; }],
    ["missing dialogue", (group) => { delete group.exampleConversation; }],
    ["missing words", (group) => { delete group.words; }],
    ["wrong essential speaker", (group) => { group.thingsToSay[0].speaker = "you"; }],
    ["missing dialogue speaker", (group) => { delete group.exampleConversation[0].speaker; }],
    ["single speaker", (group) => { group.exampleConversation[1].speaker = "you"; }],
    ["invalid alternative", (group) => { group.exampleConversation[1].alternative = true; }],
    ["missing exchanges", (group) => { delete group.likelyExchanges; }],
    ["empty response turn", (group) => { group.likelyExchanges[0].lines[0].responses = []; }],
    ["duplicate exchange ID", (group) => { group.likelyExchanges[0].id = group.id; }],
    ["singleton family", (group) => { group.words = [{id:fixtureId("single"),title:"Single",items:[word("pan","bread","bread")]}]; }],
    ["duplicate section ID", (group) => { group.exampleConversation[0].id = group.thingsToSay[0].id; }],
    ["overflow vocab", (group) => { group.words = [{ id: fixtureId(`${group.id}-family`), title: "Words", items: Array.from({length:11}, () => word("pan", "bread", "bread")) }]; }],
    ["cross-topic evidence", (group) => {
      group.words = [{ id: fixtureId(`${group.id}-family`), title: "Words", items: [word("hola", "hello", "greeting", [evidence("Hola", "Hello", 0, 4, "kept-essential")])] }];
      group.words[0].items.push(word("saludo", "greeting", "greeting"));
    }],
    ["wrong snapshot meaning", (group) => {
      group.words = [{ id: fixtureId(`${group.id}-family`), title: "Words", items: [word("hola", "hello", "greeting", [evidence("Hola", "Wrong", 0, 4, group.thingsToSay[0].id)])] }];
      group.words[0].items.push(word("saludo", "greeting", "greeting"));
    }],
  ])("rejects %s even in an unselected topic before writing", async (_name, corrupt) => {
    const input = { name: "Strict topics", lang: "es", groups: [topic("kept"), topic("discarded")], selectedIndexes: [0] };
    corrupt(input.groups[1]);
    const before = await exportAllData(store);
    await expect(commitPhrasebook(input, { store })).rejects.toThrow();
    expect(await exportAllData(store)).toEqual(before);
  });

  it("retains independent essentials and equal-text meanings through reorder, reopen, and restore", async () => {
    const input = suggestedBook("Independent");
    input.groups[0].thingsToSay.push(phrase("essential-two", "Solo aquí", "Only here"));
    input.groups[0].exampleConversation[0] = phrase("reply", "Hola", "Hi", { speaker: "you" });
    const deck = await commitPhrasebook(input, { store });
    const entries = await getCards(deck.id, store);
    const essential = entries.find((entry) => entry.card.text === "Hola" && entry.occurrence.section === "thingsToSay");
    const dialogue = entries.find((entry) => entry.card.text === "Hola" && entry.occurrence.section === "exampleConversation");
    expect(essential.cardId).toBe(dialogue.cardId);
    const order = [entries[1].key, entries[0].key, ...entries.slice(2).map((entry) => entry.key)];
    await updateDeckEntryOrder(deck.id, order, store);
    store.close();
    await store.open();
    const reopened = await getCards(deck.id, store);
    expect(reopened.filter((entry) => entry.occurrence.section === "thingsToSay")
      .map((entry) => entry.card.translation)).toEqual(["Only here", "Hello"]);
    expect(reopened.find((entry) => entry.key === dialogue.key).card.translation).toBe("Hi");
    const fresh = createDb({ indexedDB: new IDBFactory(), IDBKeyRange });
    await restoreAllData(await exportAllData(store), fresh);
    expect(await getCards(deck.id, fresh)).toEqual(reopened);
    fresh.close();
  });
});

describe("identity, membership, and provenance lifecycle", () => {
  it("reuses a Word across books while stars remain deck-scoped and evidence remains historical", async () => {
    const deckA = await createBook("A", "Hola", "Hello");
    const deckB = await createBook("B", "Hola", "Hi");
    const candidateA = word("comer", "eat", "consume-food", [
      evidence("Hola", "Hello", 0, 4),
    ]);
    const candidateB = word("comer", "to eat", "consume-food", [
      evidence("Hola", "Hi", 0, 4),
    ]);

    const starredA = await toggleCardStar(deckA.id, candidateA, store);
    const starredB = await toggleCardStar(deckB.id, candidateB, store);
    expect(starredA.cardId).toBe(starredB.cardId);
    expect(await store.cards.where("type").equals("word").count()).toBe(1);
    expect((await getCards(deckA.id, store)).find((entry) => entry.card.type === "word").card.translation)
      .toBe("eat");

    await toggleCardStar(deckA.id, { cardId: starredA.cardId }, store);
    const membershipA = await store.memberships.get([deckA.id, starredA.cardId]);
    const membershipB = await store.memberships.get([deckB.id, starredA.cardId]);
    expect(membershipA.starredAt).toBeNull();
    expect(membershipB.starredAt).not.toBeNull();
    expect(await store.provenance.where("cardId").equals(starredA.cardId).count()).toBe(2);
  });

  it("serializes concurrent toggles without duplicates", async () => {
    const deck = await createBook("Concurrent");
    const candidate = word("agua", "water", "water");

    await Promise.all([
      toggleCardStar(deck.id, candidate, store),
      toggleCardStar(deck.id, candidate, store),
    ]);

    const wordRows = await store.cards.where("type").equals("word").toArray();
    expect(wordRows).toHaveLength(1);
    expect(await store.memberships.get([deck.id, wordRows[0].id])).toMatchObject({ starredAt: null });
  });

  it("rolls back a toggle failure after inserting the card", async () => {
    const deck = await createBook("Atomic star");
    const before = await exportAllData(store);
    store.memberships.hook("creating", () => {
      throw new Error("injected toggle failure");
    });

    await expect(toggleCardStar(deck.id, word("nuevo", "new", "new"), store))
      .rejects.toThrow("injected toggle failure");
    expect(await exportAllData(store)).toEqual(before);
  });

  it("imports strict Candidates, preserves existing stars, and uses the deckless provenance sentinel", async () => {
    const deck = await createBook("Import");
    const candidate = word("pan", "bread", "bread", [evidence("Pan", "Bread", 0, 3)]);
    const starred = await toggleCardStar(deck.id, candidate, store);
    await importCards([candidate], deck.id, store);
    expect((await store.memberships.get([deck.id, starred.cardId])).starredAt).not.toBeNull();

    const deckless = word("sal", "salt", "salt", [evidence("Sal", "Salt", 0, 3)]);
    await importCards([deckless], null, store);
    const salt = (await store.cards.toArray()).find((row) => row.content.text === "sal");
    expect(await store.memberships.where("cardId").equals(salt.id).count()).toBe(0);
    expect((await store.provenance.where("cardId").equals(salt.id).first()).deckId).toBe("");
  });

  it("rejects malformed common cards before either import or star can change the library", async () => {
    const deck = await createBook("Strict boundary");
    const before = await exportAllData(store);
    const valid = word("pan", "bread", "bread");
    for (const candidate of [
      null,
      {card:{...valid.card,type:"sentence"}},
      {card:{...valid.card,senseKey:undefined}},
      {card:{...valid.card,state:{starredAt:"2026-01-01T00:00:00.000Z"}}},
      {card:{...valid.card,reading:[["otro",null]]}},
      {card:{type:"chunk",lang:"es",text:"pan",translation:"bread",role:"noun",explanation:"Food."}},
    ]) {
      await expect(importCards([valid,candidate], deck.id, store)).rejects.toThrow();
      await expect(toggleCardStar(deck.id, candidate, store)).rejects.toThrow();
      expect(await exportAllData(store)).toEqual(before);
    }
  });
});

describe("joined entries and ordering", () => {
  it("returns each Phrase occurrence with its own translation and one Word/Chunk row", async () => {
    const deck = await createBook("Joined", "Hola", "Hello");
    await importCards([
      { card: { type: "phrase", lang: "es", text: "Hola", translation: "Hi again" } },
      word("hola", "hello", "greeting"),
      {
        card: {
          type: "chunk",
          lang: "es",
          text: "Hola",
          translation: "hello",
          role: "greeting",
          explanation: "A greeting",
          source: evidence("Hola amigo", "Hello friend", 0, 4),
        },
      },
    ], deck.id, store);

    const entries = await getCards(deck.id, store);
    expect(entries.filter((entry) => entry.card.type === "phrase" && entry.card.text === "Hola").map((entry) => entry.card.translation).sort())
      .toEqual(["Hello", "Hi again"]);
    expect(entries.filter((entry) => entry.card.type === "chunk")).toHaveLength(1);
    expect(entries.filter((entry) => entry.card.type === "word")).toHaveLength(1);
    expect(entries.every((entry) => entry.key !== entry.cardId || !entry.membership)).toBe(true);
  });

  it("prepends new group-less occurrences and persists repeated-occurrence reorder", async () => {
    const deck = await createBook("Order", "Uno", "One");
    await importCards([
      { card: { type: "phrase", lang: "es", text: "Dos", translation: "Two" } },
      { card: { type: "phrase", lang: "es", text: "Dos", translation: "Second two" } },
    ], deck.id, store);
    await importCards([
      { card: { type: "phrase", lang: "es", text: "Tres", translation: "Three" } },
    ], deck.id, store);

    const allEntries = await getCards(deck.id, store);
    const before = allEntries.filter((entry) => entry.occurrence && !entry.occurrence.groupId);
    expect(before.map((entry) => entry.card.translation)).toEqual(["Three", "Two", "Second two"]);
    const reversedKeys = before.map((entry) => entry.key).reverse();
    const groupedKeys = allEntries.filter((entry) => entry.occurrence?.groupId).map((entry) => entry.key);
    await updateDeckEntryOrder(deck.id, [...reversedKeys, ...groupedKeys], store);
    expect((await getCards(deck.id, store)).filter((entry) => !entry.occurrence?.groupId)
      .map((entry) => entry.key)).toEqual(reversedKeys);

    const backup = await exportAllData(store);
    const restored = createDb({ indexedDB: new IDBFactory(), IDBKeyRange });
    await restored.open();
    await restoreAllData(backup, restored);
    expect((await getCards(deck.id, restored)).filter((entry) => !entry.occurrence?.groupId)
      .map((entry) => entry.key)).toEqual(reversedKeys);
  });

  it("keeps reorder inside an exchange turn or word family and preserves all choices", async () => {
    const first = topic("first");
    first.likelyExchanges[0].lines[0].responses.push(phrase("second-option", "Buenos días", "Good morning"));
    first.words = [
      {id:fixtureId("food"),title:"Words",items:[word("agua","water","water"),word("pan","bread","bread")]},
      {id:fixtureId("seasoning"),title:"Words",items:[word("sal","salt","salt"),word("pimienta","pepper","pepper")]},
    ];
    const deck = await commitPhrasebook({name:"Ordering",lang:"es",groups:[first],selectedIndexes:[0]}, {store});
    const entries = await getCards(deck.id, store);
    const options = entries.filter((entry) => entry.occurrence?.turnIndex === 0);
    const words = entries.filter((entry) => entry.wordPlacement);
    const replacements = new Map([
      [options[0].key, options[1].key], [options[1].key, options[0].key],
      [words[0].key, words[1].key], [words[1].key, words[0].key],
    ]);
    await updateDeckEntryOrder(deck.id, entries.map((entry) => replacements.get(entry.key) ?? entry.key), store);
    const reordered = await getCards(deck.id, store);
    expect(reordered.filter((entry) => entry.occurrence?.turnIndex === 0).map((entry) => entry.card.translation))
      .toEqual(["Good morning", "Good evening"]);
    expect(reordered.filter((entry) => entry.wordPlacement).map((entry) => entry.card.text))
      .toEqual(["pan", "agua", "sal", "pimienta"]);
    const before = await exportAllData(store);
    const crossBoundary = async (left, right) => {
      const keys = reordered.map((entry) => entry.key);
      const a = keys.indexOf(left.key), b = keys.indexOf(right.key);
      [keys[a], keys[b]] = [keys[b], keys[a]];
      await expect(updateDeckEntryOrder(deck.id, keys, store)).rejects.toThrow();
    };
    await crossBoundary(options[0], reordered.find((entry) => entry.occurrence?.turnIndex === 1));
    await crossBoundary(words[0], words[2]);
    await crossBoundary(options[0], reordered.find((entry) => entry.occurrence?.section === "exampleConversation"));
    expect(await exportAllData(store)).toEqual(before);
    await restoreAllData(before, store);
    expect(await getCards(deck.id, store)).toEqual(reordered);
  });

  it("requires the complete exact entry key list when reordering", async () => {
    const deck = await createBook("Exact order");
    const [entry] = await getCards(deck.id, store);
    await expect(updateDeckEntryOrder(deck.id, [], store)).rejects.toThrow("every current entry");
    await expect(updateDeckEntryOrder(deck.id, [entry.key, entry.key], store)).rejects.toThrow("duplicates");
  });

  it("returns one ordered review entry per starred membership", async () => {
    const deck = await createBook("Review", "Hola", "Hello");
    await importCards([
      { card: { type: "phrase", lang: "es", text: "Hola", translation: "Another hello" } },
    ], deck.id, store);
    const phraseRecord = await store.cards.filter((row) => row.content.text === "Hola").first();
    await toggleCardStar(deck.id, { cardId: phraseRecord.id }, store);

    const review = await getReviewCards(deck.id, store);
    expect(review).toHaveLength(1);
    expect(review[0].card.translation).toBe("Another hello");
    expect(applyCardOrder(review, "reverse")).toEqual(review);
  });
});

describe("deletion", () => {
  it("removes relationships transactionally without deleting reusable or historical data", async () => {
    const deckA = await createBook("Delete A");
    const deckB = await createBook("Delete B");
    const candidate = word("agua", "water", "water", [evidence("Agua", "Water", 0, 4)]);
    const { cardId } = await toggleCardStar(deckA.id, candidate, store);
    await toggleCardStar(deckB.id, candidate, store);

    await removeCardFromDeck(cardId, deckA.id, store);
    expect(await store.cards.get(cardId)).toBeTruthy();
    expect(await store.memberships.get([deckA.id, cardId])).toBeUndefined();
    expect(await store.memberships.get([deckB.id, cardId])).toBeTruthy();

    await deleteDeck(deckB.id, store);
    expect(await store.cards.get(cardId)).toBeTruthy();
    expect(await store.provenance.where("cardId").equals(cardId).count()).toBe(2);
    expect((await getCardsByLang("es", store)).some((entry) => entry.cardId === cardId)).toBe(true);
  });

  it("removes related Word placements and closes position gaps without deleting other topics or canonical data", async () => {
    const a = topic("a");
    const b = topic("b");
    a.words = [{ id: fixtureId(`${a.id}-family`), title: "Words", items: [word("agua", "water", "water"), word("pan", "bread", "bread")] }];
    b.words = [{ id: fixtureId(`${b.id}-family`), title: "Words", items: [word("agua", "water", "water"), word("sal", "salt", "salt")] }];
    const deck = await commitPhrasebook({name:"Removal",lang:"es",groups:[a,b],selectedIndexes:[0,1]}, {store});
    const other = await commitPhrasebook({name:"Other",lang:"es",groups:[a],selectedIndexes:[0]}, {store});
    const water = (await getCards(deck.id, store)).find((entry) => entry.card.type === "word" && entry.card.text === "agua");
    await removeCardFromDeck(water.cardId, deck.id, store);
    expect((await store.topicWords.where("deckId").equals(deck.id).toArray()).map((row) => row.position))
      .toEqual([0, 0]);
    expect(await store.topicWords.where("deckId").equals(other.id).count()).toBe(2);
    expect(await store.cards.get(water.cardId)).toBeDefined();
    await restoreAllData(await exportAllData(store), store);
    const surviving = await store.cards.count();
    await deleteDeck(other.id, store);
    expect(await store.topicWords.where("deckId").equals(other.id).count()).toBe(0);
    expect(await store.cards.count()).toBe(surviving);
    await restoreAllData(await exportAllData(store), store);
  });
  it("compacts options without moving turns and retains empty group metadata after all cards are removed", async () => {
    const group = topic("emptyable");
    group.likelyExchanges[0].lines[0].responses.push(phrase("extra-choice", "Adiós", "Goodbye"));
    group.words = [{id:fixtureId("emptyable-family"),title:"Food",items:[word("pan","bread","bread"),word("sal","salt","salt")]}];
    const deck = await commitPhrasebook({name:"Removal",lang:"es",groups:[group],selectedIndexes:[0]}, {store});
    const metadata = await store.groups.where("deckId").equals(deck.id).toArray();
    const entries = await getCards(deck.id, store);
    const removed = entries.find((entry) => entry.occurrence?.turnIndex === 0);
    await removeCardFromDeck(removed.cardId, deck.id, store);
    const surviving = await getCards(deck.id, store);
    expect(surviving.filter((entry) => entry.occurrence?.section === "likelyExchanges")
      .map((entry) => [entry.card.translation, entry.occurrence.turnIndex, entry.occurrence.position]))
      .toEqual([["Goodbye",0,0],["Likewise",1,0]]);
    await restoreAllData(await exportAllData(store), store);
    for (const cardId of new Set(surviving.map((entry) => entry.cardId))) {
      await removeCardFromDeck(cardId, deck.id, store);
    }
    expect(await getCards(deck.id, store)).toEqual([]);
    expect(await store.groups.where("deckId").equals(deck.id).toArray()).toEqual(metadata);
    const backup = await exportAllData(store);
    await restoreAllData(backup, store);
    expect(await exportAllData(store)).toEqual(backup);
  });
});

describe("backup validation and atomic restore", () => {
  async function populatedBackup() {
    const deck = await commitPhrasebook({
      name: "Backup",
      lang: "es",
      generation: { seed: "trip", ability: "none", answers: {} },
      groups: [{
        id: fixtureId("backup-group"),
        title: "Conversation",
        thingsToSay: [phrase("backup-phrase", "Hola", "Hello")],
        likelyExchanges: topic("backup-exchanges").likelyExchanges,
        exampleConversation: topic("backup-dialogue").exampleConversation,
        words: [{id:fixtureId("backup-family"),title:"Greetings",items:[
          word("hola", "hello", "greeting", [evidence("Hola", "Hello", 0, 4, "backup-phrase")]),
          word("saludo", "greeting", "greeting"),
        ]}],
      }],
      selectedIndexes: [0],
    }, { store });
    const wordEntry = (await getCards(deck.id, store)).find((entry) => entry.card.type === "word");
    await toggleCardStar(deck.id, { cardId: wordEntry.cardId }, store);
    return exportAllData(store);
  }

  it("round-trips every table, occurrence translation/order, stars, and snapshots", async () => {
    const backup = await populatedBackup();
    const fresh = createDb({ indexedDB: new IDBFactory(), IDBKeyRange });
    await fresh.open();
    await restoreAllData(backup, fresh);
    expect(await exportAllData(fresh)).toEqual(backup);
  });

  it("preserves Ukrainian cards and the existing library across a backup round trip", async () => {
    const existing = await createBook("Existing Spanish");
    const existingEntries = await getCards(existing.id, store);
    const deck = await commitPhrasebook({
      name: "At the café",
      lang: "uk",
      generation: { seed: "café", ability: "basics", answers: {} },
      groups: [{
        id: fixtureId("cafe"),
        title: "Ordering",
        thingsToSay: [{
          id: fixtureId("essential"),
          card: { type: "phrase", lang: "uk", text: "Без цукру.", translation: "Without sugar." },
        }],
        likelyExchanges: [{id:fixtureId("uk-exchange"),title:"Ordering",lines:[
          {speaker:"you",responses:[{id:fixtureId("uk-option"),card:{type:"phrase",lang:"uk",text:"Дякую.",translation:"Thanks."}}]},
          {speaker:"partner",responses:[{id:fixtureId("uk-response"),card:{type:"phrase",lang:"uk",text:"Будь ласка.",translation:"You're welcome."}}]},
        ]}],
        exampleConversation: [{
          id: fixtureId("order"),
          card: { type: "phrase", lang: "uk", text: "Каву, будь ласка.", translation: "Coffee, please." },
          speaker: "you",
        }, {
          id: fixtureId("reply"),
          card: { type: "phrase", lang: "uk", text: "Звичайно.", translation: "Of course." },
          speaker: "partner",
        }],
        words: [{id:fixtureId("uk-family"),title:"Coffee",items:[{
          card: { type: "word", lang: "uk", text: "кава", translation: "coffee", partOfSpeech: "noun", senseKey: "coffee" },
        },{
          card: { type: "word", lang: "uk", text: "цукор", translation: "sugar", partOfSpeech: "noun", senseKey: "sugar" },
        }]}],
      }],
      selectedIndexes: [0],
    }, { store });
    const order = (await getCards(deck.id, store)).find((entry) => entry.occurrence?.section === "exampleConversation" && entry.occurrence.speaker === "you");
    await toggleCardStar(deck.id, { cardId: order.cardId }, store);
    const backup = await exportAllData(store);
    const fresh = createDb({ indexedDB: new IDBFactory(), IDBKeyRange });
    try {
      await restoreAllData(backup, fresh);
      expect(await exportAllData(fresh)).toEqual(backup);
      expect(await getCards(existing.id, fresh)).toEqual(existingEntries);
      expect(await fresh.decks.get(deck.id)).toMatchObject({ lang: "uk", generation: { ability: "basics" } });
      const restored = await getCards(deck.id, fresh);
      expect(restored.find((entry) => entry.cardId === order.cardId)).toMatchObject({
        card: { lang: "uk", text: "Каву, будь ласка.", translation: "Coffee, please." },
        occurrence: { section: "exampleConversation", speaker: "you", translation: "Coffee, please." },
      });
      expect(restored.find((entry) => entry.occurrence?.section === "exampleConversation" && entry.occurrence.speaker === "partner").card.text).toBe("Звичайно.");
      expect((await getReviewCards(deck.id, fresh)).map((entry) => entry.cardId)).toEqual([order.cardId]);
    } finally {
      fresh.close();
    }
  });

  it("rejects old backups without changing the current library", async () => {
    const before = await populatedBackup();
    for (const schemaVersion of [2, 3]) {
      await expect(restoreAllData({ ...before, schemaVersion }, store)).rejects.toThrow(/schema version/);
    }
    expect(await exportAllData(store)).toEqual(before);
  });

  it.each([
    ["obsolete occurrence field", (backup) => { backup.occurrences[0].featured = true; }],
    ["missing section", (backup) => { delete backup.occurrences[0].section; }],
    ["essential speaker", (backup) => {
      backup.occurrences.find((row) => row.section === "thingsToSay").speaker = "you";
    }],
    ["standalone section", (backup) => { delete backup.occurrences[0].groupId; }],
    ["section position gap", (backup) => { backup.occurrences[0].position = 5; }],
    ["word position gap", (backup) => { backup.topicWords[0].position = 1; }],
    ["word wrong card type", (backup) => { backup.topicWords[0].cardId = backup.occurrences[0].cardId; }],
    ["word missing group", (backup) => { backup.topicWords[0].groupId = crypto.randomUUID(); }],
    ["word missing family", (backup) => { backup.topicWords[0].familyId = crypto.randomUUID(); }],
    ["missing family metadata", (backup) => { delete backup.groups[0].wordFamilies; }],
    ["missing exchange metadata", (backup) => { delete backup.groups[0].exchanges; }],
    ["duplicate metadata id", (backup) => { backup.groups[0].wordFamilies[0].id = backup.groups[0].exchanges[0].id; }],
    ["exchange metadata position gap", (backup) => { backup.groups[0].exchanges[0].position = 1; }],
    ["exchange ownership", (backup) => {
      backup.occurrences.find((row) => row.section === "likelyExchanges").exchangeId = crypto.randomUUID();
    }],
    ["missing turn", (backup) => { delete backup.occurrences.find((row) => row.section === "likelyExchanges").turnIndex; }],
    ["exchange turn out of range", (backup) => { backup.occurrences.find((row) => row.section === "likelyExchanges").turnIndex = 4; }],
    ["old alternative field", (backup) => { backup.occurrences.find((row) => row.section === "exampleConversation").alternative = true; }],
    ["word missing membership", (backup) => {
      backup.memberships = backup.memberships.filter((row) => row.cardId !== backup.topicWords[0].cardId);
    }],
    ["duplicate placement", (backup) => { backup.topicWords.push({...backup.topicWords[0]}); }],
    ["missing topicWords", (backup) => { delete backup.topicWords; }],
    ["Phrase membership without an occurrence", (backup) => {
      backup.memberships.find((row) => backup.cards.find((card) =>
        card.id === row.cardId && card.type === "phrase")).starredAt = "2026-01-01T00:00:00.000Z";
      backup.occurrences = [];
    }],
    ["group whose deck is missing", (backup) => {
      backup.groups[0].deckId = "00000000-0000-4000-8000-000000000001";
    }],
    ["provenance language mismatch", (backup) => {
      backup.provenance[0].source.snapshot.lang = "zh";
    }],
  ])("rejects %s before clearing existing data", async (_name, corrupt) => {
    const before = await populatedBackup();
    const malformed = structuredClone(before);
    corrupt(malformed);
    await expect(restoreAllData(malformed, store)).rejects.toThrow();
    expect(await exportAllData(store)).toEqual(before);
  });

  it("rolls back clears and inserts when restore writing fails", async () => {
    const before = await populatedBackup();
    const replacement = structuredClone(before);
    replacement.decks[0].name = "Replacement";
    store.cards.hook("creating", () => {
      throw new Error("injected restore failure");
    });

    await expect(restoreAllData(replacement, store)).rejects.toThrow("injected restore failure");
    expect(await exportAllData(store)).toEqual(before);
  });
});

describe("v4 namespace isolation and preferences", () => {
  it("opens an empty new library while leaving old databases and preferences untouched", async () => {
    const indexedDB = new IDBFactory();
    const oldStores = [];
    for (const name of ["loudmouth", "loudmouth-card-v2", "loudmouth-topic-v3"]) {
      const old = new Dexie(name, { indexedDB, IDBKeyRange });
      old.version(1).stores({ cards: "id" });
      await old.open();
      await old.cards.add({ id: "legacy" });
      oldStores.push(old);
    }
    localStorage.setItem("loudmouth.lastDeckId", "old");
    localStorage.setItem("loudmouth-card-v2.lastDeckId", "v2-old");
    localStorage.setItem("loudmouth-topic-v3.lastDeckId", "v3-old");
    sessionStorage.setItem("loudmouth.phrase-breakdown.v2:item", "old-cache");
    const target = createDb({ indexedDB, IDBKeyRange });
    await initializeLibrary(target);
    expect(await target.cards.count()).toBe(0);
    expect(getLastDeckId()).toBeNull();
    for (const old of oldStores) {
      expect(await old.cards.get("legacy")).toEqual({ id: "legacy" });
      old.close();
    }
    expect(localStorage.getItem("loudmouth.lastDeckId")).toBe("old");
    expect(localStorage.getItem("loudmouth-card-v2.lastDeckId")).toBe("v2-old");
    expect(localStorage.getItem("loudmouth-topic-v3.lastDeckId")).toBe("v3-old");
    expect(sessionStorage.getItem("loudmouth.phrase-breakdown.v2:item")).toBe("old-cache");
    target.close();
  });

  it("is safe across concurrent and repeated initialization without erasing new data", async () => {
    const indexedDB = new IDBFactory();
    const first = createDb({ indexedDB, IDBKeyRange });
    const second = createDb({ indexedDB, IDBKeyRange });
    setLastDeckId("keep-deck");
    setLastAbility("es", "basics");

    await Promise.all([initializeLibrary(first), initializeLibrary(second)]);
    await createBook("Persistent", "Hola", "Hello", first);
    await initializeLibrary(first);

    expect(await first.decks.count()).toBe(1);
    expect(getLastDeckId()).toBe("keep-deck");
    expect(getLastAbility("es")).toBe("basics");
  });

  it("opens IndexedDB even when browser storage getters are disabled", async () => {
    const local = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const session = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    try {
      for (const key of ["localStorage", "sessionStorage"]) {
        Object.defineProperty(globalThis, key, {configurable:true,get(){throw new DOMException("Disabled", "SecurityError");}});
      }
      setLastCreationLanguage("ja");
      expect(getLastCreationLanguage()).toBeUndefined();
      const target = createDb({indexedDB:new IDBFactory(), IDBKeyRange});
      await initializeLibrary(target);
      const deck = await createBook("Storage disabled", "Hola", "Hello", target);
      expect((await getCards(deck.id, target))[0].card.translation).toBe("Hello");
      target.close();
    } finally {
      if (local) Object.defineProperty(globalThis, "localStorage", local);
      else delete globalThis.localStorage;
      if (session) Object.defineProperty(globalThis, "sessionStorage", session);
      else delete globalThis.sessionStorage;
    }
  });

  it("uses only the v4 preference namespace and ignores invalid values", () => {
    localStorage.setItem("loudmouth-topic-v3.languageAbility.es", "conversational");
    expect(getLastAbility("es")).toBeUndefined();
    expect(getLastCreationLanguage()).toBeUndefined();
    setLastCreationLanguage("ja");
    expect(getLastCreationLanguage()).toBe("ja");
    setLastCreationLanguage("unsupported");
    expect(getLastCreationLanguage()).toBe("ja");
    localStorage.setItem(CREATION_LANGUAGE_KEY, "unsupported");
    expect(getLastCreationLanguage()).toBeUndefined();
    setLastAbility("es", "conversational");
    expect(localStorage.getItem(`${LANGUAGE_ABILITY_PREFIX}es`)).toBe("conversational");
    expect(getLastAbility("es")).toBe("conversational");
    setLastAbility("es", "invalid");
    expect(getLastAbility("es")).toBe("conversational");
    setLastDeckId("deck-id");
    expect(getLastDeckId()).toBe("deck-id");
    setLastDeckId(null);
    expect(getLastDeckId()).toBeNull();
  });
});

describe("durable illustration ownership", () => {
  async function illustratedBook(state = "pending") {
    const input = suggestedBook("Illustrated");
    input.illustration = {
      requestId: crypto.randomUUID(), prompt: "A loose watercolor still life.", state,
      ...(state === "ready" ? {image} : {}),
    };
    return commitPhrasebook(input, {store});
  }

  it("stores ready bytes across reopen and backup restore and refuses stale ownership or state regression", async () => {
    const deck = await illustratedBook();
    const pending = deck.illustration;
    const ready = {...pending, state:"ready", image};
    expect(await setDeckIllustration(deck.id, "superseded", {...ready,requestId:"superseded"}, store)).toBe(false);
    expect(await setDeckIllustration(deck.id, pending.requestId, {...ready,prompt:"Another scene"}, store)).toBe(false);
    expect(await setDeckIllustration(deck.id, pending.requestId, ready, store)).toBe(true);
    expect(await setDeckIllustration(deck.id, pending.requestId, pending, store)).toBe(false);
    expect(await setDeckIllustration(deck.id, pending.requestId, {...pending,state:"failed"}, store)).toBe(false);
    store.close();
    await initializeLibrary(store);
    expect((await store.decks.get(deck.id)).illustration).toEqual(ready);
    const backup = await exportAllData(store);
    const fresh = createDb({indexedDB:new IDBFactory(),IDBKeyRange});
    await restoreAllData(backup, fresh);
    expect((await fresh.decks.get(deck.id)).illustration).toEqual(ready);
    fresh.close();
  });

  it("does not recreate a deleted deck or overwrite a replacement request", async () => {
    const deck = await illustratedBook();
    const old = deck.illustration;
    const replacement = {...old,requestId:crypto.randomUUID(),prompt:"A new watercolor scene."};
    await store.decks.update(deck.id,{illustration:replacement});
    expect(await setDeckIllustration(deck.id,old.requestId,{...old,state:"ready",image},store)).toBe(false);
    expect((await store.decks.get(deck.id)).illustration).toEqual(replacement);
    await deleteDeck(deck.id,store);
    expect(await setDeckIllustration(deck.id,replacement.requestId,{...replacement,state:"ready",image},store)).toBe(false);
    expect(await store.decks.get(deck.id)).toBeUndefined();
  });

  it("serializes ready and failed completions without downgrading ready art", async () => {
    const deck = await illustratedBook();
    const pending = deck.illustration;
    await Promise.all([
      setDeckIllustration(deck.id,pending.requestId,{...pending,state:"ready",image},store),
      setDeckIllustration(deck.id,pending.requestId,{...pending,state:"failed"},store),
    ]);
    expect((await store.decks.get(deck.id)).illustration).toEqual({...pending,state:"ready",image});
  });

  it("marks interrupted pending art failed at startup while preserving ready art and text", async () => {
    const pending = await illustratedBook();
    const ready = await illustratedBook("ready");
    const before = await getCards(pending.id,store);
    store.close();
    await initializeLibrary(store);
    expect((await store.decks.get(pending.id)).illustration).toEqual({...pending.illustration,state:"failed"});
    expect((await store.decks.get(ready.id)).illustration).toEqual(ready.illustration);
    expect(await getCards(pending.id,store)).toEqual(before);
  });

  it.each([
    ["missing image", (illustration) => { delete illustration.image; }],
    ["invalid type", (illustration) => { illustration.image.mediaType = "image/jpeg"; }],
    ["remote URL", (illustration) => { illustration.image.dataUrl = "https://example.com/art.png"; }],
    ["invalid dimensions", (illustration) => { illustration.image.width = 0; }],
    ["wrong aspect ratio", (illustration) => { illustration.image.width = 9; }],
    ["excess pixels", (illustration) => { illustration.image.width = 16000; illustration.image.height = 9000; }],
    ["excess bytes", (illustration) => { illustration.image.dataUrl = `data:image/png;base64,${"A".repeat(8*1024*1024+4)}`; }],
    ["blank prompt", (illustration) => { illustration.prompt = " "; }],
    ["unbounded prompt", (illustration) => { illustration.prompt = "a".repeat(2001); }],
    ["image on failed state", (illustration) => { illustration.state = "failed"; }],
  ])("rejects %s before commit/update/restore mutation", async (_name, corrupt) => {
    const deck = await illustratedBook();
    const invalid = {...deck.illustration,state:"ready",image:{...image}};
    corrupt(invalid);
    const before = await exportAllData(store);
    await expect(commitPhrasebook({...suggestedBook("Invalid art"),illustration:invalid},{store})).rejects.toThrow();
    await expect(setDeckIllustration(deck.id,deck.illustration.requestId,invalid,store)).rejects.toThrow();
    const backup = structuredClone(before);
    backup.decks[0].illustration = invalid;
    await expect(restoreAllData(backup,store)).rejects.toThrow();
    expect(await exportAllData(store)).toEqual(before);
  });
});
