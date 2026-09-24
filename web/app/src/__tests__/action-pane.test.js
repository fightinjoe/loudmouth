// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.mock("../js/db", () => ({
  updateDeckMode: vi.fn(),
  updateDeckName: vi.fn(),
  updateDeckOrder: vi.fn(),
  updateDeckReadingDisplay: vi.fn(),
  deleteDeck: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  commitPhrasebook: vi.fn(),
}));

import actionPane from "../panes/action-pane";
import { createDelegate } from "../js/delegate";
import { createHost, createUIState } from "../js/uiState";
import { openBottomSheet } from "../components/bottom-sheet";

function mountPane() {
  const ui = createUIState({
    action: actionPane.initialState,
    content: { deck: null, cards: [], deckId: null },
    shell: { exposed: "foreground" },
  });
  ui.registerTransitions(actionPane.transitions);
  ui.registerTransitions({
    "shell/close": () => ({ exposed: "foreground" }),
    "shell/open": () => ({ exposed: "background" }),
    "nav/reload": (slice) => slice,
    "content/select-deck": (slice, { id }) => ({ ...slice, deckId: id }),
    "content/loaded": (slice, payload) => ({
      ...slice,
      deck: payload.deck,
      cards: payload.cards,
    }),
    "content/reload-deck": (slice) => slice,
  });

  const rootEl = document.createElement("div");
  rootEl.innerHTML = actionPane.render();
  document.body.appendChild(rootEl);

  const stageEl = document.createElement("div");
  const host = createHost({ ui, delegate: createDelegate(rootEl), stageEl });
  actionPane.bindEvents(rootEl, host);
  return { ui, rootEl };
}

const suggestion = {
  id: "seed-directions-ja",
  emoji: "🧭",
  title: "Directions",
  lang: "ja",
  groups: [{
    title: "On the street",
    phrases: [{
      lang: "ja",
      type: "phrase",
      text: "まっすぐ行ってください",
      translation: "please go straight",
      reading: [["まっすぐ", null], ["行", "い"], ["ってください", null]],
    }],
    vocab: [{
      card: {
        lang: "ja",
        type: "word",
        text: "右",
        translation: "right",
        reading: [["右", "みぎ"]],
        partOfSpeech: "noun",
        senseKey: "right-direction",
      },
    }],
  }],
};

describe("action pane — suggested phrasebook preview", () => {
  it("builds fresh draft groups and joined preview entries without saved metadata", () => {
    const { ui, rootEl } = mountPane();

    ui.transition("action/open", {
      kind: "new-phrasebook",
      payload: { suggestion },
    });

    const ability = rootEl.querySelector('[data-action="new-phrasebook/ability"]');
    ability.value = "conversational";
    ability.dispatchEvent(new Event("change"));
    const createButton = rootEl.querySelector('[data-action="new-phrasebook/create"]');
    createButton.click();

    const content = ui.get("content");
    expect(content.deck).toEqual(expect.objectContaining({
      name: "Directions",
      lang: "ja",
      ability: "conversational",
      preview: true,
      seedId: "seed-directions-ja",
    }));
    expect(content.deck).not.toHaveProperty("createdAt");
    expect(content.deck).not.toHaveProperty("generation");
    expect(content.deck).not.toHaveProperty("system");
    expect(content.deck.id).toMatch(/^[0-9a-f-]{36}$/i);

    expect(content.deck.draftGroups).toHaveLength(1);
    const draftGroup = content.deck.draftGroups[0];
    expect(draftGroup).toEqual(expect.objectContaining({
      title: "On the street",
      phrases: [expect.objectContaining({ card: suggestion.groups[0].phrases[0] })],
      vocab: suggestion.groups[0].vocab,
    }));
    expect(draftGroup.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(draftGroup.phrases[0].id).toMatch(/^[0-9a-f-]{36}$/i);

    expect(content.cards).toHaveLength(2);
    const phraseEntry = content.cards.find((entry) => entry.card.type === "phrase");
    expect(phraseEntry).toEqual(expect.objectContaining({
      key: draftGroup.phrases[0].id,
      card: suggestion.groups[0].phrases[0],
      sources: [],
      occurrence: expect.objectContaining({
        id: draftGroup.phrases[0].id,
        deckId: content.deck.id,
        groupId: draftGroup.id,
        translation: "please go straight",
      }),
    }));
    expect(phraseEntry).not.toHaveProperty("membership");
    expect(phraseEntry).not.toHaveProperty("deckIds");

    const wordEntry = content.cards.find((entry) => entry.card.type === "word");
    expect(wordEntry.card).toEqual(suggestion.groups[0].vocab[0].card);
    expect(wordEntry.sources).toEqual([]);
    expect(wordEntry).not.toHaveProperty("membership");

  });

  it("assigns distinct occurrence IDs to repeated phrase drafts", () => {
    const repeated = {
      ...suggestion,
      groups: [
        { title: "First", phrases: [suggestion.groups[0].phrases[0]], vocab: [] },
        { title: "Second", phrases: [suggestion.groups[0].phrases[0]], vocab: [] },
      ],
    };
    const { ui, rootEl } = mountPane();
    ui.transition("action/open", {
      kind: "new-phrasebook",
      payload: { suggestion: repeated },
    });
    rootEl.querySelector('[data-action="new-phrasebook/create"]').click();

    const { deck, cards } = ui.get("content");
    expect(new Set(deck.draftGroups.map((group) => group.id)).size).toBe(2);
    expect(new Set(cards.map((entry) => entry.key)).size).toBe(2);
    expect(new Set(cards.map((entry) => entry.cardId)).size).toBe(1);
  });
});

describe("bottom-sheet dismissal", () => {
  it("cannot reopen or retain a sheet closed before its first animation frame", () => {
    const frames = [];
    vi.stubGlobal("requestAnimationFrame",callback=>{frames.push(callback);return frames.length;});
    const root = document.createElement("div");
    let dismissed = 0;
    try {
      const sheet = openBottomSheet(root,{kind:"creation",bodyHTML:"<button>Continue</button>",onClose:()=>dismissed++});
      sheet.close();
      while (frames.length) frames.shift()(0);
      expect(root.children).toHaveLength(0);
      expect(dismissed).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("removes an inactive closing sheet even when no transition event arrives", async () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    let dismissed = 0;
    try {
      const sheet = openBottomSheet(root,{kind:"review",bodyHTML:"<button>Reveal</button>",onClose:()=>dismissed++});
      sheet.panel.classList.add("bottom-sheet--visible");
      sheet.close();
      expect(sheet.panel.inert).toBe(true);
      await vi.advanceTimersByTimeAsync(400);
      sheet.close();
      expect(root.children).toHaveLength(0);
      expect(dismissed).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
