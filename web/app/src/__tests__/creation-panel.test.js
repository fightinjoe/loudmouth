// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";

const { commitPhrasebook } = vi.hoisted(() => ({
  commitPhrasebook: vi.fn(),
}));
vi.mock("../js/db", async (importOriginal) => ({
  ...(await importOriginal()),
  commitPhrasebook,
}));

const { getContext, generatePhrasebook, getPhrasebookTitle } = vi.hoisted(() => ({
  getContext: vi.fn(),
  getPhrasebookTitle: vi.fn(),
  generatePhrasebook: vi.fn(),
}));
vi.mock("../js/phrasebook-api", () => ({
  getContext,
  generatePhrasebook,
  getPhrasebookTitle,
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
  schemaVersion: 2,
  title: "Provider title is not used for naming",
  groups: [
    {
      id: "draft-group-1",
      title: "Ask someone to dance",
      phrases: [firstPhrase],
      vocab: [word("bailar", "dance", "dance", source(firstPhrase, 1, 7))],
    },
    {
      id: "draft-group-2",
      title: "Dance/step vocabulary",
      phrases: [secondPhrase],
      vocab: [word("paso", "step", "step", source(secondPhrase, 0, 4))],
    },
  ],
  usage,
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

beforeAll(async () => {
  ({ commitPhrasebook: actualCommitPhrasebook } = await vi.importActual("../js/db"));
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

function gotoChecklist() {
  appElement.querySelector('[data-action="creation/to-checklist"]').click();
}

async function openQuestions({
  context = sampleQuestionsResponse,
  params = { lang: "es", ability: "none" },
  onCreated = () => {},
  onDismiss = () => {},
} = {}) {
  getContext.mockResolvedValueOnce(context);
  const sheet = openCreationPanel(appElement, params, onCreated, onDismiss);
  typeAndSubmitTopic("salsa dancing");
  await vi.waitFor(() => expect(appElement.querySelector(".creation-select")).toBeTruthy());
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

    const select = appElement.querySelector(".creation-select");
    expect(appElement.querySelector("img")).toBeNull();
    expect(select.closest(".creation-select-row").querySelector(".creation-select-label").textContent)
      .toBe(hostileLabel);
    expect(select.dataset.label).toBe(hostileLabel);
    expect(select.value).toBe(hostileOption);
    expect(select.querySelector("option").hasAttribute("autofocus")).toBe(false);

    gotoChecklist();
    expect(appElement.querySelector(".creation-checklist-item").textContent).toContain(hostileLabel);
    expect(appElement.querySelector("img")).toBeNull();
  });

  it("keeps __proto__ as a literal answer key in the frozen generation request", async () => {
    await openQuestions({
      context: {
        questions: [{ label: "__proto__", options: ["family", "friends"] }],
        checklist: [{ label: "Greetings", checked: true }],
      },
    });
    const select = appElement.querySelector(".creation-select");
    select.value = "friends";
    select.dispatchEvent(new Event("change"));
    gotoChecklist();

    const generation = generatePhrasebook.mock.calls[0][0];
    expect(Object.hasOwn(generation.answers, "__proto__")).toBe(true);
    expect(generation.answers.__proto__).toBe("friends");

    appElement.querySelector('[data-action="creation/back"]').click();
    const changedSelect = appElement.querySelector(".creation-select");
    changedSelect.value = "family";
    changedSelect.dispatchEvent(new Event("change"));
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
    const select = appElement.querySelector(".creation-select");
    select.value = "Cuban style";
    select.dispatchEvent(new Event("change"));
    expect(oldSignal.aborted).toBe(true);

    gotoChecklist();
    oldRequest.resolve(sampleGenerateResponse);
    await Promise.resolve();
    expect(commitPhrasebook).not.toHaveBeenCalled();
    expect(generatePhrasebook).toHaveBeenCalledTimes(2);
    expect(generatePhrasebook.mock.calls[1][0].answers).toEqual({ "Salsa scene": "Cuban style" });

    newRequest.resolve(sampleGenerateResponse);
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
      schemaVersion: 2,
      title: "Ignored provider title",
      groups: [
        {
          id: "same-a",
          title: "Same title",
          phrases: [selectedFirst],
          vocab: [word("hola", "hello", "greeting", source(selectedFirst, 0, 4))],
        },
        {
          id: "discarded-group",
          title: "Discarded",
          phrases: [discarded],
          vocab: [word("adiós", "goodbye", "farewell", source(discarded, 0, 5))],
        },
        {
          id: "same-c",
          title: "Same title",
          phrases: [selectedThird],
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
    const select = appElement.querySelector(".creation-select");
    select.value = "Cuban style";
    select.dispatchEvent(new Event("change"));
    gotoChecklist();
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
    expect(occurrences.map((occurrence) => occurrence.translation).sort())
      .toEqual(["Hello", "Hi there"]);
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
    const ability = appElement.querySelector(`[data-label="${ABILITY_QUESTION}"]`);
    expect([...ability.options].map((option) => option.value))
      .toEqual(["None", "Basics", "Conversational"]);
    ability.value = "Conversational";
    ability.dispatchEvent(new Event("change"));
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
    expect(appElement.querySelector(`[data-label="${ABILITY_QUESTION}"]`)).toBeNull();
    expect(getContext).toHaveBeenCalledWith(expect.objectContaining({ ability: "basics" }));
    gotoChecklist();
    expect(generatePhrasebook).toHaveBeenCalledWith(expect.objectContaining({ ability: "basics" }));
  });
});
