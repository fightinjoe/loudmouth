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
  setDeckIllustration: vi.fn(),
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
    essentials: [{
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
    dialogue: [
      {speaker:"you",card:{lang:"ja",type:"phrase",text:"駅はどこですか",translation:"Where is the station?",reading:[["駅","えき"],["はどこですか",null]]}},
      {speaker:"partner",card:{lang:"ja",type:"phrase",text:"まっすぐ行ってください",translation:"Please go straight.",reading:[["まっすぐ",null],["行","い"],["ってください",null]]}},
    ],
  }],
};

describe("action pane — suggested phrasebook preview", () => {
  it("keeps section occurrences and repeated topic words distinct while sharing canonical cards", () => {
    const repeated = {
      ...suggestion,
      groups: [
        { ...suggestion.groups[0], title: "Same title" },
        { ...suggestion.groups[0], title: "Same title" },
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
    expect(new Set(cards.map((entry) => entry.key)).size).toBe(8);
    const essential = cards.filter((entry) => entry.occurrence?.section === "essentials");
    const dialogue = cards.filter((entry) => entry.occurrence?.section === "dialogue");
    expect(essential).toHaveLength(2);
    expect(dialogue).toHaveLength(4);
    expect(essential.every((entry) => !("speaker" in entry.occurrence))).toBe(true);
    expect(dialogue.map((entry) => entry.occurrence.speaker)).toEqual(["you","partner","you","partner"]);
    expect(essential[0].cardId).toBe(dialogue[1].cardId);
    expect(essential[0].occurrence.translation).toBe("please go straight");
    expect(dialogue[1].occurrence.translation).toBe("Please go straight.");
    const words = cards.filter((entry) => entry.wordPlacement);
    expect(words).toHaveLength(2);
    expect(words[0].cardId).toBe(words[1].cardId);
    expect(words.map((entry) => entry.wordPlacement.groupId)).toEqual(deck.draftGroups.map((group) => group.id));
    expect(words.map((entry) => entry.wordPlacement.position)).toEqual([0,0]);
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
