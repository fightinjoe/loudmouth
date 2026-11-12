// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const deckStore = {
    d1: {
      id: "d1",
      name: "Japanese",
      lang: "ja",
      createdAt: "2026-01-01T00:00:00.000Z",
      mode: "study",
      order: "default",
      readingDisplay: "reading",
    },
    d2: {
      id: "d2",
      name: "Other",
      lang: "ja",
      createdAt: "2026-01-02T00:00:00.000Z",
      mode: "reverse",
      order: "default",
      readingDisplay: "reading",
    },
  };
  const repeatedEntries = () => [
    {
      key: "occ-1",
      cardId: "shared-card",
      card: { type: "phrase", lang: "ja", text: "どうぞ", translation: "go ahead" },
      membership: {
        deckId: "d1",
        cardId: "shared-card",
        createdAt: "2026-01-01T00:00:00.000Z",
        position: 0,
        starredAt: null,
      },
      occurrence: {
        id: "occ-1",
        deckId: "d1",
        groupId: "group-1",
        section: "exampleConversation",
        cardId: "shared-card",
        position: 0,
        translation: "go ahead",
        speaker: "you",
      },
      sources: [],
    },
    {
      key: "occ-2",
      cardId: "shared-card",
      card: { type: "phrase", lang: "ja", text: "どうぞ", translation: "after you" },
      membership: {
        deckId: "d1",
        cardId: "shared-card",
        createdAt: "2026-01-01T00:00:00.000Z",
        position: 0,
        starredAt: null,
      },
      occurrence: {
        id: "occ-2",
        deckId: "d1",
        groupId: "group-1",
        section: "exampleConversation",
        cardId: "shared-card",
        position: 1,
        translation: "after you",
        speaker: "partner",
      },
      sources: [],
    },
  ];
  const groups = [{ id: "group-1", deckId: "d1", title: "Ordering", position: 0, exchanges: [], wordFamilies: [] }];
  return {
    deckStore,
    repeatedEntries,
    groups,
    loadDeckData: vi.fn(),
    commitPhrasebook: vi.fn(),
    getReviewCards: vi.fn(),
    toggleCardStar: vi.fn(),
    updateDeckAccessTime: vi.fn(),
    updateDeckEntryOrder: vi.fn(),
  };
});

vi.mock("../panes/content-pane-load", () => ({
  loadDeckData: mocks.loadDeckData,
}));

vi.mock("../js/db", () => ({
  commitPhrasebook: mocks.commitPhrasebook,
  getReviewCards: mocks.getReviewCards,
  toggleCardStar: mocks.toggleCardStar,
  updateDeckAccessTime: mocks.updateDeckAccessTime,
  updateDeckEntryOrder: mocks.updateDeckEntryOrder,
}));

import contentPane from "../panes/content-pane";
import { createDelegate } from "../js/delegate";
import { createHost, createUIState } from "../js/uiState";

const mounted = [];

