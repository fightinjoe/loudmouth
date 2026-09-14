// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createDeck, deleteDeck, importCards } = vi.hoisted(() => ({
  createDeck: vi.fn(async (name, lang, opts) => ({
    id: "001-salsa-dancing",
    name,
    lang,
    ability: opts?.ability || "beginner",
  })),
  deleteDeck: vi.fn(async () => {}),
  importCards: vi.fn(async () => {}),
}));
vi.mock("../js/db.js", () => ({ createDeck, deleteDeck, importCards }));

const { getContext, generatePhrasebook, getPhrasebookTitle } = vi.hoisted(() => ({
  getContext: vi.fn(),
  getPhrasebookTitle: vi.fn(),
  generatePhrasebook: vi.fn(),
}));
vi.mock("../js/phrasebook-api.js", () => ({ getContext, generatePhrasebook, getPhrasebookTitle }));

import { openCreationPanel } from "../components/creation-panel.js";

const sampleQuestionsResponse = {
  questions: [
    { label: "Salsa scene", options: ["Latin America (neutral)", "Cuban style"] },
  ],
  checklist: [
    { label: "Ask someone to dance", checked: true },
    { label: "Dance/step vocabulary", checked: false },
  ],
};

const sampleGenerateResponse = {
  title: "Salsa Social Dancing",
  groups: [
    {
      title: "Ask someone to dance",
      cards: [
        { lang: "es", type: "phrase", text: "¿Bailas?", translation: "Wanna dance?", reading: [["¿Bailas?", null]], context: "Ask someone to dance" },
      ],
      vocab: [
        { lang: "es", type: "word", text: "bailar", translation: "dance", reading: [["bailar", null]], context: "Ask someone to dance", notes: { source: "¿Bailas?" } },
      ],
    },
    {
      title: "Dance/step vocabulary",
      cards: [
        { lang: "es", type: "phrase", text: "Paso básico", translation: "Basic step", reading: [["Paso básico", null]], context: "Dance/step vocabulary" },
      ],
      vocab: [
        { lang: "es", type: "word", text: "paso", translation: "step", reading: [["paso", null]], context: "Dance/step vocabulary", notes: { source: "Paso básico" } },
      ],
    },
  ],
};

let appEl;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  appEl = document.createElement("div");
  document.body.appendChild(appEl);
  localStorage.clear();
  createDeck.mockClear();
  deleteDeck.mockClear();
  importCards.mockClear();
  getContext.mockReset();
  getPhrasebookTitle.mockReset();
  getPhrasebookTitle.mockReturnValue(new Promise(() => {}));
  generatePhrasebook.mockReset();
  generatePhrasebook.mockReturnValue(new Promise(() => {}));
});

function typeAndSubmitTopic(el, topic) {
  const inputEl = el.querySelector(".creation-input-field");
  inputEl.value = topic;
  inputEl.dispatchEvent(new Event("input"));
  el.querySelector('[data-action="creation/submit-topic"]').click();
}

// Advance from the questions page (page 1) to the checklist page (page 2).
function gotoChecklist(el) {
  el.querySelector('[data-action="creation/to-checklist"]').click();
}

