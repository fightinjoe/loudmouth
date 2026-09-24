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
        cardId: "shared-card",
        position: 1,
        translation: "after you",
        speaker: "partner",
      },
      sources: [],
    },
  ];
  const groups = [{ id: "group-1", deckId: "d1", title: "Ordering", position: 0 }];
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

vi.mock("../panes/content-pane-gestures", () => ({
  wireContentGestures: () => ({
    resetReveal: () => {},
    syncPager: () => {},
    isAnyRevealed: () => false,
  }),
}));

vi.mock("../panes/content-pane-render", () => {
  const rows = (entries) => entries.map((entry) => `
    <div class="card-row-wrapper" data-entry-key="${entry.key}" data-card-id="${entry.cardId}">
      <div class="card-row" data-action="content/open-card" data-entry-key="${entry.key}">
        <button class="card-term">${entry.card.translation}</button>
        ${entry.membership ? `<button class="card-star" data-action="content/star-card" data-entry-key="${entry.key}" data-card-id="${entry.cardId}" aria-pressed="${entry.membership.starredAt !== null}" data-selected="${entry.membership.starredAt !== null}"></button>` : ""}
      </div>
    </div>
  `).join("");
  const body = (deck, entries) => deck ? `
    <button data-action="content/deck-title">${deck.name}</button>
    ${deck.preview ? '<button data-action="content/save-preview">Save</button>' : '<button data-action="content/done">Done</button>'}
    <p data-region="content-error" role="alert" hidden></p>
    <div data-region="deck-pager"><section class="deck-page" data-page-key="group:group-1"><div data-region="card-list">${rows(entries)}</div></section></div>
    <button data-action="content/review"${entries.some((entry) => entry.membership?.starredAt) ? "" : " disabled"}>Review</button>
  ` : "";
  return {
    getDeckPages: (entries, groups) => [
      ...groups.map((group) => ({ key: `group:${group.id}` })),
      { key: "vocab" },
    ],
    normalizePageKey: (_entries, groups, requested) => {
      const keys = [...groups.map((group) => `group:${group.id}`), "vocab"];
      return keys.includes(requested) ? requested : keys[0];
    },
    renderBrowseBody: () => "",
    renderBrowseCardsHTML: (_deck, entries) => rows(entries),
    renderDeckBody: body,
    renderDeckPager: (_deck, entries) => `<div data-region="deck-pager"><section class="deck-page" data-page-key="group:group-1"><div data-region="card-list">${rows(entries)}</div></section></div>`,
  };
});

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
  const unbind = contentPane.bindEvents(rootEl, host);
  const result = { ui, stageEl, rootEl, unbind };
  mounted.push(result);
  return result;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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
  it("uses the returned timestamp and patches every occurrence of the identity", async () => {
    const view = mountPane();
    view.ui.transition("content/select-deck", { id: "d1" });
    await flush();

    view.rootEl.querySelector('.card-star[data-entry-key="occ-1"]').click();
    await flush();

    expect(mocks.toggleCardStar).toHaveBeenCalledWith("d1", { cardId: "shared-card" });
    expect(view.ui.get("content").cards.map((entry) => entry.membership.starredAt))
      .toEqual([
        "2026-03-01T00:00:00.000Z",
        "2026-03-01T00:00:00.000Z",
      ]);
    expect([...view.rootEl.querySelectorAll(".card-star")]
      .map((button) => button.getAttribute("aria-pressed")))
      .toEqual(["true", "true"]);
    expect([...view.rootEl.querySelectorAll(".card-star")]
      .map((button) => button.getAttribute("aria-label")))
      .toEqual(["Unstar: go ahead", "Unstar: after you"]);
    expect(view.rootEl.querySelector('[data-action="content/review"]').disabled).toBe(false);
  });

  it("does not patch a newly selected phrasebook after an in-flight toggle", async () => {
    const pending = deferred();
    mocks.toggleCardStar.mockReturnValue(pending.promise);
    const view = mountPane();
    view.ui.transition("content/select-deck", { id: "d1" });
    await flush();

    view.rootEl.querySelector('.card-star[data-entry-key="occ-1"]').click();
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
    view.ui.transition("content/select-deck", { id: "d1" });
    await flush();

    view.rootEl.querySelector('.card-star[data-entry-key="occ-1"]').click();
    await flush();

    expect([...view.rootEl.querySelectorAll(".card-star")]
      .map((button) => button.getAttribute("aria-pressed")))
      .toEqual(["false", "false"]);
    expect(view.rootEl.querySelector('[data-region="content-error"]').textContent)
      .toBe("storage unavailable");
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
  it("persists the complete repeated-occurrence order before leaving edit mode", async () => {
    const view = mountPane();
    view.ui.transition("content/select-deck", { id: "d1" });
    await flush();
    view.ui.transition("content/enter-edit");
    view.ui.transition("content/reorder", { pageOrder: ["occ-2", "occ-1"] });

    view.rootEl.querySelector('[data-action="content/done"]').click();
    await flush();

    expect(mocks.updateDeckEntryOrder).toHaveBeenCalledWith("d1", ["occ-2", "occ-1"]);
    expect(view.ui.get("content").cards.map((entry) => entry.key))
      .toEqual(["occ-2", "occ-1"]);
    expect(view.ui.get("content").editMode).toBe(false);
  });

  it("keeps edit mode active and shows an atomic save failure", async () => {
    mocks.updateDeckEntryOrder.mockRejectedValue(new Error("write failed"));
    const view = mountPane();
    view.ui.transition("content/select-deck", { id: "d1" });
    await flush();
    view.ui.transition("content/enter-edit");
    view.ui.transition("content/reorder", { pageOrder: ["occ-2", "occ-1"] });

    view.rootEl.querySelector('[data-action="content/done"]').click();
    await flush();

    expect(view.ui.get("content").editMode).toBe(true);
    expect(view.rootEl.querySelector('[data-region="content-error"]').textContent)
      .toBe("write failed");
  });
});

describe("preview commit", () => {
  const draftGroups = [{
    id: "draft-group",
    phrases: [{
      id: "draft-occurrence",
      card: { type: "phrase", lang: "ja", text: "こんにちは", translation: "hello" },
    }],
    vocab: [],
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
