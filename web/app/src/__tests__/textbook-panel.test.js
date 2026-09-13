// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createDeck, importCards } = vi.hoisted(() => ({
  createDeck: vi.fn(async (name, lang, opts) => ({
    id: "001-salsa-dancing",
    name,
    lang,
    ability: opts?.ability || "beginner",
    formality: "polite",
    audience: "staff",
  })),
  importCards: vi.fn(async () => {}),
}));
vi.mock("../js/db.js", () => ({ createDeck, importCards }));

const { getContext, generatePhrasebook } = vi.hoisted(() => ({
  getContext: vi.fn(),
  generatePhrasebook: vi.fn(),
}));
vi.mock("../js/phrasebook-api.js", () => ({ getContext, generatePhrasebook }));

import { openTextbookPanel } from "../components/textbook-panel.js";

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
        { lang: "es", text: "¿Bailas?", translation: "Wanna dance?", reading: [["¿Bailas?", null]], context: "Accept or decline a dance" },
      ],
    },
  ],
};

let appEl;

beforeEach(() => {
  appEl = document.createElement("div");
  document.body.appendChild(appEl);
  localStorage.clear();
  createDeck.mockClear();
  importCards.mockClear();
  getContext.mockReset();
  generatePhrasebook.mockReset();
});

function typeAndSubmitTopic(el, topic) {
  const inputEl = el.querySelector(".textbook-input-field");
  inputEl.value = topic;
  inputEl.dispatchEvent(new Event("input"));
  el.querySelector('[data-action="textbook/submit-topic"]').click();
}

// Advance from the questions page (page 1) to the checklist page (page 2).
function gotoChecklist(el) {
  el.querySelector('[data-action="textbook/to-checklist"]').click();
}

describe("openTextbookPanel — topic entry", () => {
  it("renders the language flag/name and an empty field", () => {
    openTextbookPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    expect(appEl.querySelector(".pane-header-title").textContent).toContain("Spanish");
    expect(appEl.querySelector(".textbook-input-field").value).toBe("");
  });

  it("submit button is disabled until the topic has a value", () => {
    openTextbookPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    expect(appEl.querySelector('[data-action="textbook/submit-topic"]').disabled).toBe(true);
    const inputEl = appEl.querySelector(".textbook-input-field");
    inputEl.value = "salsa dancing";
    inputEl.dispatchEvent(new Event("input"));
    expect(appEl.querySelector('[data-action="textbook/submit-topic"]').disabled).toBe(false);
  });

  it("back/close dismisses the whole pane", () => {
    let dismissed = false;
    openTextbookPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => { dismissed = true; });
    const panel = appEl.querySelector(".textbook-panel");
    appEl.querySelector('[data-action="textbook/back"]').click();
    panel.dispatchEvent(new Event("transitionend"));
    expect(dismissed).toBe(true);
  });

  it("shows a loading skeleton while context questions are loading", async () => {
    let resolveContext;
    getContext.mockReturnValueOnce(new Promise((res) => { resolveContext = res; }));
    openTextbookPanel(appEl, { lang: "es", ability: "advanced" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");

    expect(appEl.querySelector(".textbook-skeleton-list")).toBeTruthy();

    resolveContext(sampleQuestionsResponse);
    await vi.waitFor(() => expect(appEl.querySelector(".textbook-select")).toBeTruthy());
  });

  it("shows an error message when context loading rejects", async () => {
    getContext.mockRejectedValueOnce(new Error("LLM request failed"));
    openTextbookPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".textbook-error")).toBeTruthy());
    expect(appEl.querySelector(".textbook-error").textContent).toContain("LLM request failed");
  });
});