describe("openCreationPanel — topic entry", () => {
  it("renders the language flag/name and an empty field", () => {
    openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    expect(appEl.querySelector(".pane-header-title").textContent).toContain("Spanish");
    expect(appEl.querySelector(".creation-input-field").value).toBe("");
  });

  it("submit button is disabled until the topic has a value", () => {
    openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    expect(appEl.querySelector('[data-action="creation/submit-topic"]').disabled).toBe(true);
    const inputEl = appEl.querySelector(".creation-input-field");
    inputEl.value = "salsa dancing";
    inputEl.dispatchEvent(new Event("input"));
    expect(appEl.querySelector('[data-action="creation/submit-topic"]').disabled).toBe(false);
  });

  it("back/close dismisses the whole pane", () => {
    let dismissed = false;
    openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => { dismissed = true; });
    const panel = appEl.querySelector(".creation-panel");
    appEl.querySelector('[data-action="creation/back"]').click();
    panel.dispatchEvent(new Event("transitionend"));
    expect(dismissed).toBe(true);
  });

  it("shows a loading skeleton while context questions are loading", async () => {
    let resolveContext;
    getContext.mockReturnValueOnce(new Promise((res) => { resolveContext = res; }));
    openCreationPanel(appEl, { lang: "es", ability: "advanced" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");

    expect(appEl.querySelector(".creation-skeleton-list")).toBeTruthy();

    resolveContext(sampleQuestionsResponse);
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")).toBeTruthy());
  });

  it("shows an error message when context loading rejects", async () => {
    getContext.mockRejectedValueOnce(new Error("LLM request failed"));
    openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".creation-error")).toBeTruthy(), { timeout: 2000 });
    expect(appEl.querySelector(".creation-error").textContent).toContain("LLM request failed");
  });
});

describe("openCreationPanel — context questions + checklist", () => {
  async function openWithQuestions(response = sampleQuestionsResponse) {
    getContext.mockResolvedValueOnce(response);
    openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")).toBeTruthy());
  }

  it("renders one select per question, pre-filled with its first option", async () => {
    await openWithQuestions();
    const select = appEl.querySelector(".creation-select");
    expect(select.value).toBe("Latin America (neutral)");
  });

  it("renders the checklist with pre-checked defaults", async () => {
    await openWithQuestions();
    gotoChecklist(appEl);
    const items = appEl.querySelectorAll(".creation-checklist-item");
    expect(items).toHaveLength(2);
    expect(items[0].dataset.checked).toBe("true");
    expect(items[1].dataset.checked).toBe("false");
  });

  it("tapping a checklist item toggles its checked state", async () => {
    await openWithQuestions();
    gotoChecklist(appEl);
    appEl.querySelectorAll('[data-action="creation/toggle-checklist-item"]')[1].click();
    const items = appEl.querySelectorAll(".creation-checklist-item");
    expect(items[1].dataset.checked).toBe("true");
  });

  it("keeps at least one checklist topic selected", async () => {
    await openWithQuestions();
    gotoChecklist(appEl);
    appEl.querySelectorAll('[data-action="creation/toggle-checklist-item"]')[0].click();
    expect(appEl.querySelectorAll(".creation-checklist-item")[0].dataset.checked).toBe("true");
  });

  it("allows no more than eight checklist topics to be selected", async () => {
    const checklist = Array.from({ length: 9 }, (_, index) => ({
      label: `Topic ${index + 1}`,
      checked: index === 0,
    }));
    await openWithQuestions({ ...sampleQuestionsResponse, checklist });
    gotoChecklist(appEl);
    const items = appEl.querySelectorAll('[data-action="creation/toggle-checklist-item"]');
    for (let index = 1; index < items.length; index += 1) items[index].click();
    const selected = [...appEl.querySelectorAll(".creation-checklist-item")]
      .filter((item) => item.dataset.checked === "true");
    expect(selected).toHaveLength(8);
  });


  it("renders hostile model-provided labels and option values literally", async () => {
    const hostileLabel = 'label"><img src=x onerror="window.__injected=true">';
    const hostileOption = 'option" autofocus onfocus="window.__injected=true';
    await openWithQuestions({
      questions: [{ label: hostileLabel, options: [hostileOption] }],
      checklist: [{ label: hostileLabel, checked: true }],
    });

    const select = appEl.querySelector(".creation-select");
    expect(appEl.querySelector("img")).toBeNull();
    expect(appEl.querySelector(".creation-select-label").textContent).toBe(hostileLabel);
    expect(select.dataset.label).toBe(hostileLabel);
    const option = select.querySelector("option");
    expect(select.value).toBe(hostileOption);
    expect(option.textContent).toBe(hostileOption);
    expect(option.hasAttribute("autofocus")).toBe(false);
    expect(option.hasAttribute("onfocus")).toBe(false);

    gotoChecklist(appEl);
    expect(appEl.querySelector(".creation-checklist-item").textContent).toContain(hostileLabel);
    expect(appEl.querySelector("img")).toBeNull();
  });
});

