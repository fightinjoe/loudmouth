// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardIdentity } from "@catchphrase/card-schema";
import {
  renderExplanations,
  renderReadyBody,
  renderSource,
} from "../components/phrase-breakdown";
import {
  breakdownCandidates,
  cardRequest,
  readCache,
  writeCache,
} from "../js/phrase-breakdown";
import { PHRASE_BREAKDOWN_CACHE_PREFIX } from "../js/preferences";
import { commitPhrasebook, db, deleteDeck, exportAllData, getCards, getGroups, toggleCardStar } from "../js/db";
import detailsPane from "../panes/details-pane";
import { createUIState, createHost } from "../js/uiState";
import { createDelegate } from "../js/delegate";
import contentPane from "../panes/content-pane";

vi.mock("../js/db", async (importOriginal) => {
  const actual = await importOriginal();
  const { IDBFactory, IDBKeyRange } = await import("fake-indexeddb");
  const store = actual.createDb({indexedDB:new IDBFactory(),IDBKeyRange});
  return {...actual,db:store,
    getCards:deckId=>actual.getCards(deckId,store),
    getGroups:deckId=>actual.getGroups(deckId,store),
    toggleCardStar:(deckId,target)=>actual.toggleCardStar(deckId,target,store),
  };
});

const api = vi.hoisted(() => ({
  getPhraseBreakdown: vi.fn(() => new Promise(() => {})),
}));

vi.mock("../js/phrasebook-api", () => ({
  getPhraseBreakdown: api.getPhraseBreakdown,
}));

const usage = {
  model: "test",
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  costUsd: null,
  durationMs: 1,
};

function root(html) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

function phraseEntry(snapshot, {
  cardId = "phrase-card",
  occurrenceId = "phrase-occurrence",
  deckId = "deck-a",
  groupId = "group-a",
  speaker = "partner",
} = {}) {
  return {
    key: occurrenceId,
    cardId,
    card: { type: "phrase", ...snapshot },
    occurrence: {
      id: occurrenceId,
      deckId,
      groupId,
      cardId,
      position: 0,
      translation: snapshot.translation,
      speaker,
    },
    sources: [],
  };
}

function wordCandidate(snapshot, {
  text = snapshot.text,
  translation = snapshot.translation,
  partOfSpeech = "adjective",
  senseKey = "high-temperature",
  span = { start: 0, end: snapshot.text.length },
  reading,
  ref,
} = {}) {
  return {
    card: {
      type: "word",
      lang: snapshot.lang,
      text,
      translation,
      partOfSpeech,
      senseKey,
      ...(reading ? { reading } : {}),
    },
    sources: [{ snapshot, ...(ref ? { ref } : {}), span }],
  };
}

function wordTargetBreakdown(snapshot, ref) {
  const word = wordCandidate(snapshot, { ref });
  return {
    schemaVersion: 2,
    chunks: [{
      start: 0,
      end: snapshot.text.length,
      text: snapshot.text,
      gloss: snapshot.translation,
      role: "adjective",
      explanation: "Describes the subject.",
      words: [word],
      target: { kind: "word", index: 0 },
    }],
    usage,
  };
}

function chunkTargetBreakdown(snapshot, explanation = "Adds the topic particle.", ref) {
  const word = wordCandidate(snapshot, {
    text: "肉",
    translation: "meat",
    partOfSpeech: "noun",
    senseKey: "animal-flesh-food",
    span: { start: 0, end: 1 },
    reading: [["肉", "にく"]],
    ref,
  });
  return {
    schemaVersion: 2,
    chunks: [{
      start: 0,
      end: snapshot.text.length,
      text: snapshot.text,
      gloss: "meat too",
      role: "topic phrase",
      explanation,
      words: [word],
      target: {
        kind: "chunk",
        card: {
          type: "chunk",
          lang: snapshot.lang,
          text: snapshot.text,
          translation: "meat too",
          source: { snapshot, ...(ref ? {ref} : {}), span: { start: 0, end: snapshot.text.length } },
          role: "topic phrase",
          explanation,
        },
      },
    }],
    usage,
  };
}

