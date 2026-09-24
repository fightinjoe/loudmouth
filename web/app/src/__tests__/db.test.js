// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import Dexie from "dexie";
import {
  STORAGE_RESET_BLOCKED_MESSAGE,
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
  toggleCardStar,
  updateCard,
  updateDeckEntryOrder,
} from "../js/db";
import {
  LANGUAGE_ABILITY_PREFIX,
  LAST_DECK_KEY,
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
    groups: [{
      id: `${name}-group`,
      phrases: [phrase(`${name}-phrase`, text, translation)],
      vocab: [],
    }],
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
  it("atomically commits selected duplicate-title groups, shared phrases, capped Words, and remapped evidence", async () => {
    const firstPhrase = phrase("draft-phrase-a", "Hola", "Hello", { speaker: "you" });
    const repeatedPhrase = phrase("draft-phrase-c", "Hola", "Hi there", {
      speaker: "partner",
      alternative: true,
    });
    const sharedFirst = evidence("Hola", "Hello", 0, 4, firstPhrase.id);
    const sharedSecond = evidence("Hola", "Hi there", 0, 4, repeatedPhrase.id);
    const input = {
      name: "Generated",
      lang: "es",
      generation: { seed: "dinner", ability: "basics", answers: { Audience: "friends" } },
      groups: [{
        id: "group-a",
        title: "Same title",
        phrases: [firstPhrase],
        vocab: [
          word("hola", "hello", "greeting", [sharedFirst]),
          ...Array.from({ length: 5 }, (_, index) =>
            word(`palabra-a-${index}`, `word a ${index}`, `word-a-${index}`)),
        ],
      }, {
        id: "group-b",
        title: "Discarded",
        phrases: [phrase("draft-phrase-b", "Adiós", "Goodbye", { speaker: "you" })],
        vocab: [word("adiós", "goodbye", "farewell")],
      }, {
        id: "group-c",
        title: "Same title",
        phrases: [repeatedPhrase],
        vocab: [
          word("hola", "hi", "greeting", [sharedSecond]),
          ...Array.from({ length: 5 }, (_, index) =>
            word(`palabra-c-${index}`, `word c ${index}`, `word-c-${index}`)),
        ],
      }],
      selectedIndexes: [0, 2],
    };

    const deck = await commitPhrasebook(input, { store });
    const [groups, cards, memberships, occurrences, provenance] = await Promise.all([
      store.groups.where("deckId").equals(deck.id).sortBy("position"),
      store.cards.toArray(),
      store.memberships.where("deckId").equals(deck.id).toArray(),
      store.occurrences.where("deckId").equals(deck.id).toArray(),
      store.provenance.where("deckId").equals(deck.id).toArray(),
    ]);

    expect(deck.generation).toEqual(input.generation);
    expect(groups.map((group) => group.title)).toEqual(["Same title", "Same title"]);
    expect(occurrences).toHaveLength(2);
    expect(new Set(occurrences.map((row) => row.cardId)).size).toBe(1);
    expect(occurrences.map((row) => row.translation).sort()).toEqual(["Hello", "Hi there"]);
    expect(occurrences.some((row) => row.alternative)).toBe(true);
    expect(cards.filter((row) => row.type === "word")).toHaveLength(10);
    expect(memberships).toHaveLength(11);
    expect(memberships.every((row) => row.starredAt === null)).toBe(true);
    expect(cards.some((row) => row.content.text === "Adiós")).toBe(false);

    const greeting = cards.find((row) => row.content.type === "word" && row.content.senseKey === "greeting");
    const greetingSources = provenance.filter((row) => row.cardId === greeting.id);
    expect(greetingSources).toHaveLength(2);
    expect(greetingSources.every((row) =>
      occurrences.some((occurrence) => occurrence.id === row.source.ref.occurrenceId
        && occurrence.cardId === row.source.ref.cardId))).toBe(true);
    expect(greetingSources.some((row) => row.source.ref.occurrenceId === "draft-phrase-a")).toBe(false);
  });

  it("commits suggested drafts without groups or speakers and does not apply the generated Word cap", async () => {
    const vocab = Array.from({ length: 27 }, (_, index) =>
      word(`sugerida-${index}`, `suggested ${index}`, `suggested-${index}`));
    const deck = await commitPhrasebook({
      name: "Suggestion",
      lang: "es",
      ability: "conversational",
      seedId: "seed-es",
      groups: [{
        id: "ungrouped",
        phrases: [phrase("local-phrase", "Buenas", "Hi")],
        vocab,
      }],
      selectedIndexes: [0],
    }, { store });

    expect(await store.groups.where("deckId").equals(deck.id).count()).toBe(0);
    expect(await store.occurrences.where("deckId").equals(deck.id).count()).toBe(1);
    expect((await getCards(deck.id, store)).filter((entry) => entry.card.type === "word")).toHaveLength(27);
    expect(deck).toMatchObject({ ability: "conversational", seedId: "seed-es" });
    expect(deck).not.toHaveProperty("generation");
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
    input.groups[0].title = "Conversation";
    input.groups[0].phrases[0].speaker = "you";
    input.generation = {seed:"dinner",ability:"basics",answers:JSON.parse('{"__proto__":"family","constructor":"friends"}')};
    const deck = await commitPhrasebook(input, {store});
    await restoreAllData(await exportAllData(store), store);
    expect((await store.decks.get(deck.id)).generation.answers).toEqual(input.generation.answers);
    expect(Object.hasOwn((await store.decks.get(deck.id)).generation.answers, "__proto__")).toBe(true);
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
    expect(entries.filter((entry) => entry.card.type === "phrase")).toHaveLength(2);
    expect(entries.filter((entry) => entry.card.type === "phrase").map((entry) => entry.card.translation).sort())
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

    const before = (await getCards(deck.id, store)).filter((entry) => entry.card.type === "phrase");
    expect(before.map((entry) => entry.card.translation)).toEqual(["Three", "Two", "Second two", "One"]);
    const reversedKeys = before.map((entry) => entry.key).reverse();
    const allEntries = await getCards(deck.id, store);
    await updateDeckEntryOrder(
      deck.id,
      [...reversedKeys, ...allEntries.filter((entry) => entry.card.type !== "phrase").map((entry) => entry.key)],
      store,
    );
    expect((await getCards(deck.id, store)).filter((entry) => entry.card.type === "phrase")
      .map((entry) => entry.key)).toEqual(reversedKeys);

    const backup = await exportAllData(store);
    const restored = createDb({ indexedDB: new IDBFactory(), IDBKeyRange });
    await restored.open();
    await restoreAllData(backup, restored);
    expect((await getCards(deck.id, restored)).filter((entry) => entry.card.type === "phrase")
      .map((entry) => entry.key)).toEqual(reversedKeys);
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
    const phraseRecord = await store.cards.where("type").equals("phrase").first();
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
        phrases: [phrase("backup-phrase", "Hola", "Hello", { speaker: "you" })],
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

  it("rejects the old schema version with the exact error and preserves the library", async () => {
    const before = await populatedBackup();
    await expect(restoreAllData({ ...before, schemaVersion: 1 }, store))
      .rejects.toThrow("Unsupported library schema version; expected 2.");
    expect(await exportAllData(store)).toEqual(before);
  });

  it.each([
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

describe("hard reset and v2 preferences", () => {
  it("deletes only the legacy database and app-owned legacy keys", async () => {
    const indexedDB = new IDBFactory();
    const legacy = new Dexie("loudmouth", { indexedDB, IDBKeyRange });
    legacy.version(7).stores({ cards: "id", decks: "id" });
    await legacy.open();
    await legacy.cards.add({ id: "legacy" });
    legacy.close();

    localStorage.setItem("loudmouth.lastDeckId", "old");
    localStorage.setItem(LAST_DECK_KEY, "new");
    localStorage.setItem("unrelated", "keep");
    sessionStorage.setItem("loudmouth.phrase-breakdown.v2:item", "old-cache");
    sessionStorage.setItem("unrelated", "keep");
    const target = createDb({ indexedDB, IDBKeyRange });
    await initializeLibrary(target);

    expect((await indexedDB.databases()).some((database) => database.name === "loudmouth")).toBe(false);
    expect(localStorage.getItem("loudmouth.lastDeckId")).toBeNull();
    expect(localStorage.getItem(LAST_DECK_KEY)).toBe("new");
    expect(localStorage.getItem("unrelated")).toBe("keep");
    expect(sessionStorage.getItem("loudmouth.phrase-breakdown.v2:item")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
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

  it("rejects a blocked reset with the required reload message and does not open v2", async () => {
    const indexedDB = new IDBFactory();
    const legacy = new Dexie("loudmouth", { indexedDB, IDBKeyRange });
    legacy.version(7).stores({ cards: "id", decks: "id" });
    legacy.on("versionchange", () => false);
    await legacy.open();
    const target = createDb({ indexedDB, IDBKeyRange });

    await expect(initializeLibrary(target)).rejects.toThrow(STORAGE_RESET_BLOCKED_MESSAGE);
    expect(target.isOpen()).toBe(false);
    legacy.close();
  });

  it("opens IndexedDB even when browser storage getters are disabled", async () => {
    const local = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const session = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    try {
      for (const key of ["localStorage", "sessionStorage"]) {
        Object.defineProperty(globalThis, key, {configurable:true,get(){throw new DOMException("Disabled", "SecurityError");}});
      }
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

  it("uses only the v2 preference namespace and ignores invalid values", () => {
    localStorage.setItem("loudmouth.languageAbility.es", "conversational");
    expect(getLastAbility("es")).toBeUndefined();
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