describe("openCreationPanel — generate + commit", () => {
  async function openReadyToGenerate() {
    getContext.mockResolvedValueOnce(sampleQuestionsResponse);
    openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")).toBeTruthy());
  }


  it("on success, creates the deck and imports every card in one shot, then calls onCreated", async () => {
    getPhrasebookTitle.mockResolvedValueOnce({ title: "Salsa Social Dancing" });
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    let createdDeck = null;
    openCreationPanel(appEl, { lang: "es", ability: "beginner" }, (deck) => { createdDeck = deck; }, () => {});
    getContext.mockResolvedValueOnce(sampleQuestionsResponse);
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")).toBeTruthy());

    gotoChecklist(appEl);
    appEl.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(createDeck).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(createDeck).toHaveBeenCalledWith("Salsa Social Dancing", "es", { ability: "beginner" });

    await vi.waitFor(() => expect(importCards).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const [cards, deckId] = importCards.mock.calls[0];
    expect(deckId).toBe("001-salsa-dancing");
    expect(cards).toHaveLength(2);
    expect(cards[0].context).toBe("Ask someone to dance");
    expect(cards[0].text).toBe("¿Bailas?");
    expect(cards[1]).toMatchObject({
      type: "word",
      translation: "dance",
      context: "Ask someone to dance",
      notes: { source: "¿Bailas?" },
    });

    await vi.waitFor(() => expect(createdDeck).toBeTruthy());
    expect(createdDeck.id).toBe("001-salsa-dancing");
  });

  it("shows an error and does not create a deck when phrasebook generation rejects", async () => {
    generatePhrasebook.mockRejectedValueOnce(new Error("LLM request failed"));
    await openReadyToGenerate();
    gotoChecklist(appEl);
    appEl.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(appEl.querySelector(".creation-error")).toBeTruthy(), { timeout: 2000 });
    expect(appEl.querySelector(".creation-error").textContent).toContain("LLM request failed");
    expect(createDeck).not.toHaveBeenCalled();
    expect(importCards).not.toHaveBeenCalled();
  });

  it("falls back to the raw topic without waiting for a pending title", async () => {
    generatePhrasebook.mockResolvedValueOnce({ groups: sampleGenerateResponse.groups });
    await openReadyToGenerate();
    gotoChecklist(appEl);
    appEl.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(createDeck).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(createDeck).toHaveBeenCalledWith("salsa dancing", "es", { ability: "beginner" });
  });
});

