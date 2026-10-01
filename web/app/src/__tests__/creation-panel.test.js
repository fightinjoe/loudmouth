// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

const { commitPhrasebook, setDeckIllustration } = vi.hoisted(() => ({
  commitPhrasebook: vi.fn(),
  setDeckIllustration: vi.fn(),
}));
vi.mock("../js/db", async (importOriginal) => ({
  ...(await importOriginal()),
  commitPhrasebook,
  setDeckIllustration,
}));

const { getContext, generatePhrasebook, getPhrasebookTitle, generatePhrasebookImage } = vi.hoisted(() => ({
  getContext: vi.fn(),
  getPhrasebookTitle: vi.fn(),
  generatePhrasebook: vi.fn(),
  generatePhrasebookImage: vi.fn(),
}));
vi.mock("../js/phrasebook-api", () => ({
  getContext,
  generatePhrasebook,
  getPhrasebookTitle,
  generatePhrasebookImage,
}));

import { createDb } from "../js/db";
import { getLastAbility, setLastAbility } from "../js/preferences";
import { ABILITY_QUESTION } from "../js/ability";
import { openCreationPanel } from "../components/creation-panel";

const usage = {
  model: "fixture",
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUsd: null,
  durationMs: 0,
};

const sampleQuestionsResponse = {
  imagePrompt: "An airy watercolor of dancing shoes beside a small radio.",
  usage,
  questions: [
    { label: "Salsa scene", options: ["Latin America (neutral)", "Cuban style"] },
  ],
  checklist: [
    { label: "Ask someone to dance", checked: true },
    { label: "Dance/step vocabulary", checked: false },
  ],
};

function phrase(id, text, translation, speaker = "you") {
  return { id, card: { type: "phrase", lang: "es", text, translation }, speaker };
}

function source(phraseDraft, start, end) {
  return {
    snapshot: {
      lang: phraseDraft.card.lang,
      text: phraseDraft.card.text,
      translation: phraseDraft.card.translation,
    },
    ref: { occurrenceId: phraseDraft.id },
    span: { start, end },
  };
}

function word(text, translation, senseKey, evidence) {
  return {
    card: {
      type: "word",
      lang: "es",
      text,
      translation,
      partOfSpeech: "noun",
      senseKey,
    },
    ...(evidence ? { sources: [evidence] } : {}),
  };
}

const firstPhrase = phrase("draft-phrase-1", "¿Bailas?", "Would you like to dance?");
const secondPhrase = phrase("draft-phrase-2", "Paso básico", "Basic step", "partner");
const sampleGenerateResponse = {
  schemaVersion: 3,
  title: "Provider title is not used for naming",
  groups: [
    {
      id: "draft-group-1",
      title: "Ask someone to dance",
      essentials: [{ id: "essential-1", card: { ...firstPhrase.card, text: "¿Quieres bailar?", translation: "Do you want to dance?" } }],
      dialogue: [firstPhrase, phrase("reply-1", "Sí, gracias.", "Yes, thank you.", "partner")],
      vocab: [word("bailar", "dance", "dance", source(firstPhrase, 1, 7))],
    },
    {
      id: "draft-group-2",
      title: "Dance/step vocabulary",
      essentials: [{ id: "essential-2", card: { ...secondPhrase.card } }],
      dialogue: [phrase("question-2", "¿Cuál es el paso?", "What is the step?"), secondPhrase],
      vocab: [word("paso", "step", "step", source(secondPhrase, 0, 4))],
    },
  ],
  usage,
  flags: [],
};

const committedDeck = {
  id: "committed-deck",
  name: "Salsa Social Dancing",
  lang: "es",
  createdAt: "2026-01-01T00:00:00.000Z",
  mode: "study",
  order: "default",
  readingDisplay: "reading",
  generation: {
    seed: "salsa dancing",
    ability: "none",
    answers: { "Salsa scene": "Latin America (neutral)" },
  },
};

let appElement;
let actualCommitPhrasebook;
let actualSetDeckIllustration;

beforeAll(async () => {
  ({ commitPhrasebook: actualCommitPhrasebook, setDeckIllustration: actualSetDeckIllustration } = await vi.importActual("../js/db"));
});