describe("openTextbookPanel — context questions + checklist", () => {
  async function openWithQuestions(response = sampleQuestionsResponse) {
    getContext.mockResolvedValueOnce(response);
    openTextbookPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".textbook-select")).toBeTruthy());
  }

  it("renders one select per question, pre-filled with its first option", async () => {
    await openWithQuestions();
    const select = appEl.querySelector(".textbook-select");
    expect(select.value).toBe("Latin America (neutral)");
  });

  it("renders the checklist with pre-checked defaults", async () => {
    await openWithQuestions();
    gotoChecklist(appEl);
    const items = appEl.querySelectorAll(".textbook-checklist-item");
    expect(items).toHaveLength(2);
    expect(items[0].dataset.checked).toBe("true");
    expect(items[1].dataset.checked).toBe("false");
  });

  it("tapping a checklist item toggles its checked state", async () => {
    await openWithQuestions();
    gotoChecklist(appEl);
    appEl.querySelectorAll('[data-action="textbook/toggle-checklist-item"]')[1].click();
    const items = appEl.querySelectorAll(".textbook-checklist-item");
    expect(items[1].dataset.checked).toBe("true");
  });

  it("keeps at least one checklist topic selected", async () => {
    await openWithQuestions();
    gotoChecklist(appEl);
    appEl.querySelectorAll('[data-action="textbook/toggle-checklist-item"]')[0].click();
    expect(appEl.querySelectorAll(".textbook-checklist-item")[0].dataset.checked).toBe("true");
  });

  it("allows no more than eight checklist topics to be selected", async () => {
    const checklist = Array.from({ length: 9 }, (_, index) => ({
      label: `Topic ${index + 1}`,
      checked: index === 0,
    }));
    await openWithQuestions({ ...sampleQuestionsResponse, checklist });
    gotoChecklist(appEl);
    const items = appEl.querySelectorAll('[data-action="textbook/toggle-checklist-item"]');
    for (let index = 1; index < items.length; index += 1) items[index].click();
    const selected = [...appEl.querySelectorAll(".textbook-checklist-item")]
      .filter((item) => item.dataset.checked === "true");
    expect(selected).toHaveLength(8);
  });

});

describe("openTextbookPanel — generate + commit", () => {
  async function openReadyToGenerate() {
    getContext.mockResolvedValueOnce(sampleQuestionsResponse);
    openTextbookPanel(appEl, { lang: "es", ability: "beginner" }, () => {}, () => {});
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".textbook-select")).toBeTruthy());
  }


  it("on success, creates the deck and imports every card in one shot, then calls onCreated", async () => {
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    let createdDeck = null;
    openTextbookPanel(appEl, { lang: "es", ability: "beginner" }, (deck) => { createdDeck = deck; }, () => {});
    getContext.mockResolvedValueOnce(sampleQuestionsResponse);
    typeAndSubmitTopic(appEl, "salsa dancing");
    await vi.waitFor(() => expect(appEl.querySelector(".textbook-select")).toBeTruthy());

    gotoChecklist(appEl);
    appEl.querySelector('[data-action="textbook/submit-context"]').click();
    await vi.waitFor(() => expect(createDeck).toHaveBeenCalledTimes(1));
    expect(createDeck).toHaveBeenCalledWith("Salsa Social Dancing", "es", { ability: "beginner" });

    await vi.waitFor(() => expect(importCards).toHaveBeenCalledTimes(1));
    const [cards, deckId] = importCards.mock.calls[0];
    expect(deckId).toBe("001-salsa-dancing");
    expect(cards).toHaveLength(1);
    expect(cards[0].context).toBe("Accept or decline a dance");
    expect(cards[0].text).toBe("¿Bailas?");

    await vi.waitFor(() => expect(createdDeck).toBeTruthy());
    expect(createdDeck.id).toBe("001-salsa-dancing");
  });

  it("shows an error and does not create a deck when phrasebook generation rejects", async () => {
    generatePhrasebook.mockRejectedValueOnce(new Error("LLM request failed"));
    await openReadyToGenerate();
    gotoChecklist(appEl);
    appEl.querySelector('[data-action="textbook/submit-context"]').click();
    await vi.waitFor(() => expect(appEl.querySelector(".textbook-error")).toBeTruthy());
    expect(appEl.querySelector(".textbook-error").textContent).toContain("LLM request failed");
    expect(createDeck).not.toHaveBeenCalled();
    expect(importCards).not.toHaveBeenCalled();
  });

  it("falls back to the raw topic as the deck name when the API omits a title", async () => {
    generatePhrasebook.mockResolvedValueOnce({ groups: sampleGenerateResponse.groups });
    await openReadyToGenerate();
    gotoChecklist(appEl);
    appEl.querySelector('[data-action="textbook/submit-context"]').click();
    await vi.waitFor(() => expect(createDeck).toHaveBeenCalledTimes(1));
    expect(createDeck).toHaveBeenCalledWith("salsa dancing", "es", { ability: "beginner" });
  });
});