describe("openCreationPanel — speculative generation lifecycle", () => {
  async function openQuestions({
    response = sampleQuestionsResponse,
    onCreated = () => {},
    onDismiss = () => {},
  } = {}) {
    getContext.mockResolvedValueOnce(response);
    const sheet = openCreationPanel(
      appEl,
      { lang: "es", ability: "beginner" },
      onCreated,
      onDismiss,
    );
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")).toBeTruthy());
    return sheet;
  }

  it("starts once on checklist advance with all topics and a copy of the answers, without saving early", async () => {
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    await openQuestions();
    const select = appEl.querySelector(".creation-select");
    select.value = "Cuban style";
    select.dispatchEvent(new Event("change"));

    gotoChecklist(appEl);

    expect(generatePhrasebook).toHaveBeenCalledTimes(1);
    const request = generatePhrasebook.mock.calls[0][0];
    expect(request).toMatchObject({
      seed: "salsa dancing",
      language: "es",
      answers: { "Salsa scene": "Cuban style" },
      checklist: ["Ask someone to dance", "Dance/step vocabulary"],
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    await Promise.resolve();
    expect(appEl.querySelector(".creation-checklist")).toBeTruthy();
    expect(createDeck).not.toHaveBeenCalled();
    expect(importCards).not.toHaveBeenCalled();

    appEl.querySelector('[data-action="creation/back"]').click();
    const changedSelect = appEl.querySelector(".creation-select");
    changedSelect.value = "Latin America (neutral)";
    changedSelect.dispatchEvent(new Event("change"));
    expect(request.answers).toEqual({ "Salsa scene": "Cuban style" });
  });

  it("reuses the same pending and ready result when navigating back without changes", async () => {
    const phrasebook = deferred();
    generatePhrasebook.mockReturnValueOnce(phrasebook.promise);
    await openQuestions();

    gotoChecklist(appEl);
    const signal = generatePhrasebook.mock.calls[0][0].signal;
    appEl.querySelector('[data-action="creation/back"]').click();
    gotoChecklist(appEl);
    expect(generatePhrasebook).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(false);

    phrasebook.resolve(sampleGenerateResponse);
    await Promise.resolve();
    await Promise.resolve();
    appEl.querySelector('[data-action="creation/back"]').click();
    gotoChecklist(appEl);
    expect(generatePhrasebook).toHaveBeenCalledTimes(1);
    expect(createDeck).not.toHaveBeenCalled();
  });

  it("aborts on answer changes and ignores a superseded response that resolves late", async () => {
    const oldRequest = deferred();
    const newRequest = deferred();
    generatePhrasebook
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    await openQuestions();

    gotoChecklist(appEl);
    const oldSignal = generatePhrasebook.mock.calls[0][0].signal;
    appEl.querySelector('[data-action="creation/back"]').click();
    const select = appEl.querySelector(".creation-select");
    select.value = "Cuban style";
    select.dispatchEvent(new Event("change"));
    expect(oldSignal.aborted).toBe(true);

    gotoChecklist(appEl);
    expect(generatePhrasebook).toHaveBeenCalledTimes(2);
    oldRequest.resolve({ ...sampleGenerateResponse, title: "Stale title" });
    await Promise.resolve();
    await Promise.resolve();
    expect(createDeck).not.toHaveBeenCalled();

    appEl.querySelector('[data-action="creation/submit-context"]').click();
    newRequest.resolve({ ...sampleGenerateResponse, title: "Current title" });
    await vi.waitFor(() => expect(createDeck).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(createDeck).toHaveBeenCalledWith("salsa dancing", "es", { ability: "beginner" });
  });

  it("aborts speculative work when the seed changes and starts fresh for the new seed", async () => {
    const nextContext = {
      questions: [{ label: "Bachata style", options: ["Dominican", "Modern"] }],
      checklist: [{ label: "Invite a partner", checked: true }],
    };
    getContext
      .mockResolvedValueOnce(sampleQuestionsResponse)
      .mockResolvedValueOnce(nextContext);
    openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")).toBeTruthy());
    gotoChecklist(appEl);
    const oldSignal = generatePhrasebook.mock.calls[0][0].signal;

    appEl.querySelector('[data-action="creation/back"]').click();
    appEl.querySelector('[data-action="creation/back"]').click();
    const input = appEl.querySelector(".creation-input-field");
    input.value = "bachata dancing";
    input.dispatchEvent(new Event("input"));
    expect(oldSignal.aborted).toBe(true);
    appEl.querySelector('[data-action="creation/submit-topic"]').click();
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")?.dataset.label).toBe("Bachata style"));
    gotoChecklist(appEl);

    expect(generatePhrasebook).toHaveBeenCalledTimes(2);
    expect(generatePhrasebook.mock.calls[1][0]).toMatchObject({
      seed: "bachata dancing",
      answers: { "Bachata style": "Dominican" },
      checklist: ["Invite a partner"],
    });
  });

  it("aborts a dismissed context request and ignores its late response", async () => {
    const context = deferred();
    getContext.mockReturnValueOnce(context.promise);
    let dismissed = false;
    openCreationPanel(
      appEl,
      { lang: "es", ability: "beginner" },
      () => {},
      () => { dismissed = true; },
    );
    typeAndSubmitTopic(appEl, "salsa dancing");
    const signal = getContext.mock.calls[0][0].signal;

    const panel = appEl.querySelector(".creation-panel");
    appEl.querySelector('[data-action="creation/back"]').click();
    expect(signal.aborted).toBe(true);
    context.resolve(sampleQuestionsResponse);
    await Promise.resolve();
    await Promise.resolve();
    expect(appEl.querySelector(".creation-select")).toBeNull();
    expect(createDeck).not.toHaveBeenCalled();

    panel.dispatchEvent(new Event("transitionend"));
    expect(dismissed).toBe(true);
  });

  it("aborts phrasebook generation on dismissal and never persists its late response", async () => {
    const phrasebook = deferred();
    generatePhrasebook.mockReturnValueOnce(phrasebook.promise);
    await openQuestions();
    gotoChecklist(appEl);
    const signal = generatePhrasebook.mock.calls[0][0].signal;
    appEl.querySelector('[data-action="creation/submit-context"]').click();

    appEl.querySelector('[data-action="creation/back"]').click();
    expect(signal.aborted).toBe(true);
    phrasebook.resolve(sampleGenerateResponse);
    await Promise.resolve();
    await Promise.resolve();
    expect(createDeck).not.toHaveBeenCalled();
    expect(importCards).not.toHaveBeenCalled();
  });

  it("rolls back a deck if dismissal wins the persistence race", async () => {
    const deckCreation = deferred();
    createDeck.mockReturnValueOnce(deckCreation.promise);
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    let created = false;
    await openQuestions({ onCreated: () => { created = true; } });
    gotoChecklist(appEl);
    appEl.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(createDeck).toHaveBeenCalledTimes(1), { timeout: 2000 });

    appEl.querySelector('[data-action="creation/back"]').click();
    deckCreation.resolve({
      id: "001-racing-deck",
      name: "Salsa Social Dancing",
      lang: "es",
      ability: "beginner",
    });

    await vi.waitFor(() => expect(deleteDeck).toHaveBeenCalledWith("001-racing-deck"));
    expect(importCards).not.toHaveBeenCalled();
    expect(created).toBe(false);
  });

  it("keeps background errors off the checklist, then surfaces on Continue and retries with choices intact", async () => {
    generatePhrasebook
      .mockRejectedValueOnce(new Error("LLM request failed"))
      .mockResolvedValueOnce(sampleGenerateResponse);
    await openQuestions();
    gotoChecklist(appEl);
    appEl.querySelectorAll('[data-action="creation/toggle-checklist-item"]')[1].click();
    await Promise.resolve();
    await Promise.resolve();

    expect(appEl.querySelector(".creation-checklist")).toBeTruthy();
    expect(appEl.querySelector(".creation-error")).toBeNull();
    appEl.querySelector('[data-action="creation/submit-context"]').click();
    expect(appEl.querySelector(".creation-error").textContent).toContain("LLM request failed");

    appEl.querySelector('[data-action="creation/retry"]').click();
    expect(generatePhrasebook).toHaveBeenCalledTimes(2);
    const choices = [...appEl.querySelectorAll(".creation-checklist-item")]
      .map((item) => item.dataset.checked);
    expect(choices).toEqual(["true", "true"]);
    await Promise.resolve();
    await Promise.resolve();
    appEl.querySelector('[data-action="creation/submit-context"]').click();

    await vi.waitFor(() => expect(importCards).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(importCards.mock.calls[0][0]).toHaveLength(4);
  });

  it("coalesces repeated final Continue clicks into one save", async () => {
    const phrasebook = deferred();
    generatePhrasebook.mockReturnValueOnce(phrasebook.promise);
    await openQuestions();
    gotoChecklist(appEl);
    const continueButton = appEl.querySelector('[data-action="creation/submit-context"]');
    continueButton.click();
    continueButton.click();
    phrasebook.resolve(sampleGenerateResponse);

    await vi.waitFor(() => expect(importCards).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(generatePhrasebook).toHaveBeenCalledTimes(1);
    expect(createDeck).toHaveBeenCalledTimes(1);
  });
});

describe("openCreationPanel — selected-topic vocabulary", () => {
  it("selects duplicate-titled groups by index, preserves provenance, deduplicates, and caps pooled vocab", async () => {
    const phrase = (text, context) => ({
      lang: "es",
      type: "phrase",
      text,
      translation: `${text} translation`,
      reading: [[text, null]],
      context,
    });
    const word = (translation, context, source) => ({
      lang: "es",
      type: "word",
      text: `${translation} target`,
      translation,
      reading: [[`${translation} target`, null]],
      context,
      notes: { source },
    });
    const response = {
      title: "Duplicate topics",
      groups: [
        {
          title: "Same title",
          cards: [phrase("first phrase", "first context")],
          vocab: ["coffee", "one", "two", "three", "four", "five"]
            .map((translation) => word(translation, "first context", "first phrase")),
        },
        {
          title: "Same title",
          cards: [phrase("unselected phrase", "middle context")],
          vocab: [word("unselected", "middle context", "unselected phrase")],
        },
        {
          title: "Same title",
          cards: [phrase("third phrase", "third context")],
          vocab: ["ＣＯＦＦＥＥ", "six", "seven", "eight", "nine", "ten", "eleven"]
            .map((translation) => word(translation, "third context", "third phrase")),
        },
      ],
    };
    getContext.mockResolvedValueOnce({
      questions: [{ label: "Style", options: ["Any"] }],
      checklist: [
        { label: "Same title", checked: true },
        { label: "Same title", checked: false },
        { label: "Same title", checked: false },
      ],
    });
    generatePhrasebook.mockResolvedValueOnce(response);
    openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "duplicate topics");
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")).toBeTruthy());
    gotoChecklist(appEl);
    appEl.querySelectorAll('[data-action="creation/toggle-checklist-item"]')[2].click();
    appEl.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(importCards).toHaveBeenCalledTimes(1), { timeout: 2000 });

    expect(generatePhrasebook.mock.calls[0][0].checklist).toEqual([
      "Same title",
      "Same title",
      "Same title",
    ]);
    const [cards] = importCards.mock.calls[0];
    expect(cards.filter((card) => card.type === "phrase").map((card) => card.text)).toEqual([
      "first phrase",
      "third phrase",
    ]);
    const vocabulary = cards.filter((card) => card.type === "word");
    expect(vocabulary.map((card) => card.translation)).toEqual([
      "coffee",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
    ]);
    expect(vocabulary).toHaveLength(10);
    expect(vocabulary[0]).toMatchObject({
      translation: "coffee",
      context: "first context",
      notes: { source: "first phrase" },
    });
    expect(cards.some((card) => card.text === "unselected phrase")).toBe(false);
    expect(cards.some((card) => card.translation === "unselected")).toBe(false);
  });

  it("applies the absolute 24-card vocabulary ceiling when five or more topics are selected", async () => {
    const groups = Array.from({ length: 5 }, (_, groupIndex) => ({
      title: `Topic ${groupIndex}`,
      cards: [{
        lang: "es",
        type: "phrase",
        text: `phrase ${groupIndex}`,
        translation: `phrase ${groupIndex}`,
        reading: [[`phrase ${groupIndex}`, null]],
        context: `Topic ${groupIndex}`,
      }],
      vocab: Array.from({ length: 6 }, (_, wordIndex) => ({
        lang: "es",
        type: "word",
        text: `word ${groupIndex}-${wordIndex}`,
        translation: `word ${groupIndex}-${wordIndex}`,
        reading: [[`word ${groupIndex}-${wordIndex}`, null]],
        context: `Topic ${groupIndex}`,
        notes: { source: `phrase ${groupIndex}` },
      })),
    }));
    getContext.mockResolvedValueOnce({
      questions: [{ label: "Style", options: ["Any"] }],
      checklist: groups.map((group) => ({ label: group.title, checked: true })),
    });
    generatePhrasebook.mockResolvedValueOnce({ title: "Many topics", groups });
    openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "many topics");
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")).toBeTruthy());
    gotoChecklist(appEl);
    appEl.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(importCards).toHaveBeenCalledTimes(1), { timeout: 2000 });

    const vocabulary = importCards.mock.calls[0][0].filter((card) => card.type === "word");
    expect(vocabulary).toHaveLength(24);
    expect(vocabulary.at(-1).translation).toBe("word 3-5");
  });
});