beforeEach(() => {
  document.body.innerHTML = "";
  appElement = document.createElement("div");
  document.body.appendChild(appElement);
  localStorage.clear();
  sessionStorage.clear();
  commitPhrasebook.mockReset();
  commitPhrasebook.mockResolvedValue(committedDeck);
  getContext.mockReset();
  getPhrasebookTitle.mockReset();
  getPhrasebookTitle.mockReturnValue(new Promise(() => {}));
  generatePhrasebook.mockReset();
  generatePhrasebook.mockReturnValue(new Promise(() => {}));
  generatePhrasebookImage.mockReset();
  generatePhrasebookImage.mockReturnValue(new Promise(() => {}));
  setDeckIllustration.mockReset();
  setDeckIllustration.mockResolvedValue(true);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function typeAndSubmitTopic(topic) {
  const input = appElement.querySelector(".creation-input-field");
  input.value = topic;
  input.dispatchEvent(new Event("input"));
  appElement.querySelector('[data-action="creation/submit-topic"]').click();
}

function choosePreset(index = 0) {
  appElement.querySelector(
    `input[type="radio"][data-action="creation/answer"][data-option="${index}"]`,
  ).click();
}

function gotoChecklist() {
  for (let page = 0; page < 20; page += 1) {
    if (appElement.querySelector('[data-action="creation/submit-context"]')) return;
    const next = appElement.querySelector('[data-action="creation/next-question"]');
    expect(next).not.toBeNull();
    if (next.disabled) choosePreset();
    else next.click();
  }
  throw new Error("Question navigation did not reach the checklist");
}

async function openQuestions({
  context = sampleQuestionsResponse,
  params = { lang: "es", ability: "none" },
  onCreated = () => {},
  onDismiss = () => {},
  onIllustrationUpdated = () => {},
} = {}) {
  getContext.mockResolvedValueOnce({ imagePrompt: sampleQuestionsResponse.imagePrompt, usage, ...context });
  const sheet = openCreationPanel(appElement, params, onCreated, onDismiss, onIllustrationUpdated);
  typeAndSubmitTopic("salsa dancing");
  await vi.waitFor(() => expect(appElement.querySelector(".creation-question")).toBeTruthy());
  return sheet;
}

async function waitForCommit() {
  await vi.waitFor(() => expect(commitPhrasebook).toHaveBeenCalledTimes(1), { timeout: 2500 });
}

function createStore() {
  const store = createDb({ indexedDB: new IDBFactory(), IDBKeyRange });
  return store.open().then(() => store);
}

describe("openCreationPanel — input and context", () => {
  it("renders the chosen language and enables topic submission only for input", () => {
    openCreationPanel(appElement, { lang: "es", ability: "none" }, () => {});
    expect(appElement.querySelector(".pane-header-title").textContent).toContain("Spanish");
    const submit = appElement.querySelector('[data-action="creation/submit-topic"]');
    expect(submit.disabled).toBe(true);

    const input = appElement.querySelector(".creation-input-field");
    input.value = "salsa dancing";
    input.dispatchEvent(new Event("input"));
    expect(submit.disabled).toBe(false);
  });

  it("renders hostile labels and option values literally", async () => {
    const hostileLabel = 'label"><img src=x onerror="window.__injected=true">';
    const hostileOption = 'option" autofocus onfocus="window.__injected=true';
    await openQuestions({
      context: {
        questions: [{ label: hostileLabel, options: [hostileOption] }],
        checklist: [{ label: hostileLabel, checked: true }],
      },
    });

    const radio = appElement.querySelector('input[data-action="creation/answer"]');
    expect(appElement.querySelector("img")).toBeNull();
    expect(appElement.querySelector(".creation-question-label").textContent).toBe(hostileLabel);
    expect(radio.value).toBe(hostileOption);
    expect(radio.hasAttribute("autofocus")).toBe(false);
    expect(radio.hasAttribute("onfocus")).toBe(false);

    gotoChecklist();
    expect(appElement.querySelector(".creation-checklist-item").textContent).toContain(hostileLabel);
    expect(appElement.querySelector("img")).toBeNull();
  });

  it("asks one unanswered question at a time and preserves answers through Previous and Next", async () => {
    await openQuestions({
      context: {
        questions: [
          { label: "Scene", options: ["Social dancing", "Class"] },
          { label: "Partner", options: ["Friend", "Stranger"] },
        ],
        checklist: sampleQuestionsResponse.checklist,
      },
    });

    expect(appElement.querySelectorAll(".creation-question")).toHaveLength(1);
    expect(appElement.querySelector(".creation-question-label").textContent).toBe("Scene");
    expect(appElement.querySelector('input[type="radio"]:checked')).toBeNull();
    expect(appElement.querySelector('[data-action="creation/next-question"]').disabled).toBe(true);
    expect(generatePhrasebook).not.toHaveBeenCalled();

    choosePreset(1);
    expect(appElement.querySelector(".creation-question-label").textContent).toBe("Partner");
    expect(appElement.querySelector('input[type="radio"]:checked')).toBeNull();
    expect(appElement.querySelector('[data-action="creation/next-question"]').disabled).toBe(true);
    expect(generatePhrasebook).not.toHaveBeenCalled();

    appElement.querySelector('[data-action="creation/previous-question"]').click();
    expect(appElement.querySelector(".creation-question-label").textContent).toBe("Scene");
    expect(appElement.querySelector('input[type="radio"]:checked').value).toBe("Class");
    expect(appElement.querySelector('[data-action="creation/next-question"]').disabled).toBe(false);
    appElement.querySelector('[data-action="creation/next-question"]').click();
    expect(appElement.querySelector(".creation-question-label").textContent).toBe("Partner");
    expect(appElement.querySelector('input[type="radio"]:checked')).toBeNull();

    choosePreset(0);
    expect(appElement.querySelector('[data-action="creation/submit-context"]')).not.toBeNull();
    expect(generatePhrasebook.mock.calls[0][0].answers).toEqual({
      Scene: "Class",
      Partner: "Friend",
    });
    expect(commitPhrasebook).not.toHaveBeenCalled();

    appElement.querySelector('[data-action="creation/back"]').click();
    expect(appElement.querySelector(".creation-question-label").textContent).toBe("Partner");
    expect(appElement.querySelector('input[type="radio"]:checked').value).toBe("Friend");
    appElement.querySelector('[data-action="creation/previous-question"]').click();
    expect(appElement.querySelector('input[type="radio"]:checked').value).toBe("Class");
    gotoChecklist();
    expect(generatePhrasebook).toHaveBeenCalledTimes(1);
  });

  it("gates blank Other answers and saves escaped custom text entered without choosing its radio", async () => {
    const customAnswer = 'Dance "socials"><img src=x onerror="window.__injected=true">';
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    await openQuestions();

    const radios = [...appElement.querySelectorAll('input[type="radio"]')];
    expect(radios.at(-1).dataset.action).toBe("creation/other");
    let input = appElement.querySelector(".creation-other-input");
    expect(input.placeholder).toBe("other");
    input.value = " \t ";
    input.dispatchEvent(new Event("input"));
    expect(appElement.querySelector('[data-action="creation/other"]').checked).toBe(true);
    expect(appElement.querySelector('[data-action="creation/next-question"]').disabled).toBe(true);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(appElement.querySelector(".creation-question")).not.toBeNull();
    expect(generatePhrasebook).not.toHaveBeenCalled();

    input = appElement.querySelector(".creation-other-input");
    input.value = `  ${customAnswer}  `;
    input.dispatchEvent(new Event("input"));
    expect(appElement.querySelector('[data-action="creation/next-question"]').disabled).toBe(false);
    expect(generatePhrasebook).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(generatePhrasebook.mock.calls[0][0].answers).toEqual({ "Salsa scene": customAnswer });

    appElement.querySelector('[data-action="creation/back"]').click();
    input = appElement.querySelector(".creation-other-input");
    expect(appElement.querySelector('[data-action="creation/other"]').checked).toBe(true);
    expect(input.value.trim()).toBe(customAnswer);
    expect(input.hasAttribute("onerror")).toBe(false);
    expect(appElement.querySelector("img")).toBeNull();
    appElement.querySelector('[data-action="creation/next-question"]').click();
    expect(generatePhrasebook).toHaveBeenCalledTimes(1);
    appElement.querySelector('[data-action="creation/submit-context"]').click();
    await waitForCommit();
    expect(commitPhrasebook.mock.calls[0][0].generation.answers)
      .toEqual({ "Salsa scene": customAnswer });
  });

  it("keeps __proto__ as a literal answer key in the frozen generation request", async () => {
    await openQuestions({
      context: {
        questions: [{ label: "__proto__", options: ["family", "friends"] }],
        checklist: [{ label: "Greetings", checked: true }],
      },
    });
    choosePreset(1);

    const generation = generatePhrasebook.mock.calls[0][0];
    expect(Object.hasOwn(generation.answers, "__proto__")).toBe(true);
    expect(generation.answers.__proto__).toBe("friends");

    appElement.querySelector('[data-action="creation/back"]').click();
    choosePreset(0);
    expect(generation.signal.aborted).toBe(true);
    expect(generation.answers.__proto__).toBe("friends");
  });

  it("caps checklist selection at eight and never permits zero selected groups", async () => {
    await openQuestions({
      context: {
        questions: [{ label: "Style", options: ["Any"] }],
        checklist: Array.from({ length: 9 }, (_, index) => ({
          label: `Topic ${index}`,
          checked: index === 0,
        })),
      },
    });
    gotoChecklist();
    const rows = appElement.querySelectorAll('[data-action="creation/toggle-checklist-item"]');
    rows[0].click();
    expect(rows[0].dataset.checked).toBe("true");
    for (let index = 1; index < rows.length; index += 1) {
      appElement.querySelectorAll('[data-action="creation/toggle-checklist-item"]')[index].click();
    }
    expect([...appElement.querySelectorAll(".creation-checklist-item")]
      .filter((row) => row.dataset.checked === "true")).toHaveLength(8);
  });
});

describe("openCreationPanel — speculative generation", () => {
  it("reuses pending and ready generation while answers remain unchanged", async () => {
    const generated = deferred();
    generatePhrasebook.mockReturnValueOnce(generated.promise);
    await openQuestions();

    gotoChecklist();
    const signal = generatePhrasebook.mock.calls[0][0].signal;
    appElement.querySelector('[data-action="creation/back"]').click();
    gotoChecklist();
    expect(generatePhrasebook).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(false);

    generated.resolve(sampleGenerateResponse);
    await Promise.resolve();
    await Promise.resolve();
    appElement.querySelector('[data-action="creation/back"]').click();
    gotoChecklist();
    expect(generatePhrasebook).toHaveBeenCalledTimes(1);
    expect(commitPhrasebook).not.toHaveBeenCalled();
  });

  it("aborts superseded generation and ignores its late response", async () => {
    const oldRequest = deferred();
    const newRequest = deferred();
    generatePhrasebook
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    await openQuestions();

    gotoChecklist();
    const oldSignal = generatePhrasebook.mock.calls[0][0].signal;
    appElement.querySelector('[data-action="creation/back"]').click();
    choosePreset(1);
    expect(oldSignal.aborted).toBe(true);

    oldRequest.resolve(sampleGenerateResponse);
    await Promise.resolve();
    expect(commitPhrasebook).not.toHaveBeenCalled();
    expect(generatePhrasebook).toHaveBeenCalledTimes(2);
    expect(generatePhrasebook.mock.calls[1][0].answers).toEqual({ "Salsa scene": "Cuban style" });

    newRequest.resolve(sampleGenerateResponse);
  });

  it("invalidates speculation immediately when a retained Other answer becomes blank", async () => {
    await openQuestions();
    appElement.querySelector('[data-action="creation/other"]').click();
    expect(appElement.querySelector(".creation-question")).not.toBeNull();
    expect(appElement.querySelector('[data-action="creation/next-question"]').disabled).toBe(true);
    let input = appElement.querySelector(".creation-other-input");
    input.value = "Local salsa night";
    input.dispatchEvent(new Event("input"));
    appElement.querySelector('[data-action="creation/next-question"]').click();
    const original = generatePhrasebook.mock.calls[0][0];

    appElement.querySelector('[data-action="creation/back"]').click();
    input = appElement.querySelector(".creation-other-input");
    input.value = "   ";
    input.dispatchEvent(new Event("input"));
    expect(original.signal.aborted).toBe(true);
    expect(original.answers).toEqual({ "Salsa scene": "Local salsa night" });
    expect(appElement.querySelector('[data-action="creation/next-question"]').disabled).toBe(true);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(generatePhrasebook).toHaveBeenCalledTimes(1);

    input = appElement.querySelector(".creation-other-input");
    input.value = "  Outdoor festival  ";
    input.dispatchEvent(new Event("input"));
    expect(generatePhrasebook).toHaveBeenCalledTimes(1);
    appElement.querySelector('[data-action="creation/next-question"]').click();
    expect(generatePhrasebook).toHaveBeenCalledTimes(2);
    expect(generatePhrasebook.mock.calls[1][0].answers)
      .toEqual({ "Salsa scene": "Outdoor festival" });
  });

  it("keeps background generation errors off the checklist until Continue, then retries intact", async () => {
    generatePhrasebook
      .mockRejectedValueOnce(new Error("LLM request failed"))
      .mockResolvedValueOnce(sampleGenerateResponse);
    await openQuestions();
    gotoChecklist();
    appElement.querySelectorAll('[data-action="creation/toggle-checklist-item"]')[1].click();
    await Promise.resolve();
    await Promise.resolve();
    expect(appElement.querySelector(".creation-error")).toBeNull();

    appElement.querySelector('[data-action="creation/submit-context"]').click();
    expect(appElement.querySelector(".creation-error").textContent).toContain("LLM request failed");
    appElement.querySelector('[data-action="creation/retry"]').click();
    expect(generatePhrasebook).toHaveBeenCalledTimes(2);
    expect([...appElement.querySelectorAll(".creation-checklist-item")]
      .map((row) => row.dataset.checked)).toEqual(["true", "true"]);
  });

  it("aborts context, title, and generation work on dismissal", async () => {
    const context = deferred();
    getContext.mockReturnValueOnce(context.promise);
    const first = openCreationPanel(appElement, { lang: "es", ability: "none" }, () => {});
    typeAndSubmitTopic("salsa dancing");
    const contextSignal = getContext.mock.calls[0][0].signal;
    const titleSignal = getPhrasebookTitle.mock.calls[0][0].signal;
    first.close();
    expect(contextSignal.aborted).toBe(true);
    expect(titleSignal.aborted).toBe(true);

    document.body.innerHTML = "";
    appElement = document.createElement("div");
    document.body.appendChild(appElement);
    const phrasebook = deferred();
    generatePhrasebook.mockReturnValueOnce(phrasebook.promise);
    const second = await openQuestions();
    gotoChecklist();
    const phrasebookSignal = generatePhrasebook.mock.calls.at(-1)[0].signal;
    second.close();
    expect(phrasebookSignal.aborted).toBe(true);
    expect(generatePhrasebookImage.mock.calls.at(-1)[0].signal.aborted).toBe(true);
    phrasebook.resolve(sampleGenerateResponse);
    await Promise.resolve();
    expect(commitPhrasebook).not.toHaveBeenCalled();
  });
});

describe("openCreationPanel — atomic commit lifetime", () => {
  it("commits selected duplicate-title groups with frozen generation context", async () => {
    const store = await createStore();
    commitPhrasebook.mockImplementation((input, options) =>
      actualCommitPhrasebook(input, { ...options, store }));
    getPhrasebookTitle.mockResolvedValueOnce({ title: "Salsa Social Dancing" });

    const selectedFirst = phrase("selected-first", "Hola", "Hello");
    const discarded = phrase("discarded", "Adiós", "Goodbye");
    const selectedThird = phrase("selected-third", "Hola", "Hi there", "partner");
    const response = {
      schemaVersion: 3,
      title: "Ignored provider title",
      groups: [
        {
          id: "same-a",
          title: "Same title",
          essentials: [{ id: "essential-first", card: selectedFirst.card }],
          dialogue: [selectedFirst, phrase("reply-first", "Buenas.", "Hi.", "partner")],
          vocab: [word("hola", "hello", "greeting", source(selectedFirst, 0, 4))],
        },
        {
          id: "discarded-group",
          title: "Discarded",
          essentials: [{ id: "essential-discarded", card: discarded.card }],
          dialogue: [discarded, phrase("reply-discarded", "Hasta luego.", "See you.", "partner")],
          vocab: [word("adiós", "goodbye", "farewell", source(discarded, 0, 5))],
        },
        {
          id: "same-c",
          title: "Same title",
          essentials: [{ id: "essential-third", card: selectedThird.card }],
          dialogue: [phrase("question-third", "Buenas.", "Hi."), selectedThird],
          vocab: [word("hola", "hi", "greeting", source(selectedThird, 0, 4))],
        },
      ],
      usage,
    };
    generatePhrasebook.mockResolvedValueOnce(response);
    let createdDeck = null;
    await openQuestions({
      context: {
        questions: sampleQuestionsResponse.questions,
        checklist: [
          { label: "Same title", checked: true },
          { label: "Discarded", checked: false },
          { label: "Same title", checked: false },
        ],
      },
      onCreated: (deck) => { createdDeck = deck; },
    });
    choosePreset(1);
    appElement.querySelectorAll('[data-action="creation/toggle-checklist-item"]')[2].click();
    appElement.querySelector('[data-action="creation/submit-context"]').click();
    await waitForCommit();
    await vi.waitFor(() => expect(createdDeck).toBeTruthy());

    expect(createdDeck.name).toBe("Salsa Social Dancing");
    expect(createdDeck.generation).toEqual({
      seed: "salsa dancing",
      ability: "none",
      answers: { "Salsa scene": "Cuban style" },
    });
    expect((await store.groups.where("deckId").equals(createdDeck.id).sortBy("position"))
      .map((group) => group.title)).toEqual(["Same title", "Same title"]);
    const occurrences = await store.occurrences.where("deckId").equals(createdDeck.id).toArray();
    expect(occurrences.filter((occurrence) => occurrence.section === "essentials")
      .map((occurrence) => occurrence.translation).sort()).toEqual(["Hello", "Hi there"]);
    expect(occurrences.filter((occurrence) => occurrence.section === "dialogue")).toHaveLength(4);
    expect(await store.topicWords.where("deckId").equals(createdDeck.id).count()).toBe(2);
    expect(await store.cards.where("type").equals("word").count()).toBe(1);
    expect(await store.provenance.where("deckId").equals(createdDeck.id).count()).toBe(2);
    expect(getLastAbility("es")).toBe("none");
    store.close();
  });

  it("coalesces repeated Continue clicks into one commit", async () => {
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    await openQuestions();
    gotoChecklist();
    const continueButton = appElement.querySelector('[data-action="creation/submit-context"]');
    continueButton.click();
    continueButton.click();
    await waitForCommit();
    expect(commitPhrasebook).toHaveBeenCalledTimes(1);
  });

  it("aborts a real in-flight transaction on dismissal and leaves no rows", async () => {
    const store = await createStore();
    const settled = deferred();
    let commitSignal;
    commitPhrasebook.mockImplementation(async (input, options) => {
      commitSignal = options.signal;
      try {
        return await actualCommitPhrasebook(input, { ...options, store });
      } finally {
        settled.resolve();
      }
    });
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    let created = false;
    const sheet = await openQuestions({ onCreated: () => { created = true; } });
    store.cards.hook("creating", () => sheet.close());
    gotoChecklist();
    appElement.querySelector('[data-action="creation/submit-context"]').click();
    await settled.promise;

    expect(commitSignal.aborted).toBe(true);
    expect(await store.decks.count()).toBe(0);
    expect(await store.cards.count()).toBe(0);
    expect(await store.memberships.count()).toBe(0);
    expect(created).toBe(false);
    expect(getLastAbility("es")).toBeUndefined();
    await vi.waitFor(() => expect(generatePhrasebookImage.mock.calls[0][0].signal.aborted).toBe(true));
    store.close();
  });

  it("retains a transaction that completed before dismissal and remembers ability at that boundary", async () => {
    const store = await createStore();
    let sheet;
    let durableDeck;
    commitPhrasebook.mockImplementation(async (input, options) => {
      durableDeck = await actualCommitPhrasebook(input, { ...options, store });
      sheet.close();
      return durableDeck;
    });
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    let created = false;
    sheet = await openQuestions({ onCreated: () => { created = true; } });
    gotoChecklist();
    appElement.querySelector('[data-action="creation/submit-context"]').click();
    await waitForCommit();
    await vi.waitFor(() => expect(durableDeck).toBeTruthy());

    expect(await store.decks.get(durableDeck.id)).toEqual(durableDeck);
    expect(await store.cards.count()).toBeGreaterThan(0);
    expect(getLastAbility("es")).toBe("none");
    expect(created).toBe(false);
    expect(generatePhrasebookImage.mock.calls[0][0].signal.aborted).toBe(false);
    store.close();
  });

  it("surfaces transactional failure without rows or remembered ability", async () => {
    const store = await createStore();
    store.memberships.hook("creating", () => {
      throw new Error("Storage full");
    });
    commitPhrasebook.mockImplementation((input, options) =>
      actualCommitPhrasebook(input, { ...options, store }));
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    await openQuestions();
    gotoChecklist();
    appElement.querySelector('[data-action="creation/submit-context"]').click();
    await waitForCommit();
    await vi.waitFor(() => expect(appElement.querySelector(".creation-error")?.textContent)
      .toContain("Storage full"));

    expect(await store.decks.count()).toBe(0);
    expect(await store.cards.count()).toBe(0);
    expect(getLastAbility("es")).toBeUndefined();
    store.close();
  });
});

describe("openCreationPanel — title and ability", () => {
  it("freezes an available independent title when final creation starts", async () => {
    getPhrasebookTitle.mockResolvedValueOnce({ title: "Salsa Nights" });
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    await openQuestions();
    await Promise.resolve();
    gotoChecklist();
    appElement.querySelector('[data-action="creation/submit-context"]').click();
    await waitForCommit();

    expect(commitPhrasebook.mock.calls[0][0].name).toBe("Salsa Nights");
    expect(getPhrasebookTitle.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it("falls back to the trimmed seed without waiting for naming", async () => {
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    await openQuestions();
    gotoChecklist();
    appElement.querySelector('[data-action="creation/submit-context"]').click();
    await waitForCommit();
    expect(commitPhrasebook.mock.calls[0][0].name).toBe("salsa dancing");
  });

  it("asks for an unsaved ability and remembers it only after commit succeeds", async () => {
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    const committing = deferred();
    commitPhrasebook.mockReturnValueOnce(committing.promise);
    await openQuestions({ params: { lang: "es" } });
    expect(appElement.querySelector(".creation-question-label").textContent).toBe(ABILITY_QUESTION);
    expect(appElement.querySelector('input[type="radio"]:checked')).toBeNull();
    expect(appElement.querySelector('[data-action="creation/other"]')).toBeNull();
    expect(appElement.querySelector(".creation-other-input")).toBeNull();
    choosePreset(2);
    gotoChecklist();
    expect(generatePhrasebook.mock.calls[0][0].ability).toBe("conversational");
    expect(getLastAbility("es")).toBeUndefined();

    appElement.querySelector('[data-action="creation/submit-context"]').click();
    await waitForCommit();
    expect(getLastAbility("es")).toBeUndefined();
    committing.resolve({
      ...committedDeck,
      ability: "conversational",
      generation: {
        ...committedDeck.generation,
        ability: "conversational",
      },
    });
    await vi.waitFor(() => expect(getLastAbility("es")).toBe("conversational"));
  });

  it("uses a remembered ability for both requests without asking again", async () => {
    setLastAbility("es", "basics");
    await openQuestions({ params: { lang: "es" } });
    expect(appElement.querySelector(".creation-question-label").textContent)
      .toBe(sampleQuestionsResponse.questions[0].label);
    expect(getContext).toHaveBeenCalledWith(expect.objectContaining({ ability: "basics" }));
    gotoChecklist();
    expect(generatePhrasebook).toHaveBeenCalledWith(expect.objectContaining({ ability: "basics" }));
  });
});

describe("openCreationPanel — independent cover work", () => {
  it("creates and saves a phrasebook when the HTTP origin has no randomUUID", async () => {
    const store = await createStore();
    commitPhrasebook.mockImplementation((input, options) => actualCommitPhrasebook(input, { ...options, store }));
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
      let created;
      await openQuestions({ onCreated: (deck) => { created = deck; } });
      gotoChecklist();
      appElement.querySelector('[data-action="creation/submit-context"]').click();
      await vi.waitFor(() => expect(created).toBeTruthy(), { timeout: 2500 });
      const saved = await store.decks.get(created.id);
      expect(saved.illustration.state).toBe("pending");
      expect(saved.illustration.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect((await store.groups.where("deckId").equals(created.id).toArray()).map(group => group.title))
        .toEqual(["Ask someone to dance"]);
      await vi.waitFor(() => expect(appElement.querySelector(".creation-generating")).toBeNull());
    } finally {
      vi.unstubAllGlobals();
      store.close();
    }
  });

  it("shows an initialization error after context resolves and allows a fresh attempt", async () => {
    const entropy = vi.spyOn(crypto, "getRandomValues").mockImplementationOnce(() => {
      throw new Error("Randomness unavailable");
    });
    const sheet = openCreationPanel(appElement, { lang: "es", ability: "none" }, () => {});
    try {
      getContext.mockResolvedValue(sampleQuestionsResponse);
      typeAndSubmitTopic("salsa dancing");
      await vi.waitFor(() => expect(appElement.querySelector(".creation-error")?.textContent)
        .toContain("Randomness unavailable"));
      expect(appElement.querySelector(".creation-generating")).toBeNull();
      appElement.querySelector('[data-action="creation/retry"]').click();
      typeAndSubmitTopic("salsa dancing");
      await vi.waitFor(() => expect(appElement.querySelector(".creation-question-label")?.textContent)
        .toBe("Salsa scene"));
    } finally {
      entropy.mockRestore();
      sheet.close();
    }
  });

  it("reuses context art across answer changes and same-seed navigation, but cancels a replaced seed", async () => {
    await openQuestions();
    const originalSignal = generatePhrasebookImage.mock.calls[0][0].signal;
    gotoChecklist();
    appElement.querySelector('[data-action="creation/back"]').click();
    choosePreset(1);
    expect(generatePhrasebookImage).toHaveBeenCalledTimes(1);
    appElement.querySelector('[data-action="creation/back"]').click();
    appElement.querySelector('[data-action="creation/back"]').click();
    typeAndSubmitTopic("salsa dancing");
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(generatePhrasebookImage).toHaveBeenCalledTimes(1);
    expect(originalSignal.aborted).toBe(false);

    appElement.querySelector('[data-action="creation/back"]').click();
    getContext.mockResolvedValueOnce({ ...sampleQuestionsResponse, imagePrompt: "A watercolor of a medicine bottle." });
    typeAndSubmitTopic("visiting a pharmacy");
    await vi.waitFor(() => expect(generatePhrasebookImage).toHaveBeenCalledTimes(2));
    expect(originalSignal.aborted).toBe(true);
    expect(generatePhrasebookImage.mock.calls[1][0].signal.aborted).toBe(false);
  });

  it("finishes text creation before delayed art and saves the art after the sheet closes", async () => {
    const store = await createStore();
    commitPhrasebook.mockImplementation((input, options) => actualCommitPhrasebook(input, { ...options, store }));
    setDeckIllustration.mockImplementation((deckId, requestId, next) => actualSetDeckIllustration(deckId, requestId, next, store));
    const art = deferred();
    generatePhrasebookImage.mockReturnValueOnce(art.promise);
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    const updated = vi.fn();
    let created;
    await openQuestions({ onCreated: (deck) => { created = deck; }, onIllustrationUpdated: updated });
    gotoChecklist();
    appElement.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(created).toBeTruthy(), { timeout: 2500 });
    expect(created.illustration.state).toBe("pending");
    expect(generatePhrasebookImage.mock.calls[0][0].signal.aborted).toBe(false);
    const image = {
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAYAAAA7KqwyAAAAFklEQVR4nGP4sGVaAyWYYdSAUQOAGAAeWIiwsY03XwAAAABJRU5ErkJggg==",
      mediaType: "image/png", width: 16, height: 9,
    };
    art.resolve({ image });
    await vi.waitFor(() => expect(updated).toHaveBeenCalledWith(created.id, expect.objectContaining({ state: "ready", image })));
    expect((await store.decks.get(created.id)).illustration.image).toEqual(image);
    store.close();
  });

  it("commits text with a failed illustration without retrying image providers", async () => {
    generatePhrasebookImage.mockRejectedValueOnce(new Error("Image unavailable"));
    generatePhrasebook.mockResolvedValueOnce(sampleGenerateResponse);
    let created = false;
    await openQuestions({ onCreated: () => { created = true; } });
    gotoChecklist();
    appElement.querySelector('[data-action="creation/submit-context"]').click();
    await vi.waitFor(() => expect(created).toBe(true), { timeout: 2500 });
    expect(commitPhrasebook.mock.calls[0][0].illustration.state).toBe("failed");
    expect(generatePhrasebookImage).toHaveBeenCalledTimes(1);
  });

  it("aborts unbound art immediately when dismissed during the final text wait", async () => {
    const sheet = await openQuestions();
    gotoChecklist();
    appElement.querySelector('[data-action="creation/submit-context"]').click();
    sheet.close();
    expect(generatePhrasebookImage.mock.calls[0][0].signal.aborted).toBe(true);
    expect(commitPhrasebook).not.toHaveBeenCalled();
  });
});
