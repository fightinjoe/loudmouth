// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openCardEditPanel } from "../components/card-edit-panel";

const wordEntry = {
  key: '["deck-1","word-1"]',
  cardId: "word-1",
  card: {
    lang: "ja",
    type: "word",
    text: "食べる",
    translation: "eat",
    reading: [["食", "た"], ["べる", null]],
    romanization: "taberu",
    partOfSpeech: "verb",
    senseKey: "consume-food",
  },
  sources: [],
};

function mount(entry = wordEntry, operationOverrides = {}) {
  const appEl = document.createElement("div");
  document.body.appendChild(appEl);
  const operations = {
    updateCard: vi.fn().mockResolvedValue(undefined),
    deleteCard: vi.fn().mockResolvedValue(undefined),
    ...operationOverrides,
  };
  const onSave = vi.fn();
  const onDelete = vi.fn();
  openCardEditPanel(appEl, entry, operations, onSave, onDelete, vi.fn());
  return { appEl, operations, onSave, onDelete };
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("card edit panel", () => {
  it("keeps the editor open and reports JSON/alignment reading errors", () => {
    const { appEl, operations } = mount();
    const reading = appEl.querySelector("#edit-reading");
    reading.value = "not JSON";
    appEl.querySelector("#btn-save-card").click();
    const error = appEl.querySelector("#edit-reading-error");
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("Reading must be valid JSON.");

    reading.value = '[["食べます","たべます"]]';
    appEl.querySelector("#btn-save-card").click();
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain("concatenate exactly");
    expect(document.activeElement).toBe(reading);
    expect(operations.updateCard).not.toHaveBeenCalled();
    expect(appEl.querySelector(".card-edit-panel")).not.toBeNull();
  });

  it("updates the active phrase occurrence, omits cleared optionals, and drops a stale example reading", async () => {
    const entry = {
      key: "occurrence-2",
      cardId: "phrase-1",
      card: {
        lang: "es",
        type: "phrase",
        text: "Hola",
        translation: "hello",
        reading: [["Hola", null]],
        romanization: "hola",
        notes: "Greeting",
        example: {
          text: "old",
          reading: [["old", null]],
          translation: "old example",
        },
      },
      membership: {
        deckId: "deck-1",
        cardId: "phrase-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        position: 0,
        starredAt: null,
      },
      occurrence: {
        id: "occurrence-2",
        deckId: "deck-1",
        cardId: "phrase-1",
        position: 0,
        translation: "hello",
      },
      sources: [],
    };
    const { appEl, operations, onSave } = mount(entry);
    appEl.querySelector("#edit-text").value = "Buenas";
    appEl.querySelector("#edit-translation").value = "good day";
    appEl.querySelector("#edit-reading").value = '[["Buenas",null]]';
    appEl.querySelector("#edit-romanization").value = "";
    appEl.querySelector("#edit-notes").value = "";
    appEl.querySelector("#edit-example").value = "new";
    appEl.querySelector("#btn-save-card").click();

    await vi.waitFor(() => expect(operations.updateCard).toHaveBeenCalledOnce());
    expect(operations.updateCard).toHaveBeenCalledWith(
      "phrase-1",
      {
        text: "Buenas",
        translation: "good day",
        reading: [["Buenas", null]],
        romanization: undefined,
        notes: undefined,
        example: { text: "new", translation: "old example" },
      },
      { occurrenceId: "occurrence-2" },
    );
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("keeps Chunk source fields read-only while saving role and explanation", async () => {
    const entry = {
      key: '["deck-1","chunk-1"]',
      cardId: "chunk-1",
      card: {
        lang: "ja",
        type: "chunk",
        text: "肉も",
        translation: "meat too",
        reading: [["肉", "にく"], ["も", null]],
        romanization: "niku mo",
        role: "topic phrase",
        explanation: "Marks meat as an additional topic.",
        source: {
          snapshot: {
            lang: "ja",
            text: "肉も魚も食べません。",
            translation: "I eat neither meat nor fish.",
          },
          span: { start: 0, end: 2 },
        },
      },
      membership: {
        deckId: "deck-1",
        cardId: "chunk-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        position: 0,
        starredAt: null,
      },
      sources: [],
    };
    const { appEl, operations } = mount(entry);
    expect(appEl.querySelector("#edit-text").readOnly).toBe(true);
    expect(appEl.querySelector("#edit-reading").readOnly).toBe(true);
    expect(appEl.querySelector("#edit-romanization").readOnly).toBe(true);

    appEl.querySelector("#edit-translation").value = "also meat";
    appEl.querySelector("#edit-role").value = "addition";
    appEl.querySelector("#edit-explanation").value = "Adds meat to the set.";
    appEl.querySelector("#btn-save-card").click();

    await vi.waitFor(() => expect(operations.updateCard).toHaveBeenCalledOnce());
    const fields = operations.updateCard.mock.calls[0][1];
    expect(fields).toEqual({
      translation: "also meat",
      role: "addition",
      explanation: "Adds meat to the set.",
      notes: undefined,
      example: undefined,
    });
    expect(fields).not.toHaveProperty("text");
    expect(fields).not.toHaveProperty("reading");
    expect(fields).not.toHaveProperty("romanization");
  });

  it("shows storage failures without dismissing the editor", async () => {
    const failure = new Error("A card with this identity already exists.");
    const { appEl, operations, onSave } = mount(wordEntry, {
      updateCard: vi.fn().mockRejectedValue(failure),
    });
    appEl.querySelector("#btn-save-card").click();

    await vi.waitFor(() => {
      expect(appEl.querySelector("#edit-card-error").textContent).toBe(failure.message);
    });
    expect(appEl.querySelector("#edit-card-error").hidden).toBe(false);
    expect(appEl.querySelector("#btn-save-card").disabled).toBe(false);
    expect(appEl.querySelector(".card-edit-panel")).not.toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(operations.updateCard).toHaveBeenCalledOnce();
  });
});