describe("openCreationPanel — independent title lifecycle", () => {
  async function openQuestions() {
    getContext.mockResolvedValueOnce(sampleQuestionsResponse);
    const sheet = openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")).toBeTruthy());
    return sheet;
  }

  it("starts naming and context together; dismissal aborts both", () => {
    getContext.mockReturnValueOnce(new Promise(() => {}));
    const sheet = openCreationPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getPhrasebookTitle).toHaveBeenCalledTimes(1);
    expect(getPhrasebookTitle.mock.calls[0][0]).toEqual({ seed: "salsa dancing", signal: expect.any(AbortSignal) });
    sheet.close();
    expect(getContext.mock.calls[0][0].signal.aborted).toBe(true);
    expect(getPhrasebookTitle.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it.each(["failure", "invalid", "late"])("saves the seed for a %s title and never renames it", async (mode) => {
    const title = deferred();
    getPhrasebookTitle.mockReturnValueOnce(title.promise);
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    await openQuestions();
    if (mode === "failure") title.reject(new Error("Title unavailable"));
    if (mode === "invalid") title.resolve({ title: 42 });
    gotoChecklist(appEl);
    appEl.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(importCards).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(createDeck).toHaveBeenCalledWith("salsa dancing", "es", { ability: "beginner" });
    expect(getPhrasebookTitle.mock.calls[0][0].signal.aborted).toBe(true);
    title.resolve({ title: "Too Late" });
    await Promise.resolve();
    expect(createDeck).toHaveBeenCalledTimes(1);
    expect(appEl.querySelector(".creation-error")).toBeNull();
  });

  it("retains the title across answer changes and ignores titles in card responses", async () => {
    getPhrasebookTitle.mockResolvedValueOnce({ title: "Salsa Nights 💃" });
    generatePhrasebook.mockResolvedValue(sampleGenerateResponse);
    await openQuestions();
    gotoChecklist(appEl);
    appEl.querySelector('[data-action="creation/back"]').click();
    const select = appEl.querySelector(".creation-select");
    select.value = "Cuban style";
    select.dispatchEvent(new Event("change"));
    gotoChecklist(appEl);
    appEl.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(createDeck).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(createDeck).toHaveBeenCalledWith("Salsa Nights 💃", "es", { ability: "beginner" });
    expect(getPhrasebookTitle).toHaveBeenCalledTimes(1);
    expect(generatePhrasebook).toHaveBeenCalledTimes(2);
    expect(generatePhrasebook.mock.calls[1][0]).not.toHaveProperty("title");
  });

  it("replaces naming on a new seed and ignores the old response", async () => {
    const oldTitle = deferred();
    getPhrasebookTitle.mockReturnValueOnce(oldTitle.promise).mockResolvedValueOnce({ title: "Bachata Nights" });
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    await openQuestions();
    appEl.querySelector('[data-action="creation/back"]').click();
    getContext.mockResolvedValueOnce(sampleQuestionsResponse);
    typeAndSubmitTopic(appEl, "bachata dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".creation-select")).toBeTruthy());
    expect(getPhrasebookTitle.mock.calls[0][0].signal.aborted).toBe(true);
    oldTitle.resolve({ title: "Stale Salsa" });
    gotoChecklist(appEl);
    appEl.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(createDeck).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(createDeck).toHaveBeenCalledWith("Bachata Nights", "es", { ability: "beginner" });
  });
});