function mountPane() {
  const ui = createUIState({
    content: contentPane.initialState,
    shell: { exposed: "foreground" },
    action: null,
    details: null,
    nav: {},
  });
  ui.registerTransitions(contentPane.transitions);
  ui.registerTransitions({
    "shell/toggle": (slice) => slice,
    "action/open": (_slice, payload) => payload,
    "nav/reload": (slice) => slice,
    "details/open": (_slice, payload) => payload,
  });

  const rootEl = document.createElement("div");
  rootEl.innerHTML = contentPane.render(contentPane.initialState);
  document.body.appendChild(rootEl);
  const stageEl = document.createElement("div");
  stageEl.innerHTML = '<div class="shell-swipe-handle"></div>';
  const delegate = createDelegate(rootEl);
  const host = createHost({ ui, delegate, stageEl });
  const cleanup = contentPane.bindEvents(rootEl, host);
  const unbind = () => { cleanup(); delegate.dispose(); };
  const result = { ui, stageEl, rootEl, unbind };
  mounted.push(result);
  return result;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (view, selector) => view.rootEl.querySelector(selector);
const $$ = (view, selector) => [...view.rootEl.querySelectorAll(selector)];
const keydown = (element, key) => element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

async function openBook(view) {
  view.ui.transition("content/select-deck", { id: "d1" });
  await flush();
}

const CONVERSATION = "category:conversation";
const PHRASES = "category:phrases";

/** Opens a chapter as a reader does: its landing header, or a Starred deck card naming a tab. */
function openChapter(view, chapterKey, tab) {
  const opener = $(view, tab
    ? `.deck-card[data-chapter-key="${chapterKey}"][data-tab="${tab}"]`
    : `.chapter-card-header[data-chapter-key="${chapterKey}"]`);
  opener.click();
  return opener;
}

const activePage = (view) => $(view, '[data-region="chapter-sheet-body"] .chapter-page:not([inert])');
const pageKeys = (view) => [...activePage(view).querySelectorAll(".card-row-wrapper")].map((row) => row.dataset.entryKey);
const menuKeys = (view) => $$(view, ".chapter-menu-item").map((item) => item.dataset.chapterKey);
const twoTopics = () => [...mocks.groups, { ...mocks.groups[0], id: "group-2", title: "Paying", position: 1 }];

/** A speakerless phrase in a topic section of d1, keyed and translated by `key`. */
function phraseAt(key, occurrence) {
  const [base] = mocks.repeatedEntries();
  const { speaker: _speaker, ...rest } = base.occurrence;
  return {
    ...base, key, cardId: key,
    card: { ...base.card, translation: key },
    membership: { ...base.membership, cardId: key },
    occurrence: { ...rest, id: key, cardId: key, translation: key, ...occurrence },
  };
}

/** Adds a Group-1 key phrase so Key phrases and Conversation both have content. */
function addKeyPhrase(view, groups) {
  view.ui.transition("content/cards-changed", {
    cards: [...view.ui.get("content").cards, phraseAt("say-1", { section: "thingsToSay", position: 0 })],
    ...(groups ? { groups } : {}),
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.deckStore.d1.mode = "study";
  for (const mock of [
    mocks.loadDeckData,
    mocks.commitPhrasebook,
    mocks.getReviewCards,
    mocks.toggleCardStar,
    mocks.updateDeckAccessTime,
    mocks.updateDeckEntryOrder,
  ]) mock.mockReset();
  mocks.loadDeckData.mockImplementation(async (deckId) => {
    const deck = mocks.deckStore[deckId];
    if (!deck) return { deck: null, cards: [], groups: [] };
    return {
      deck: { ...deck },
      cards: deckId === "d1" ? mocks.repeatedEntries() : [],
      groups: deckId === "d1" ? mocks.groups.map((group) => ({ ...group })) : [],
    };
  });
  mocks.toggleCardStar.mockResolvedValue({
    cardId: "shared-card",
    starredAt: "2026-03-01T00:00:00.000Z",
  });
  mocks.updateDeckEntryOrder.mockResolvedValue(undefined);
  mocks.getReviewCards.mockResolvedValue([]);
});

afterEach(() => {
  while (mounted.length) {
    const current = mounted.pop();
    current.unbind();
    current.rootEl.remove();
  }
});


describe("phrasebook-scoped membership stars", () => {
  it("uses the returned timestamp and patches every occurrence, the Starred card and the chapter menu", async () => {
    const view = mountPane();
    await openBook(view);
    expect($(view, '[data-region="starred-card"]').children).toHaveLength(0);
    openChapter(view, CONVERSATION);
    expect(menuKeys(view)).toEqual([CONVERSATION]);

    const star = $(view, '[data-region="chapter-sheet-body"] .card-star[data-entry-key="occ-1"]');
    star.click();
    await flush();

    expect(mocks.toggleCardStar).toHaveBeenCalledWith("d1", { cardId: "shared-card" });
    expect(view.ui.get("content").cards.map((entry) => entry.membership.starredAt))
      .toEqual([
        "2026-03-01T00:00:00.000Z",
        "2026-03-01T00:00:00.000Z",
      ]);
    const stars = $$(view, '[data-region="chapter-sheet-body"] .card-star');
    expect(stars.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    expect(stars.map((button) => button.getAttribute("aria-label")))
      .toEqual(["Unstar: go ahead", "Unstar: after you"]);
    expect(star.isConnected).toBe(true);
    expect($(view, '[data-region="starred-card"] .chapter-card--starred .chapter-card-count').textContent).toMatch(/\b1\b/);
    expect(menuKeys(view)).toEqual(["starred", CONVERSATION]);
    expect($(view, '[data-action="content/review"]').disabled).toBe(false);
  });

  it("does not patch a newly selected phrasebook after an in-flight toggle", async () => {
    const pending = deferred();
    mocks.toggleCardStar.mockReturnValue(pending.promise);
    const view = mountPane();
    await openBook(view);
    openChapter(view, CONVERSATION);

    $(view, '.card-star[data-entry-key="occ-1"]').click();
    expect([...view.rootEl.querySelectorAll(".card-star")].every((button) => button.disabled))
      .toBe(true);
    view.ui.transition("content/select-deck", { id: "d2" });
    await flush();
    pending.resolve({ cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z" });
    await flush();

    expect(view.ui.get("content").deck.id).toBe("d2");
    expect(view.ui.get("content").cards).toEqual([]);
  });

  it("keeps icons unchanged and surfaces a failed toggle", async () => {
    mocks.toggleCardStar.mockRejectedValue(new Error("storage unavailable"));
    const view = mountPane();
    await openBook(view);
    openChapter(view, CONVERSATION);

    $(view, '.card-star[data-entry-key="occ-1"]').click();
    await flush();

    expect([...view.rootEl.querySelectorAll(".card-star")]
      .map((button) => button.getAttribute("aria-pressed")))
      .toEqual(["false", "false"]);
    expect(view.rootEl.querySelector('[data-region="content-error"]').textContent)
      .toBe("storage unavailable");
  });

  it("retains focus during a pending unstar in Starred, then focuses the next visible row or Back", async () => {
    const view = mountPane();
    await openBook(view);
    const starredAt = "2026-03-01T00:00:00.000Z";
    const looseWord = (cardId, text) => ({
      key: `${cardId}-entry`,
      cardId,
      card: { type: "word", lang: "ja", text, translation: cardId, partOfSpeech: "noun", senseKey: cardId },
      membership: { deckId: "d1", cardId, position: 1, starredAt },
      sources: [],
    });
    view.ui.transition("content/cards-changed", {
      cards: [...view.ui.get("content").cards.map((entry) => ({
        ...entry,
        membership: { ...entry.membership, starredAt },
      })), looseWord("meat", "肉"), looseWord("fish", "魚")],
    });
    openChapter(view, "starred", "words");
    const pending = deferred();
    mocks.toggleCardStar.mockReturnValue(pending.promise);
    const first = activePage(view).querySelector(".card-star");
    expect(first.dataset.cardId).toBe("meat");
    first.focus();
    first.click();
    first.click();
    expect(document.activeElement).toBe(first);
    expect(mocks.toggleCardStar).toHaveBeenCalledTimes(1);
    pending.resolve({ cardId: "meat", starredAt: null });
    await flush();

    const next = activePage(view).querySelector(".card-star");
    expect(next.dataset.cardId).toBe("fish");
    expect(document.activeElement).toBe(next);
    mocks.toggleCardStar.mockResolvedValue({ cardId: "fish", starredAt: null });
    next.click();
    await flush();

    // The Words page is empty now; the starred phrase on the hidden Phrases page must not take focus.
    expect(view.ui.get("content").chapterKey).toBe("starred");
    expect(activePage(view).dataset.tab).toBe("words");
    expect(document.activeElement).toBe($(view, ".chapter-sheet-back"));
    expect(view.ui.get("content").cards).toHaveLength(4);
    expect($(view, '[data-action="content/review"]').disabled).toBe(false);
    expect($$(view, ".card-star").every((button) => !button.disabled)).toBe(true);
  });

  it("keeps an emptied Starred pane open and listed as current while its landing card disappears", async () => {
    const view = mountPane();
    await openBook(view);
    view.ui.transition("content/card-star-changed", { deckId: "d1", cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z" });
    openChapter(view, "starred", "phrases");
    expect(view.ui.get("content").chapterKey).toBe("starred");
    view.ui.transition("content/card-star-changed", { deckId: "d1", cardId: "shared-card", starredAt: null });

    expect(view.ui.get("content").chapterKey).toBe("starred");
    expect(view.rootEl.hasAttribute("data-chapter-open")).toBe(true);
    expect(activePage(view).querySelector(".card-row-wrapper")).toBeNull();
    expect($(view, '[data-region="starred-card"]').children).toHaveLength(0);
    expect(menuKeys(view)).toEqual(["starred", CONVERSATION]);
    $(view, ".chapter-sheet-switch").click();
    $(view, `.chapter-menu-item[data-chapter-key="${CONVERSATION}"]`).click();
    expect(menuKeys(view)).toEqual([CONVERSATION]);
  });
});

describe("review entry point", () => {
  it("opens with the ordered unique entries returned by getReviewCards", async () => {
    const reviewEntries = [mocks.repeatedEntries()[1]];
    reviewEntries[0].membership.starredAt = "2026-02-01T00:00:00.000Z";
    mocks.getReviewCards.mockResolvedValue(reviewEntries);
    const view = mountPane();
    view.ui.transition("content/select-deck", { id: "d1" });
    await flush();
    view.ui.transition("content/card-star-changed", {
      deckId: "d1",
      cardId: "shared-card",
      starredAt: "2026-02-01T00:00:00.000Z",
    });

    view.rootEl.querySelector('[data-action="content/review"]').click();
    await flush();

    expect(mocks.getReviewCards).toHaveBeenCalledWith("d1");
    expect(view.ui.get("action")).toEqual({
      kind: "review",
      payload: { deck: expect.objectContaining({ id: "d1" }), cards: reviewEntries },
    });
  });

  it("ignores a completed review load after navigation", async () => {
    const pending = deferred();
    mocks.getReviewCards.mockReturnValue(pending.promise);
    const view = mountPane();
    view.ui.transition("content/select-deck", { id: "d1" });
    await flush();
    view.ui.transition("content/card-star-changed", {
      deckId: "d1",
      cardId: "shared-card",
      starredAt: "2026-02-01T00:00:00.000Z",
    });

    view.rootEl.querySelector('[data-action="content/review"]').click();
    view.ui.transition("content/select-deck", { id: "d2" });
    await flush();
    pending.resolve([mocks.repeatedEntries()[0]]);
    await flush();

    expect(view.ui.get("action")).toBeNull();
  });
});

describe("entry-key reordering", () => {
  it("reorders only inside an open chapter and persists the complete order before leaving edit mode", async () => {
    const view = mountPane();
    await openBook(view);
    view.ui.transition("content/enter-edit");
    expect(view.ui.get("content").editMode).toBe(false);
    openChapter(view, CONVERSATION);
    $(view, '[data-action="content/menu-edit"]').click();
    expect(view.ui.get("content").editMode).toBe(true);
    expect(view.rootEl.hasAttribute("data-edit-mode")).toBe(true);
    $(view, '.card-row[data-entry-key="occ-1"]').click();
    expect(view.ui.get("action")).toBeNull();
    view.ui.transition("content/reorder", { pageOrder: ["occ-2", "occ-1"] });
    expect(pageKeys(view)).toEqual(["occ-2", "occ-1"]);

    $(view, '[data-action="content/done"]').click();
    await flush();

    expect(mocks.updateDeckEntryOrder).toHaveBeenCalledWith("d1", ["occ-2", "occ-1"]);
    expect(view.ui.get("content").cards.map((entry) => entry.key))
      .toEqual(["occ-2", "occ-1"]);
    expect(view.ui.get("content").editMode).toBe(false);
    expect(view.ui.get("content").chapterKey).toBe(CONVERSATION);
    expect(pageKeys(view)).toEqual(["occ-2", "occ-1"]);
  });

  it("keeps edit mode active and shows an atomic save failure", async () => {
    mocks.updateDeckEntryOrder.mockRejectedValue(new Error("write failed"));
    const view = mountPane();
    await openBook(view);
    openChapter(view, CONVERSATION);
    $(view, '[data-action="content/menu-edit"]').click();
    view.ui.transition("content/reorder", { pageOrder: ["occ-2", "occ-1"] });

    $(view, '[data-action="content/done"]').click();
    await flush();

    expect(view.ui.get("content").editMode).toBe(true);
    expect($(view, '[data-region="content-error"]').textContent)
      .toBe("write failed");
    expect(pageKeys(view)).toEqual(["occ-2", "occ-1"]);
  });

  it("does not offer reordering inside Starred", async () => {
    const view = mountPane();
    await openBook(view);
    view.ui.transition("content/card-star-changed", { deckId: "d1", cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z" });
    openChapter(view, "starred", "phrases");
    $(view, '[data-action="content/menu-edit"]').click();
    expect(view.ui.get("content").editMode).toBe(false);
  });

  it("closing the chapter leaves edit mode without saving the unsaved order", async () => {
    const view = mountPane();
    await openBook(view);
    openChapter(view, CONVERSATION);
    $(view, '[data-action="content/menu-edit"]').click();
    view.ui.transition("content/reorder", { pageOrder: ["occ-2", "occ-1"] });

    $(view, ".chapter-sheet-back").click();
    await flush();

    expect(view.ui.get("content")).toMatchObject({ chapterKey: null, editMode: false, editOrder: null });
    expect(view.rootEl.hasAttribute("data-edit-mode")).toBe(false);
    expect(mocks.updateDeckEntryOrder).not.toHaveBeenCalled();
    expect(view.ui.get("content").cards.map((entry) => entry.key)).toEqual(["occ-1", "occ-2"]);
    openChapter(view, CONVERSATION);
    expect(pageKeys(view)).toEqual(["occ-1", "occ-2"]);
  });

  it("keeps the edited chapter open while editing and ignores requests for any other chapter", async () => {
    const view = mountPane();
    await openBook(view);
    addKeyPhrase(view);
    view.ui.transition("content/card-star-changed", { deckId: "d1", cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z" });
    openChapter(view, CONVERSATION);
    $(view, '[data-action="content/menu-edit"]').click();

    $(view, ".chapter-sheet-switch").click();
    $(view, `.chapter-menu-item[data-chapter-key="${PHRASES}"]`).click();
    view.ui.transition("content/open-chapter", { chapterKey: "starred", tab: "phrases" });

    expect(view.ui.get("content")).toMatchObject({ chapterKey: CONVERSATION, editMode: true, starredTab: "words" });
    view.ui.transition("content/open-chapter", { chapterKey: CONVERSATION });
    expect(view.ui.get("content")).toMatchObject({ chapterKey: CONVERSATION, editMode: true });
    expect(activePage(view).dataset.tab).toBe("conversation");
  });

  it("reorders within one topic's Key phrases, rejects moves across topics or sections, and persists the result", async () => {
    const view = mountPane();
    await openBook(view);
    view.ui.transition("content/cards-changed", {
      cards: [...view.ui.get("content").cards,
        phraseAt("say-a", { section: "thingsToSay", position: 0 }),
        phraseAt("say-b", { section: "thingsToSay", position: 1 }),
        phraseAt("pay-a", { groupId: "group-2", section: "thingsToSay", position: 0 })],
      groups: twoTopics(),
    });
    openChapter(view, PHRASES);
    expect([...activePage(view).querySelectorAll('[data-reorder-region="thingsToSay:group-1"] .card-row-wrapper')]
      .map((row) => row.dataset.entryKey)).toEqual(["say-a", "say-b"]);
    $(view, '[data-action="content/menu-edit"]').click();

    const before = view.ui.get("content").editOrder;
    view.ui.transition("content/reorder", { pageOrder: ["pay-a", "say-a"] });
    view.ui.transition("content/reorder", { pageOrder: ["occ-1", "say-a"] });
    expect(view.ui.get("content").editOrder).toBe(before);

    view.ui.transition("content/reorder", { pageOrder: ["say-b", "say-a"] });
    expect(pageKeys(view)).toEqual(["say-b", "say-a", "pay-a"]);
    $(view, '[data-action="content/done"]').click();
    await flush();

    expect(mocks.updateDeckEntryOrder).toHaveBeenCalledWith("d1", ["occ-1", "occ-2", "say-b", "say-a", "pay-a"]);
    expect(view.ui.get("content")).toMatchObject({ chapterKey: PHRASES, editMode: false });
    expect(pageKeys(view)).toEqual(["say-b", "say-a", "pay-a"]);
  });
});

describe("preview commit", () => {
  const draftGroups = [{
    id: "draft-group",
    title: "Greetings",
    thingsToSay: [{
      id: "draft-occurrence",
      card: { type: "phrase", lang: "ja", text: "こんにちは", translation: "hello" },
    }],
    words: [],
    likelyExchanges: [{id:"draft-exchange",title:"Welcome",lines:[
      {speaker:"you",responses:[{id:"exchange-you",card:{type:"phrase",lang:"ja",text:"こんにちは",translation:"Hello."}}]},
      {speaker:"partner",responses:[{id:"exchange-partner",card:{type:"phrase",lang:"ja",text:"どうぞ",translation:"Come in."}}]},
    ]}],
    exampleConversation: [
      { id: "draft-you", card: { type: "phrase", lang: "ja", text: "こんにちは", translation: "hello" }, speaker: "you" },
      { id: "draft-partner", card: { type: "phrase", lang: "ja", text: "どうぞ", translation: "come in" }, speaker: "partner" },
    ],
  }];
  const previewDeck = {
    id: "preview-id",
    name: "Greetings",
    lang: "ja",
    ability: "basics",
    seedId: "seed-greetings-ja",
    mode: "study",
    order: "default",
    readingDisplay: "reading",
    preview: true,
    draftGroups,
  };

  it("commits all draft groups atomically and selects the durable deck", async () => {
    mocks.commitPhrasebook.mockResolvedValue({ ...mocks.deckStore.d1 });
    const view = mountPane();
    view.ui.transition("content/loaded", { deck: previewDeck, cards: [] });

    view.rootEl.querySelector('[data-action="content/save-preview"]').click();
    await flush();

    expect(mocks.commitPhrasebook).toHaveBeenCalledWith({
      name: "Greetings",
      lang: "ja",
      ability: "basics",
      seedId: "seed-greetings-ja",
      groups: draftGroups,
      selectedIndexes: [0],
    });
    expect(view.ui.get("content").deckId).toBe("d1");
  });

  it("keeps the preview visible and reports a commit failure", async () => {
    mocks.commitPhrasebook.mockRejectedValue(new Error("commit failed"));
    const view = mountPane();
    view.ui.transition("content/loaded", { deck: previewDeck, cards: [] });

    view.rootEl.querySelector('[data-action="content/save-preview"]').click();
    await flush();

    expect(view.ui.get("content").deck.id).toBe("preview-id");
    expect(view.rootEl.querySelector('[data-region="content-error"]').textContent)
      .toBe("commit failed");
  });
});

it("refreshes Review availability when analysis adds a starred learning target", async () => {
  const view = mountPane();
  view.ui.transition("content/select-deck",{id:"d1"});
  await flush();
  const review = view.rootEl.querySelector('[data-action="content/review"]');
  expect(review.disabled).toBe(true);
  const word = {
    key:JSON.stringify(["d1","word"]),cardId:"word",
    card:{type:"word",lang:"ja",text:"肉",translation:"meat",partOfSpeech:"noun",senseKey:"meat"},
    membership:{deckId:"d1",cardId:"word",createdAt:"2026-03-01T00:00:00.000Z",position:0,starredAt:"2026-03-01T00:00:00.000Z"},
    sources:[],
  };
  const cards = [...view.ui.get("content").cards,word];
  view.ui.transition("content/cards-changed",{deckId:"d1",cards});
  expect(review.disabled).toBe(false);
  view.ui.transition("content/cards-changed",{deckId:"d1",cards:cards.map(entry=>({...entry,membership:{...entry.membership,starredAt:null}}))});
  expect(review.disabled).toBe(true);
});

describe("chapter navigation", () => {
  it("opens a category from its landing header at the top and returns focus to the header on Back", async () => {
    const view = mountPane();
    await openBook(view);
    addKeyPhrase(view);
    const headers = $$(view, ".chapter-card-header");
    expect(headers.map((header) => header.dataset.chapterKey)).toEqual([PHRASES, CONVERSATION]);
    headers[1].click();

    expect(view.ui.get("content").chapterKey).toBe(CONVERSATION);
    expect(view.rootEl.hasAttribute("data-chapter-open")).toBe(true);
    expect($(view, '[data-region="chapter-sheet"]').dataset.chapterKind).toBe("category");
    expect($(view, '[data-region="chapter-sheet-title"]').textContent).toBe("Conversation");
    expect($(view, '.chapter-menu-item[aria-checked="true"]').dataset.chapterKey).toBe(CONVERSATION);
    expect(activePage(view).scrollTop).toBe(0);
    expect(document.activeElement).toBe($(view, ".chapter-sheet-back"));
    expect($(view, '[data-region="textbook-reader"]').inert).toBe(true);

    $(view, ".chapter-sheet-back").click();
    expect(view.ui.get("content").chapterKey).toBeNull();
    expect(view.rootEl.hasAttribute("data-chapter-open")).toBe(false);
    expect($(view, '[data-region="textbook-reader"]').inert).toBe(false);
    expect(document.activeElement).toBe(headers[1]);
  });

  describe("deck cards", () => {
    const groups = [
      { id: "group-1", deckId: "d1", title: "Ordering", position: 0,
        exchanges: [{ id: "x-table", title: "Getting a table", position: 0 }],
        wordFamilies: [{ id: "drinks", title: "Drinks", position: 0 }] },
      { id: "group-2", deckId: "d1", title: "Ordering", position: 1,
        exchanges: [{ id: "x-bill", title: "Asking for the bill", position: 0 }],
        wordFamilies: [{ id: "money", title: "Money", position: 0 }] },
    ];
    const placedWord = (key, familyId, groupId) => ({
      key, cardId: key,
      card: { type: "word", lang: "ja", text: "水", translation: key, partOfSpeech: "noun", senseKey: key },
      membership: { deckId: "d1", cardId: key, createdAt: "2026-01-01T00:00:00.000Z", position: 0, starredAt: null },
      wordPlacement: { id: key, deckId: "d1", groupId, familyId, cardId: key, position: 0 },
      sources: [],
    });
    const cards = () => [
      placedWord("water", "drinks", "group-1"), placedWord("yen", "money", "group-2"),
      phraseAt("say-1", { section: "thingsToSay", position: 0 }),
      phraseAt("say-2", { groupId: "group-2", section: "thingsToSay", position: 0 }),
      phraseAt("table", { section: "likelyExchanges", exchangeId: "x-table", turnIndex: 0, speaker: "you" }),
      phraseAt("bill", { groupId: "group-2", section: "likelyExchanges", exchangeId: "x-bill", turnIndex: 0, speaker: "you" }),
    ];

    it.each([
      ["a Words card reveals its family", "category:words", "family:money", '[data-family-id="money"]', false],
      ["a Key phrases card reveals its duplicate-title topic", PHRASES, "topic:group-2", '[data-topic-id="group-2"]', false],
      ["an Exchanges card reveals and flashes its exchange", "category:exchanges", "exchange:x-bill", '[data-exchange-id="x-bill"]', true],
    ])("%s", async (_name, chapterKey, focus, selector, flashes) => {
      const view = mountPane();
      await openBook(view);
      view.ui.transition("content/cards-changed", { cards: cards(), groups });
      const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
        const top = this.matches(selector) ? 300 : 0;
        return { top, bottom: top + 40, left: 0, right: 300, width: 300, height: 40, x: 0, y: top };
      });
      try {
        const opener = $(view, `.deck-card[data-focus="${focus}"]`);
        expect(opener.dataset.chapterKey).toBe(chapterKey);
        opener.click();

        expect(view.ui.get("content").chapterKey).toBe(chapterKey);
        const target = activePage(view).querySelector(selector);
        expect(activePage(view).scrollTop).toBe(flashes ? 252 : 300);
        expect(target.classList.contains("chapter-flash")).toBe(flashes);
        expect(activePage(view).querySelectorAll(".chapter-flash")).toHaveLength(flashes ? 1 : 0);
        expect(document.activeElement).toBe($(view, ".chapter-sheet-back"));

        $(view, ".chapter-sheet-back").click();
        expect(document.activeElement).toBe(opener);
      } finally {
        rect.mockRestore();
      }
    });
  });

  it("opens essential analysis inside its category with its real occurrence and group, without inventing a speaker", async () => {
    const view = mountPane();
    await openBook(view);
    const entry = mocks.repeatedEntries()[0];
    delete entry.occurrence.speaker;
    entry.occurrence.section = "thingsToSay";
    view.ui.transition("content/cards-changed", { cards: [entry] });
    openChapter(view, PHRASES);
    activePage(view).querySelector(".card-term").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect(view.ui.get("details").entry.occurrence).toEqual(entry.occurrence);
    expect(view.ui.get("details").entry.occurrence).not.toHaveProperty("speaker");
    expect(view.ui.get("details").group.id).toBe("group-1");
  });

  it("lists Starred in the chapter menu only while something is starred, and keeps an emptied current category", async () => {
    const view = mountPane();
    await openBook(view);
    addKeyPhrase(view);
    openChapter(view, CONVERSATION);
    expect(menuKeys(view)).toEqual([PHRASES, CONVERSATION]);
    view.ui.transition("content/card-star-changed", { deckId: "d1", cardId: "say-1", starredAt: "2026-03-01T00:00:00.000Z" });
    expect(menuKeys(view)).toEqual(["starred", PHRASES, CONVERSATION]);

    view.ui.transition("content/cards-changed", { cards: view.ui.get("content").cards.filter((entry) => entry.key === "say-1") });
    expect(view.ui.get("content").chapterKey).toBe(CONVERSATION);
    expect(menuKeys(view)).toEqual(["starred", PHRASES, CONVERSATION]);
    expect(activePage(view).querySelector(".chapter-empty").textContent).toBe("No conversation in this phrasebook.");
    expect($$(view, '[data-region="chapter-list"] .chapter-card').map((card) => card.dataset.chapterKey)).toEqual([PHRASES]);

    $(view, ".chapter-sheet-switch").click();
    $(view, `.chapter-menu-item[data-chapter-key="${PHRASES}"]`).click();
    expect(menuKeys(view)).toEqual(["starred", PHRASES]);
  });
});

describe("chapter sheet", () => {
  it("remembers the Starred tab within a phrasebook and resets it for another phrasebook", async () => {
    const view = mountPane();
    await openBook(view);
    view.ui.transition("content/card-star-changed", { deckId: "d1", cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z" });
    openChapter(view, "starred");
    expect(activePage(view).dataset.tab).toBe("words");
    $(view, '.chapter-tab[data-tab="phrases"]').click();
    expect(activePage(view).dataset.tab).toBe("phrases");
    $(view, ".chapter-sheet-back").click();

    openChapter(view, CONVERSATION);
    $(view, ".chapter-sheet-switch").click();
    $(view, '.chapter-menu-item[data-chapter-key="starred"]').click();
    expect(view.ui.get("content")).toMatchObject({ chapterKey: "starred", starredTab: "phrases" });
    expect(activePage(view).dataset.tab).toBe("phrases");
    expect($(view, '.chapter-tab[aria-selected="true"]').dataset.tab).toBe("phrases");

    const selected = $(view, '.chapter-tab[aria-selected="true"]');
    selected.focus();
    keydown(selected, "ArrowLeft");
    expect(view.ui.get("content").starredTab).toBe("words");
    expect(activePage(view).dataset.tab).toBe("words");
    expect(document.activeElement).toBe($(view, '.chapter-tab[data-tab="words"]'));
    $(view, '.chapter-tab[data-tab="phrases"]').click();

    view.ui.transition("content/select-deck", { id: "d2" });
    await flush();
    expect(view.ui.get("content")).toMatchObject({ chapterKey: null, starredTab: "words" });
    await openBook(view);
    view.ui.transition("content/card-star-changed", { deckId: "d1", cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z" });
    openChapter(view, "starred");
    expect(activePage(view).dataset.tab).toBe("words");
  });

  it("settles a swiped Starred pager on the page it stopped at", async () => {
    const view = mountPane();
    await openBook(view);
    view.ui.transition("content/card-star-changed", { deckId: "d1", cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z" });
    openChapter(view, "starred");
    const pager = $(view, '[data-region="chapter-pager"]');
    Object.defineProperty(pager, "clientWidth", { value: 300 });
    pager.scrollLeft = 300;
    pager.dispatchEvent(new Event("scroll"));
    await wait(200);
    expect(view.ui.get("content").starredTab).toBe("phrases");
    expect(activePage(view).dataset.tab).toBe("phrases");
  });

  it("ignores tab requests outside Starred", async () => {
    const view = mountPane();
    await openBook(view);
    view.ui.transition("content/card-star-changed", { deckId: "d1", cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z" });
    openChapter(view, CONVERSATION);
    const before = view.ui.get("content");
    view.ui.transition("content/select-tab", { tab: "phrases" });
    expect(view.ui.get("content")).toBe(before);
    view.ui.transition("content/open-chapter", { chapterKey: CONVERSATION, tab: "phrases" });
    expect(view.ui.get("content")).toBe(before);
    expect(activePage(view).dataset.tab).toBe("conversation");
    $(view, ".chapter-sheet-back").click();

    openChapter(view, "starred");
    expect(view.ui.get("content").starredTab).toBe("words");
    expect(activePage(view).dataset.tab).toBe("words");
  });

  it("ignores chapter requests for language libraries and unknown chapters", async () => {
    const view = mountPane();
    await openBook(view);
    view.ui.transition("content/open-chapter", { chapterKey: "category:missing" });
    view.ui.transition("content/open-chapter", { chapterKey: "group:group-1" });
    expect(view.ui.get("content").chapterKey).toBeNull();
    view.ui.transition("content/loaded", {
      deck: { id: "lang:ja", name: "All Japanese Cards", lang: "ja", mode: "study", order: "default", readingDisplay: "reading", system: true },
      cards: mocks.repeatedEntries().map((entry) => ({ ...entry, membership: undefined, occurrence: undefined })),
      groups: [],
    });
    view.ui.transition("content/open-chapter", { chapterKey: "translations" });
    expect(view.ui.get("content").chapterKey).toBeNull();
    expect($(view, '[data-region="chapter-sheet"]')).toBeNull();
  });

  it("closes the chapter menu on Escape before closing the pane", async () => {
    const view = mountPane();
    await openBook(view);
    addKeyPhrase(view);
    const opener = openChapter(view, PHRASES);
    const sheet = $(view, '[data-region="chapter-sheet"]');
    const toggle = $(view, ".chapter-sheet-switch");

    toggle.click();
    expect(sheet.classList.contains("chapter-sheet--menu-open")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement.dataset.chapterKey).toBe(PHRASES);
    keydown(document.activeElement, "ArrowDown");
    expect(document.activeElement.dataset.chapterKey).toBe(CONVERSATION);

    keydown(document.activeElement, "Escape");
    expect(sheet.classList.contains("chapter-sheet--menu-open")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    expect(view.ui.get("content").chapterKey).toBe(PHRASES);

    toggle.click();
    activePage(view).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(sheet.classList.contains("chapter-sheet--menu-open")).toBe(false);

    toggle.click();
    $(view, `.chapter-menu-item[data-chapter-key="${CONVERSATION}"]`).click();
    expect(view.ui.get("content").chapterKey).toBe(CONVERSATION);
    expect($(view, '[data-region="chapter-sheet-title"]').textContent).toBe("Conversation");
    expect(sheet.classList.contains("chapter-sheet--menu-open")).toBe(false);
    expect(document.activeElement).toBe(toggle);
    expect(activePage(view).dataset.tab).toBe("conversation");

    keydown(toggle, "Escape");
    expect(view.ui.get("content").chapterKey).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("opens a starred entry in context in its category and flashes its row", async () => {
    const view = mountPane();
    await openBook(view);
    const starredAt = "2026-03-01T00:00:00.000Z";
    const water = {
      key: "word-placement", cardId: "water",
      card: { type: "word", lang: "ja", text: "水", translation: "water", partOfSpeech: "noun", senseKey: "water" },
      membership: { deckId: "d1", cardId: "water", createdAt: "2026-01-01T00:00:00.000Z", position: 0, starredAt },
      wordPlacement: { id: "word-placement", deckId: "d1", groupId: "group-1", familyId: "drinks", cardId: "water", position: 0 },
      sources: [],
    };
    view.ui.transition("content/cards-changed", {
      cards: [...view.ui.get("content").cards.map((entry) => ({ ...entry, membership: { ...entry.membership, starredAt } })), water],
      groups: [{ ...mocks.groups[0], wordFamilies: [{ id: "drinks", title: "Drinks", position: 0 }] }],
    });
    openChapter(view, "starred", "words");
    activePage(view).querySelector('[data-action="content/open-in-context"][data-entry-key="word-placement"]').click();

    expect(view.ui.get("content")).toMatchObject({ chapterKey: "category:words", starredTab: "words" });
    expect(activePage(view).querySelector('.card-row-wrapper[data-entry-key="word-placement"]').classList.contains("chapter-flash")).toBe(true);

    $(view, ".chapter-sheet-switch").click();
    $(view, '.chapter-menu-item[data-chapter-key="starred"]').click();
    expect(activePage(view).dataset.tab).toBe("words");
    $(view, '.chapter-tab[data-tab="phrases"]').click();
    expect(activePage(view).dataset.tab).toBe("phrases");
    activePage(view).querySelector('[data-action="content/open-in-context"][data-entry-key="occ-1"]').click();

    expect(view.ui.get("content")).toMatchObject({ chapterKey: CONVERSATION, starredTab: "phrases" });
    expect(activePage(view).dataset.tab).toBe("conversation");
    expect(activePage(view).querySelector('.card-row-wrapper[data-entry-key="occ-1"]').classList.contains("chapter-flash")).toBe(true);
  });

  it("collapses the title past 150px of scroll and expands it only below 110px", async () => {
    const view = mountPane();
    await openBook(view);
    const body = $(view, '[data-region="content-body"]');
    const reader = $(view, '[data-region="textbook-reader"]');
    const scrollReader = async (y) => {
      reader.scrollTop = y;
      reader.dispatchEvent(new Event("scroll"));
      await wait(50);
      return body.classList.contains("phrasebook--collapsed");
    };
    expect(await scrollReader(150)).toBe(false);
    expect(await scrollReader(151)).toBe(true);
    expect(await scrollReader(110)).toBe(true);
    expect(await scrollReader(109)).toBe(false);
    expect(await scrollReader(140)).toBe(false);
  });
});

describe("illustration completion ownership", () => {
  it("patches only the backdrop while preserving the open chapter, edit order, mounted cards, scroll and focus", async () => {
    const view = mountPane();
    await openBook(view);
    const pending = { requestId: "cover-1", prompt: "Watercolor", state: "pending" };
    const current = view.ui.get("content");
    view.ui.transition("content/loaded", { ...current, deck: { ...current.deck, illustration: pending } });
    openChapter(view, CONVERSATION);
    $(view, '[data-action="content/menu-edit"]').click();
    view.ui.transition("content/reorder", { pageOrder: ["occ-2", "occ-1"] });
    const reader = $(view, '[data-region="textbook-reader"]');
    const page = activePage(view);
    const card = page.querySelector(".card-term");
    card.focus();
    page.scrollTop = 112;
    reader.scrollTop = 40;
    const order = view.ui.get("content").editOrder;
    const ready = { ...pending, state: "ready", image: {
      dataUrl: "data:image/png;base64,aGVsbG8=", mediaType: "image/png", width: 1600, height: 900,
    } };
    view.ui.transition("content/illustration-updated", { deckId: "d1", illustration: ready });
    expect(view.ui.get("content").editMode).toBe(true);
    expect(view.ui.get("content").editOrder).toBe(order);
    expect(view.ui.get("content").chapterKey).toBe(CONVERSATION);
    expect(view.rootEl.hasAttribute("data-chapter-open")).toBe(true);
    expect(activePage(view)).toBe(page);
    expect(page.scrollTop).toBe(112);
    expect(reader.scrollTop).toBe(40);
    expect(page.querySelector(".card-term")).toBe(card);
    expect(pageKeys(view)).toEqual(["occ-2", "occ-1"]);
    expect(document.activeElement).toBe(card);
    expect($(view, ".textbook-pattern").style.backgroundImage).toContain(ready.image.dataUrl);
    view.ui.transition("content/illustration-updated", { deckId: "d1", illustration: { ...pending, state: "failed" } });
    expect(view.ui.get("content").deck.illustration).toBe(ready);
  });

  it("ignores superseded requests and completions for a switched deck", async () => {
    const view = mountPane();
    view.ui.transition("content/select-deck", { id: "d1" });
    await flush();
    const current = view.ui.get("content");
    const pending = { requestId: "current", prompt: "Watercolor", state: "pending" };
    view.ui.transition("content/loaded", { ...current, deck: { ...current.deck, illustration: pending } });
    const before = view.ui.get("content");
    view.ui.transition("content/illustration-updated", {
      deckId: "d1", illustration: { ...pending, requestId: "superseded", state: "failed" },
    });
    expect(view.ui.get("content")).toBe(before);
    view.ui.transition("content/select-deck", { id: "d2" });
    await flush();
    const switched = view.ui.get("content");
    view.ui.transition("content/illustration-updated", { deckId: "d1", illustration: { ...pending, state: "failed" } });
    expect(view.ui.get("content")).toBe(switched);
  });
});

it("browses a focused category row with keyboard keys without opening its chapter or moving its sibling", async () => {
  const view = mountPane();
  await openBook(view);
  addKeyPhrase(view);
  const [row, sibling] = $$(view, ".chapter-row");
  Object.defineProperties(row, { clientWidth: { value: 200 }, scrollWidth: { value: 600 } });
  row.focus();
  keydown(row, "ArrowRight");
  expect(row.scrollLeft).toBe(150);
  expect(sibling.scrollLeft).toBe(0);
  expect(view.ui.get("content").chapterKey).toBeNull();
  keydown(row, "ArrowLeft");
  expect(row.scrollLeft).toBe(0);
  keydown(row, "End");
  expect(row.scrollLeft).toBe(600);
  keydown(row, "Home");
  expect(row.scrollLeft).toBe(0);
});

describe("content owner disposal", () => {
  it("ignores a deck load that finishes after unbinding", async () => {
    const pending = deferred();
    mocks.loadDeckData.mockReturnValueOnce(pending.promise);
    const view = mountPane();
    view.ui.transition("content/select-deck", { id: "d1" });
    view.unbind();
    pending.resolve({ deck: mocks.deckStore.d1, cards: mocks.repeatedEntries(), groups: mocks.groups });
    await flush();
    expect(view.ui.get("content").deck).toBeNull();
  });

  it.each(["resolve", "reject"])("ignores late star %s after unbinding", async (outcome) => {
    const pending = deferred();
    mocks.toggleCardStar.mockReturnValueOnce(pending.promise);
    const view = mountPane();
    await openBook(view);
    openChapter(view, CONVERSATION);
    $(view, '[data-region="chapter-sheet-body"] .card-star').click();
    const before = view.ui.get("content");
    view.unbind();
    if (outcome === "resolve") pending.resolve({ cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z" });
    else pending.reject(new Error("obsolete failure"));
    await flush();
    expect(view.ui.get("content")).toBe(before);
    expect(view.rootEl.textContent).not.toContain("obsolete failure");
  });

  it("does not open Review after its owner is unbound", async () => {
    const pending = deferred();
    mocks.getReviewCards.mockReturnValueOnce(pending.promise);
    const view = mountPane();
    view.ui.transition("content/select-deck", { id: "d1" });
    await flush();
    view.ui.transition("content/card-star-changed", {
      deckId: "d1", cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z",
    });
    view.rootEl.querySelector('[data-action="content/review"]').click();
    view.unbind();
    pending.resolve(mocks.repeatedEntries());
    await flush();
    expect(view.ui.get("action")).toBeNull();
  });

  it("does not confirm a reorder after unbinding", async () => {
    const pending = deferred();
    mocks.updateDeckEntryOrder.mockReturnValueOnce(pending.promise);
    const view = mountPane();
    await openBook(view);
    openChapter(view, CONVERSATION);
    $(view, '[data-action="content/menu-edit"]').click();
    $(view, '[data-action="content/done"]').click();
    view.unbind();
    pending.resolve();
    await flush();
    expect(view.ui.get("content").editMode).toBe(true);
  });

  it("does not select a committed preview after unbinding", async () => {
    const pending = deferred();
    mocks.commitPhrasebook.mockReturnValueOnce(pending.promise);
    const view = mountPane();
    view.ui.transition("content/loaded", {
      deck: { ...mocks.deckStore.d1, preview: true, draftGroups: [], ability: "beginner", seedId: "seed" },
      cards: [], groups: [],
    });
    view.rootEl.querySelector('[data-action="content/save-preview"]').click();
    view.unbind();
    pending.resolve({ ...mocks.deckStore.d2 });
    await flush();
    expect(view.ui.get("content").deckId).toBe("d1");
  });
});

it("ignores a Review load belonging to a previous visit to the same book", async () => {
  const pending = deferred();
  mocks.getReviewCards.mockReturnValueOnce(pending.promise);
  const view = mountPane();
  view.ui.transition("content/select-deck", { id: "d1" });
  await flush();
  view.ui.transition("content/card-star-changed", {
    deckId: "d1", cardId: "shared-card", starredAt: "2026-03-01T00:00:00.000Z",
  });
  view.rootEl.querySelector('[data-action="content/review"]').click();
  view.ui.transition("content/select-deck", { id: "d2" });
  await flush();
  view.ui.transition("content/select-deck", { id: "d1" });
  await flush();
  pending.resolve(mocks.repeatedEntries());
  await flush();
  expect(view.ui.get("action")).toBeNull();
});

it.each([
  ["opens details for a held phrase in the chapter sheet", false, true],
  ["cancels a pending phrase hold when the content owner is unbound", true, false],
])("%s", async (_name, unbind, opens) => {
  const view = mountPane();
  await openBook(view);
  openChapter(view, CONVERSATION);
  vi.useFakeTimers();
  try {
    activePage(view).querySelector(".card-term").dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, pointerId: 4, isPrimary: true, button: 0, clientX: 10, clientY: 10,
    }));
    if (unbind) view.unbind();
    await vi.advanceTimersByTimeAsync(600);
    expect(view.ui.get("details")?.entry.key ?? null).toBe(opens ? "occ-1" : null);
  } finally {
    vi.useRealTimers();
  }
});