function readyState(entry, breakdown, { deck, targets = {} } = {}) {
  return {
    entry,
    ...(deck ? { deck } : {}),
    opener: document.createElement("button"),
    readingDisplay: "reading",
    showReadings: true,
    showEnglish: true,
    status: "ready",
    breakdown,
    regenerating: false,
    error: null,
    selectedIndex: 0,
    all: true,
    requestId: 1,
    targets,
  };
}

let disposeModal;
beforeEach(async () => {
  sessionStorage.clear();
  vi.stubGlobal("matchMedia", () => ({matches:true}));
  api.getPhraseBreakdown.mockReset();
  api.getPhraseBreakdown.mockImplementation(async ({source}) => source.snapshot.lang === "es"
    ? wordTargetBreakdown(source.snapshot,source.ref)
    : chunkTargetBreakdown(source.snapshot,undefined,source.ref));
  await db.open();
  await db.transaction("rw",db.tables,()=>Promise.all(db.tables.map(table=>table.clear())));
});
afterEach(() => {
  disposeModal?.();
  disposeModal = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function mountSavedPhrase(snapshot) {
  const deck = await commitPhrasebook({
    name:"Source context",lang:snapshot.lang,selectedIndexes:[0],
    groups:[{id:crypto.randomUUID(),title:"Conversation",phrases:[{
      id:crypto.randomUUID(),card:{type:"phrase",...snapshot},speaker:"you",
    }],vocab:[]}],
  },{store:db});
  const [entry] = await getCards(deck.id);
  document.body.innerHTML = `<main id="app"><div id="app-shell"><button id="source">Source</button></div>${detailsPane.render()}</main>`;
  const ui = createUIState({details:null,action:null,shell:{exposed:"foreground"},content:contentPane.initialState});
  ui.registerTransitions(contentPane.transitions);
  ui.registerTransitions(detailsPane.transitions);
  ui.transition("content/loaded",{deck,cards:[entry],groups:await getGroups(deck.id)});
  const stageEl = document.querySelector("#app");
  const layer = document.querySelector("#details-layer");
  disposeModal = detailsPane.bindEvents(layer,createHost({ui,stageEl,delegate:createDelegate(layer)}));
  const payload = {entry,deck,opener:document.querySelector("#source")};
  const before = await exportAllData(db);
  ui.transition("details/open",payload);
  await vi.waitFor(()=>expect(layer.querySelector(".details-target-star")?.disabled).toBe(false));
  return {ui,layer,payload,before,deck};
}

describe("phrase breakdown request and cache", () => {
  it("uses the exact active occurrence and only its saved phrasebook context", () => {
    const snapshot = {
      lang: "ja",
      text: "食べません",
      translation: "I do not eat.",
      reading: [["食", "た"], ["べません", null]],
      romanization: "tabemasen",
    };
    const entry = phraseEntry(snapshot);
    entry.card.translation = "Canonical translation";
    const deck = {
      id: "deck-a",
      name: "Dinner",
      lang: "ja",
      createdAt: "2026-01-01T00:00:00.000Z",
      mode: "study",
      order: "default",
      readingDisplay: "reading",
      generation: {
        seed: "dinner",
        ability: "basics",
        answers: { Audience: "family" },
      },
    };
    const group = { id: "group-a", deckId: "deck-a", title: "At the table", position: 0 };

    expect(cardRequest(entry, deck, group)).toEqual({
      schemaVersion: 2,
      source: {
        snapshot,
        ref: { cardId: "phrase-card", occurrenceId: "phrase-occurrence" },
      },
      context: {
        generation: deck.generation,
        groupTitle: "At the table",
        speaker: "partner",
      },
    });
    expect(cardRequest(entry, undefined, group)).not.toHaveProperty("context");
  });

  it("keys validated content by the exact request and removes invalid cache entries", () => {
    const snapshot = { lang: "es", text: "caluroso", translation: "hot" };
    const request = cardRequest(phraseEntry(snapshot));
    const response = wordTargetBreakdown(snapshot, request.source.ref);
    writeCache(request, response);
    expect(readCache(request)).toEqual(response);

    const edited = cardRequest(phraseEntry({ ...snapshot, translation: "warm" }));
    expect(readCache(edited)).toBeNull();

    const key = `${PHRASE_BREAKDOWN_CACHE_PREFIX}${JSON.stringify(request)}`;
    sessionStorage.setItem(key, JSON.stringify({ ...response, schemaVersion: 1 }));
    expect(readCache(request)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

});

describe("target-discriminated rendering", () => {
  it("renders one control for an equivalent Word and distinct Chunk and Word controls otherwise", () => {
    const spanish = { lang: "es", text: "caluroso", translation: "hot" };
    const spanishBreakdown = wordTargetBreakdown(spanish);
    const spanishWord = spanishBreakdown.chunks[0].words[0];
    const spanishState = readyState(
      phraseEntry(spanish),
      spanishBreakdown,
      {
        deck: { id: "deck-a" },
        targets: {
          [cardIdentity(spanishWord.card)]: {
            cardId: "word-card",
            starredAt: null,
            pending: false,
          },
        },
      },
    );
    const equivalent = root(renderExplanations(spanishState, spanishBreakdown.chunks));
    expect(equivalent.querySelectorAll(".details-target-star")).toHaveLength(1);
    expect(equivalent.querySelector(".details-target-star").dataset.targetKind).toBe("word");

    const japanese = {
      lang: "ja",
      text: "肉も",
      translation: "meat too",
      reading: [["肉", "にく"], ["も", null]],
    };
    const japaneseBreakdown = chunkTargetBreakdown(japanese);
    const locations = breakdownCandidates(japaneseBreakdown);
    const targets = Object.fromEntries(locations.map(({ identity }, index) => [
      identity,
      {
        cardId: `card-${index}`,
        starredAt: index === 0 ? "2026-01-01T00:00:00.000Z" : null,
        pending: false,
      },
    ]));
    const distinct = root(renderExplanations(
      readyState(phraseEntry(japanese), japaneseBreakdown, {
        deck: { id: "deck-a" },
        targets,
      }),
      japaneseBreakdown.chunks,
    ));
    expect([...distinct.querySelectorAll(".details-target-star")]
      .map((button) => button.dataset.targetKind)).toEqual(["chunk", "word"]);
    expect(distinct.querySelector('[data-target-kind="chunk"]').getAttribute("aria-pressed")).toBe("true");
  });

  it("shares resolved pending, star, and error state by identity across repeated controls", () => {
    const snapshot = { lang: "es", text: "caluroso", translation: "hot" };
    const response = wordTargetBreakdown(snapshot);
    response.chunks.push({
      ...response.chunks[0],
      start: 8,
      end: 16,
    });
    const candidate = response.chunks[0].words[0];
    const identity = cardIdentity(candidate.card);
    const state = readyState(phraseEntry(snapshot), response, {
      deck: { id: "deck-a" },
      targets: {
        [identity]: {
          cardId: "word-card",
          starredAt: "2026-01-01T00:00:00.000Z",
          pending: true,
          error: "Still saving",
        },
      },
    });
    const content = root(renderExplanations(state, response.chunks));
    const controls = [...content.querySelectorAll(".details-target-star")];
    expect(controls).toHaveLength(2);
    expect(controls.every((button) =>
      button.disabled && button.getAttribute("aria-pressed") === "true")).toBe(true);
    expect([...content.querySelectorAll(".details-target-error")]
      .map((element) => element.textContent)).toEqual(["Still saving", "Still saving"]);
  });

  it("keeps stars unavailable without a phrasebook and renders hostile teaching literally", () => {
    const attack = '<img src=x onerror="alert(1)">';
    const snapshot = { lang: "es", text: "caluroso", translation: attack };
    const response = wordTargetBreakdown(snapshot);
    response.chunks[0].role = attack;
    response.chunks[0].explanation = attack;
    const state = readyState(phraseEntry(snapshot), response);
    const content = root(
      renderSource(state)
      + renderReadyBody(state)
      + renderExplanations(state, response.chunks),
    );
    expect(content.querySelector("img, [onerror]")).toBeNull();
    expect(content.querySelector(".details-role").textContent).toBe(attack);
    expect(content.querySelector(".details-explanation p").textContent).toBe(attack);
    expect(content.querySelectorAll(".details-target-star")).toHaveLength(0);
    expect(content.querySelector(".details-save-unavailable").textContent)
      .toContain("Open a phrasebook");
  });

  it("keeps the same Chunk identity when regeneration changes explanation only", () => {
    const snapshot = {
      lang: "ja",
      text: "肉も",
      translation: "meat too",
      reading: [["肉", "にく"], ["も", null]],
    };
    const first = chunkTargetBreakdown(snapshot, "First explanation.");
    const regenerated = chunkTargetBreakdown(snapshot, "A clearer explanation.");
    expect(breakdownCandidates(first)[0].identity)
      .toBe(breakdownCandidates(regenerated)[0].identity);
  });
});

it("retains ready analysis when regeneration fails and keeps keyboard focus in the dialog", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.body.innerHTML = `<main id="app"><div id="app-shell"><button id="source">Source</button></div>${detailsPane.render()}</main>`;
  const initial = {
    details: null,
    action: null,
    shell: { exposed: "foreground" },
    content: {
      deckId: null,
      deck: null,
      cards: [],
      groups: [],
      browse: null,
      pageKey: null,
      editMode: false,
    },
  };
  const ui = createUIState(initial);
  ui.registerTransitions(detailsPane.transitions);
  const stageEl = document.querySelector("#app");
  const layer = document.querySelector("#details-layer");
  const cleanup = detailsPane.bindEvents(
    layer,
    createHost({ ui, stageEl, delegate: createDelegate(layer) }),
  );
  try {
    const snapshot = { lang: "es", text: "caluroso", translation: "hot" };
    ui.transition("details/open", {
      entry: phraseEntry(snapshot),
      opener: document.querySelector("#source"),
    });
    const requestId = ui.get("details").requestId;
    const breakdown = wordTargetBreakdown(snapshot);
    ui.transition("details/loaded", { requestId, breakdown });
    ui.transition("details/regenerate");
    const regenerationId = ui.get("details").requestId;
    ui.transition("details/failed", {
      requestId: regenerationId,
      error: "Provider unavailable",
    });
    expect(ui.get("details").status).toBe("ready");
    expect(ui.get("details").breakdown).toBe(breakdown);
    expect(layer.querySelector(".details-regenerate-error").textContent)
      .toContain("Provider unavailable");

    const retry = layer.querySelector('[data-action="details/retry"]');
    retry.focus();
    retry.click();
    expect(layer.querySelector('[role="dialog"]').contains(document.activeElement)).toBe(true);
  } finally {
    cleanup();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

describe("durable modal lifecycle", () => {
  it("writes nothing on open or close and re-resolves cached stars from the library", async () => {
    const {ui,layer,payload,before} = await mountSavedPhrase({lang:"es",text:"caluroso",translation:"hot"});
    expect(await exportAllData(db)).toEqual(before);
    const candidate = ui.get("details").breakdown.chunks[0].words[0];
    ui.transition("details/close");
    expect(await exportAllData(db)).toEqual(before);
    const saved = await toggleCardStar(payload.deck.id,candidate);
    ui.transition("details/open",payload);
    await vi.waitFor(()=>expect(layer.querySelector(".details-target-star")?.getAttribute("aria-pressed")).toBe("true"));
    expect(api.getPhraseBreakdown).toHaveBeenCalledTimes(1);
    layer.querySelector(".details-target-star").click();
    await vi.waitFor(()=>expect(layer.querySelector(".details-target-star").getAttribute("aria-pressed")).toBe("false"));
    expect(await db.cards.get(saved.cardId)).toBeDefined();
    expect(await db.memberships.get([payload.deck.id,saved.cardId])).toMatchObject({starredAt:null});
    expect(await db.provenance.where("cardId").equals(saved.cardId).count()).toBe(1);
  });

  it("rolls back a failed candidate insert and leaves the star and inline error intact", async () => {
    const {layer,before} = await mountSavedPhrase({lang:"es",text:"caluroso",translation:"hot"});
    const fail = () => { throw new Error("Membership write failed"); };
    db.memberships.hook("creating",fail);
    try {
      const button = layer.querySelector(".details-target-star");
      button.click();
      expect(button.disabled).toBe(true);
      await vi.waitFor(()=>expect(layer.querySelector(".details-target-error").textContent).toContain("Membership write failed"));
      expect(button.getAttribute("aria-pressed")).toBe("false");
      expect(await exportAllData(db)).toEqual(before);
    } finally {
      db.memberships.hook("creating").unsubscribe(fail);
    }
  });

  it("keeps modal position and saved Chunk teaching through successful and failed regeneration", async () => {
    const snapshot = {lang:"ja",text:"肉も",translation:"meat too",reading:[["肉","にく"],["も",null]]};
    const {ui,layer,deck} = await mountSavedPhrase(snapshot);
    const scroll = layer.querySelector(".details-scroll");
    scroll.scrollTop = 73;
    layer.querySelector('[data-target-kind="chunk"]').click();
    await vi.waitFor(()=>expect(layer.querySelector('[data-target-kind="chunk"]').getAttribute("aria-pressed")).toBe("true"));
    layer.querySelector('[data-target-kind="word"]').click();
    await vi.waitFor(()=>expect(layer.querySelector('[data-target-kind="word"]').getAttribute("aria-pressed")).toBe("true"));
    expect(ui.get("details").status).toBe("ready");
    expect(ui.get("details").selectedIndex).toBe(0);
    expect(scroll.scrollTop).toBe(73);
    const saved = (await getCards(deck.id)).find(entry=>entry.card.type==="chunk");
    api.getPhraseBreakdown.mockImplementationOnce(async ({source})=>chunkTargetBreakdown(source.snapshot,"A regenerated explanation.",source.ref));
    layer.querySelector('[data-action="details/regenerate"]').click();
    await vi.waitFor(()=>expect(layer.querySelector(".details-explanation p").textContent).toBe("A regenerated explanation."));
    await vi.waitFor(()=>expect(layer.querySelector('[data-target-kind="chunk"]').getAttribute("aria-pressed")).toBe("true"));
    expect((await db.cards.get(saved.cardId)).content.explanation).toBe("Adds the topic particle.");
    expect(await db.cards.count()).toBe(3);
    api.getPhraseBreakdown.mockRejectedValueOnce(new Error("Provider unavailable"));
    layer.querySelector('[data-action="details/regenerate"]').click();
    await vi.waitFor(()=>expect(layer.querySelector(".details-regenerate-error").textContent).toContain("Provider unavailable"));
    expect(layer.querySelector(".details-explanation p").textContent).toBe("A regenerated explanation.");
    expect(layer.querySelector('[data-target-kind="chunk"]').getAttribute("aria-pressed")).toBe("true");
    expect((await db.memberships.get([deck.id,saved.cardId])).starredAt).not.toBeNull();
  });

  it("retains an explicit star committed after navigation without reopening or patching the new view", async () => {
    const {ui,layer,deck} = await mountSavedPhrase({lang:"es",text:"caluroso",translation:"hot"});
    const leaveDuringWrite = () => { ui.transition("content/select-deck",{id:"another-book"}); };
    db.memberships.hook("creating",leaveDuringWrite);
    try {
      layer.querySelector(".details-target-star").click();
      await vi.waitFor(()=>expect(ui.get("details")).toBeNull());
      await vi.waitFor(async ()=>expect(await db.cards.where("type").equals("word").count()).toBe(1));
      const saved = await db.cards.where("type").equals("word").first();
      expect((await db.memberships.get([deck.id,saved.id])).starredAt).not.toBeNull();
      expect(ui.get("content").deckId).toBe("another-book");
      expect(ui.get("content").cards).toEqual([]);
    } finally {
      db.memberships.hook("creating").unsubscribe(leaveDuringWrite);
    }
  });

  it("fails atomically if the active phrasebook was deleted before saving", async () => {
    const {layer,deck} = await mountSavedPhrase({lang:"es",text:"caluroso",translation:"hot"});
    await deleteDeck(deck.id,db);
    const before = await exportAllData(db);
    layer.querySelector(".details-target-star").click();
    await vi.waitFor(()=>expect(layer.querySelector(".details-target-error").hidden).toBe(false));
    expect(layer.querySelector(".details-target-star").getAttribute("aria-pressed")).toBe("false");
    expect(await exportAllData(db)).toEqual(before);
  });
});
