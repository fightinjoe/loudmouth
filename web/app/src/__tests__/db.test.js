// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import Dexie from "dexie";
import {
  applyCardOrder,
  commitPhrasebook,
  createDb,
  deleteCard,
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
  updateCard,
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

function phrase(id, text, translation, extra = {}) {
  return {
    id,
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
    id, title,
    essentials: [phrase(`${id}-essential`, text, translation)],
    vocab: [],
    dialogue: [
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
    ...(occurrenceId ? { ref: { occurrenceId } } : {}),
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
  it("retains topic-local vocabulary and both source sections with duplicate titles and original index selection", async () => {
    const first = topic("a", "Same title");
    first.vocab = [
      word("hola", "hello", "greeting", [evidence("Hola", "Hello", 0, 4, "a-essential")]),
      ...Array.from({ length: 9 }, (_, index) => word(`palabra-a-${index}`, `word a ${index}`, `word-a-${index}`)),
    ];
    const last = topic("c", "Same title", "Hola", "Hi there");
    last.dialogue[0] = phrase("c-you", "Hola", "Hello again", { speaker: "you" });
    last.vocab = [
      word("hola", "hi", "greeting", [evidence("Hola", "Hello again", 0, 4, "c-you")]),
      ...Array.from({ length: 9 }, (_, index) => word(`palabra-c-${index}`, `word c ${index}`, `word-c-${index}`)),
    ];
    const input = {
      name: "Generated", lang: "es",
      generation: { seed: "dinner", ability: "basics", answers: { Audience: "friends" } },
      groups: [first, topic("b", "Discarded", "Adiós", "Goodbye"), last],
      selectedIndexes: [2, 0],
    };
    const deck = await commitPhrasebook(input, { store });
    const groups = await store.groups.where("deckId").equals(deck.id).sortBy("position");
    const entries = await getCards(deck.id, store);
    expect(groups.map((group) => group.title)).toEqual(["Same title", "Same title"]);
    expect(entries.filter((entry) => entry.occurrence?.section === "essentials")
      .map((entry) => [entry.card.translation, entry.occurrence.groupId]))
      .toEqual([["Hello", groups[0].id], ["Hi there", groups[1].id]]);
    expect(entries.filter((entry) => entry.wordPlacement)).toHaveLength(20);
    expect(await store.cards.where("type").equals("word").count()).toBe(19);
    expect(await store.memberships.count()).toBe(22);
    expect(entries.some((entry) => entry.card.text === "Adiós")).toBe(false);
    const repeated = entries.filter((entry) => entry.card.text === "Hola");
    expect(new Set(repeated.map((entry) => entry.cardId)).size).toBe(1);
    expect(new Set(repeated.map((entry) => entry.key)).size).toBe(3);
    expect(repeated.map((entry) => entry.card.translation)).toEqual(["Hello", "Hi there", "Hello again"]);
    const sharedWords = entries.filter((entry) => entry.card.type === "word" && entry.card.senseKey === "greeting");
    expect(sharedWords).toHaveLength(2);
    expect(sharedWords[0].cardId).toBe(sharedWords[1].cardId);
    expect(sharedWords[0].key).not.toBe(sharedWords[1].key);
    const sources = sharedWords[0].sources;
    expect(sources).toHaveLength(2);
    expect(sources.map((source) =>
      entries.find((entry) => entry.key === source.ref.occurrenceId)?.occurrence.section).sort())
      .toEqual(["dialogue", "essentials"]);
    expect(sources.every((source) =>
      entries.some((entry) => entry.key === source.ref.occurrenceId && entry.cardId === source.ref.cardId))).toBe(true);
    expect(entries.every((entry) => entry.membership.starredAt === null)).toBe(true);
    await toggleCardStar(deck.id, { cardId: sharedWords[0].cardId }, store);
    expect((await getCards(deck.id, store)).filter((entry) => entry.cardId === sharedWords[0].cardId)
      .every((entry) => entry.membership.starredAt !== null)).toBe(true);
    expect((await getReviewCards(deck.id, store)).map((entry) => entry.cardId)).toEqual([sharedWords[0].cardId]);
  });

  it("persists authored topic metadata without fabricating generation settings", async () => {
    const input = suggestedBook("Suggestion");
    input.ability = "conversational";
    input.seedId = "seed-es";
    const deck = await commitPhrasebook(input, { store });
    expect(await store.groups.where("deckId").equals(deck.id).count()).toBe(1);
    expect(deck).toMatchObject({ ability: "conversational", seedId: "seed-es" });
    expect(deck).not.toHaveProperty("generation");
    const essential = (await getCards(deck.id, store)).find((entry) => entry.occurrence?.section === "essentials");
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
    ["old phrases", (group) => { group.phrases = []; }],
    ["old featured ids", (group) => { group.featuredPhraseIds = []; }],
    ["missing essentials", (group) => { delete group.essentials; }],
    ["empty essentials", (group) => { group.essentials = []; }],
    ["too many essentials", (group) => { group.essentials = Array.from({length:9}, (_, i) => phrase(`e-${i}`, "Hola", "Hello")); }],
    ["missing title", (group) => { delete group.title; }],
    ["missing dialogue", (group) => { delete group.dialogue; }],
    ["missing vocab", (group) => { delete group.vocab; }],
    ["wrong essential speaker", (group) => { group.essentials[0].speaker = "you"; }],
    ["missing dialogue speaker", (group) => { delete group.dialogue[0].speaker; }],
    ["single speaker", (group) => { group.dialogue[1].speaker = "you"; }],
    ["invalid alternative", (group) => { group.dialogue[1].alternative = true; }],
    ["duplicate section ID", (group) => { group.dialogue[0].id = group.essentials[0].id; }],
    ["overflow vocab", (group) => { group.vocab = Array.from({length:11}, () => word("pan", "bread", "bread")); }],
    ["cross-topic evidence", (group) => {
      group.vocab = [word("hola", "hello", "greeting", [evidence("Hola", "Hello", 0, 4, "kept-essential")])];
    }],
    ["wrong snapshot meaning", (group) => {
      group.vocab = [word("hola", "hello", "greeting", [evidence("Hola", "Wrong", 0, 4, group.essentials[0].id)])];
    }],
  ])("rejects %s even in an unselected topic before writing", async (_name, corrupt) => {
    const input = { name: "Strict topics", lang: "es", groups: [topic("kept"), topic("discarded")], selectedIndexes: [0] };
    corrupt(input.groups[1]);
    const before = await exportAllData(store);
    await expect(commitPhrasebook(input, { store })).rejects.toThrow();
    expect(await exportAllData(store)).toEqual(before);
  });

  it("retains independent essentials and equal-text meanings through edit, reopen, and restore", async () => {
    const input = suggestedBook("Independent");
    input.groups[0].essentials.push(phrase("essential-two", "Solo aquí", "Only here"));
    input.groups[0].dialogue[0] = phrase("reply", "Hola", "Hi", { speaker: "you" });
    const deck = await commitPhrasebook(input, { store });
    const entries = await getCards(deck.id, store);
    const essential = entries.find((entry) => entry.card.text === "Hola" && entry.occurrence.section === "essentials");
    const dialogue = entries.find((entry) => entry.card.text === "Hola" && entry.occurrence.section === "dialogue");
    expect(essential.cardId).toBe(dialogue.cardId);
    await updateCard(dialogue.cardId, { translation: "Hi there" }, { occurrenceId: dialogue.key, store });
    const order = [entries[1].key, entries[0].key, ...entries.slice(2).map((entry) => entry.key)];
    await updateDeckEntryOrder(deck.id, order, store);
    store.close();
    await store.open();
    const reopened = await getCards(deck.id, store);
    expect(reopened.filter((entry) => entry.occurrence.section === "essentials")
      .map((entry) => entry.card.translation)).toEqual(["Only here", "Hello"]);
    expect(reopened.find((entry) => entry.key === dialogue.key).card.translation).toBe("Hi there");
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

  it("reorders only a topic section or word bucket and derives dialogue alternatives from its new adjacency", async () => {
    const first = topic("first");
    first.essentials.push(phrase("first-extra-essential", "Gracias", "Thanks"));
    first.dialogue.splice(1, 0, phrase("alternative", "¿Todo bien?", "Everything all right?", { speaker: "you", alternative: true }));
    first.vocab = [word("agua", "water", "water"), word("pan", "bread", "bread")];
    const second = topic("second", "Conversation");
    second.vocab = [word("agua", "water", "water")];
    const deck = await commitPhrasebook({name:"Ordering",lang:"es",groups:[first,second],selectedIndexes:[0,1]}, {store});
    const entries = await getCards(deck.id, store);
    const groups = await store.groups.where("deckId").equals(deck.id).sortBy("position");
    const firstDialogue = entries.filter((entry) =>
      entry.occurrence?.groupId === groups[0].id && entry.occurrence.section === "dialogue");
    const firstWords = entries.filter((entry) => entry.wordPlacement?.groupId === groups[0].id);
    const keys = entries.map((entry) => entry.key);
    const reorderedDialogue = [firstDialogue[2], firstDialogue[0], firstDialogue[1]];
    const replacements = new Map([
      ...firstDialogue.map((entry, index) => [entry.key, reorderedDialogue[index].key]),
      [firstWords[0].key, firstWords[1].key], [firstWords[1].key, firstWords[0].key],
    ]);
    await updateDeckEntryOrder(deck.id, keys.map((key) => replacements.get(key) ?? key), store);
    const reordered = await getCards(deck.id, store);
    expect(reordered.filter((entry) => entry.occurrence?.groupId === groups[0].id && entry.occurrence.section === "dialogue")
      .map((entry) => [entry.occurrence.speaker, entry.occurrence.alternative]))
      .toEqual([["partner", undefined], ["you", undefined], ["you", true]]);
    expect(reordered.filter((entry) => entry.wordPlacement?.groupId === groups[0].id).map((entry) => entry.card.text))
      .toEqual(["pan", "agua"]);
    const before = await exportAllData(store);
    const crossSection = reordered.map((entry) => entry.key);
    [crossSection[0], crossSection[2]] = [crossSection[2], crossSection[0]];
    await expect(updateDeckEntryOrder(deck.id, crossSection, store)).rejects.toThrow(/topic and section/);
    const crossTopic = reordered.map((entry) => entry.key);
    const wordIndexes = reordered.map((entry, index) => entry.wordPlacement ? index : -1).filter((index) => index >= 0);
    [crossTopic[wordIndexes[0]], crossTopic[wordIndexes[2]]] = [crossTopic[wordIndexes[2]], crossTopic[wordIndexes[0]]];
    await expect(updateDeckEntryOrder(deck.id, crossTopic, store)).rejects.toThrow(/topic and section/);
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

describe("editing and deletion", () => {
  it("updates only the active Phrase occurrence translation", async () => {
    const deck = await createBook("Edit", "Hola", "Hello");
    await importCards([
      { card: { type: "phrase", lang: "es", text: "Hola", translation: "Hi" } },
    ], deck.id, store);
    const entries = (await getCards(deck.id, store)).filter((entry) => entry.card.type === "phrase");
    const active = entries[0];
    const other = entries[1];

    await updateCard(active.cardId, { translation: "Greetings" }, {
      occurrenceId: active.occurrence.id,
      store,
    });
    const reloaded = await getCards(deck.id, store);
    expect(reloaded.find((entry) => entry.key === active.key).card.translation).toBe("Greetings");
    expect(reloaded.find((entry) => entry.key === other.key).card.translation).toBe(other.card.translation);
  });

  it("rejects identity collisions and read-only identity/source fields", async () => {
    await importCards([
      word("uno", "one", "one"),
      { card: { type: "phrase", lang: "es", text: "Primera", translation: "First" } },
      { card: { type: "phrase", lang: "es", text: "Segunda", translation: "Second" } },
    ], null, store);
    const records = await store.cards.toArray();
    const one = records.find((row) => row.content.text === "uno");
    const first = records.find((row) => row.content.text === "Primera");
    const second = records.find((row) => row.content.text === "Segunda");
    await expect(updateCard(second.id, { text: first.content.text }, { store }))
      .rejects.toThrow("A card with this identity already exists.");
    await expect(updateCard(one.id, { partOfSpeech: "verb" }, { store }))
      .rejects.toThrow("partOfSpeech is not allowed");

    await importCards([{
      card: {
        type: "chunk",
        lang: "es",
        text: "Hola",
        translation: "hello",
        role: "greeting",
        explanation: "Greeting",
        source: evidence("Hola amigo", "Hello friend", 0, 4),
      },
    }], null, store);
    const chunk = (await store.cards.where("type").equals("chunk").first());
    await expect(updateCard(chunk.id, { text: "amigo" }, { store }))
      .rejects.toThrow("text is not allowed");
  });

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

    await deleteCard(cardId, store);
    expect(await store.cards.get(cardId)).toBeUndefined();
    expect(await store.provenance.where("cardId").equals(cardId).count()).toBe(0);
  });

  it("removes related Word placements and closes position gaps without deleting other topics or canonical data", async () => {
    const a = topic("a");
    const b = topic("b");
    a.vocab = [word("agua", "water", "water"), word("pan", "bread", "bread")];
    b.vocab = [word("agua", "water", "water"), word("sal", "salt", "salt")];
    const deck = await commitPhrasebook({name:"Removal",lang:"es",groups:[a,b],selectedIndexes:[0,1]}, {store});
    const other = await commitPhrasebook({name:"Other",lang:"es",groups:[a],selectedIndexes:[0]}, {store});
    const water = (await getCards(deck.id, store)).find((entry) => entry.card.type === "word" && entry.card.text === "agua");
    await removeCardFromDeck(water.cardId, deck.id, store);
    expect((await store.topicWords.where("deckId").equals(deck.id).toArray()).map((row) => row.position))
      .toEqual([0, 0]);
    expect(await store.topicWords.where("deckId").equals(other.id).count()).toBe(2);
    expect(await store.cards.get(water.cardId)).toBeDefined();
    await restoreAllData(await exportAllData(store), store);
    await deleteCard(water.cardId, store);
    expect(await store.topicWords.where("cardId").equals(water.cardId).count()).toBe(0);
    expect(await store.topicWords.where("deckId").equals(other.id).count()).toBe(1);
    const surviving = await store.cards.count();
    await deleteDeck(other.id, store);
    expect(await store.topicWords.where("deckId").equals(other.id).count()).toBe(0);
    expect(await store.cards.count()).toBe(surviving);
    await restoreAllData(await exportAllData(store), store);
  });
});

describe("backup validation and atomic restore", () => {
  async function populatedBackup() {
    const deck = await commitPhrasebook({
      name: "Backup",
      lang: "es",
      generation: { seed: "trip", ability: "none", answers: {} },
      groups: [{
        id: "backup-group",
        title: "Conversation",
        essentials: [phrase("backup-phrase", "Hola", "Hello")],
        dialogue: topic("backup-dialogue").dialogue,
        vocab: [word("hola", "hello", "greeting", [
          evidence("Hola", "Hello", 0, 4, "backup-phrase"),
        ])],
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

  it("preserves Ukrainian edits and the existing library across a backup round trip", async () => {
    const existing = await createBook("Existing Spanish");
    const existingEntries = await getCards(existing.id, store);
    const deck = await commitPhrasebook({
      name: "At the café",
      lang: "uk",
      generation: { seed: "café", ability: "basics", answers: {} },
      groups: [{
        id: "cafe",
        title: "Ordering",
        essentials: [{
          id: "essential",
          card: { type: "phrase", lang: "uk", text: "Без цукру.", translation: "Without sugar." },
        }],
        dialogue: [{
          id: "order",
          card: { type: "phrase", lang: "uk", text: "Каву, будь ласка.", translation: "Coffee, please." },
          speaker: "you",
        }, {
          id: "reply",
          card: { type: "phrase", lang: "uk", text: "Звичайно.", translation: "Of course." },
          speaker: "partner",
        }],
        vocab: [{
          card: { type: "word", lang: "uk", text: "кава", translation: "coffee", partOfSpeech: "noun", senseKey: "coffee" },
        }],
      }],
      selectedIndexes: [0],
    }, { store });
    const order = (await getCards(deck.id, store)).find((entry) => entry.occurrence?.speaker === "you");
    await updateCard(order.cardId, { text: "Чай, будь ласка.", translation: "Tea, please." }, {
      occurrenceId: order.occurrence.id,
      store,
    });
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
        card: { lang: "uk", text: "Чай, будь ласка.", translation: "Tea, please." },
        occurrence: { section: "dialogue", speaker: "you", translation: "Tea, please." },
      });
      expect(restored.find((entry) => entry.occurrence?.speaker === "partner").card.text).toBe("Звичайно.");
      expect((await getReviewCards(deck.id, fresh)).map((entry) => entry.cardId)).toEqual([order.cardId]);
    } finally {
      fresh.close();
    }
  });

  it("rejects old backups without changing the current library", async () => {
    const before = await populatedBackup();
    await expect(restoreAllData({ ...before, schemaVersion: 2 }, store)).rejects.toThrow(/schema version/);
    expect(await exportAllData(store)).toEqual(before);
  });

  it.each([
    ["obsolete occurrence field", (backup) => { backup.occurrences[0].featured = true; }],
    ["missing section", (backup) => { delete backup.occurrences[0].section; }],
    ["essential speaker", (backup) => {
      backup.occurrences.find((row) => row.section === "essentials").speaker = "you";
    }],
    ["standalone section", (backup) => { delete backup.occurrences[0].groupId; }],
    ["section position gap", (backup) => { backup.occurrences[0].position = 5; }],
    ["word position gap", (backup) => { backup.topicWords[0].position = 1; }],
    ["word wrong card type", (backup) => { backup.topicWords[0].cardId = backup.occurrences[0].cardId; }],
    ["word missing group", (backup) => { backup.topicWords[0].groupId = crypto.randomUUID(); }],
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

describe("v3 namespace isolation and preferences", () => {
  it("opens an empty new library while leaving both old databases and preferences untouched", async () => {
    const indexedDB = new IDBFactory();
    const oldStores = [];
    for (const name of ["loudmouth", "loudmouth-card-v2"]) {
      const old = new Dexie(name, { indexedDB, IDBKeyRange });
      old.version(1).stores({ cards: "id" });
      await old.open();
      await old.cards.add({ id: "legacy" });
      oldStores.push(old);
    }
    localStorage.setItem("loudmouth.lastDeckId", "old");
    localStorage.setItem("loudmouth-card-v2.lastDeckId", "v2-old");
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

  it("uses only the v3 preference namespace and ignores invalid values", () => {
    localStorage.setItem("loudmouth-card-v2.languageAbility.es", "conversational");
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
