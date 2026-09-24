// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openCardEditPanel } from "../components/card-edit-panel";
import { openDeckSettings } from "../components/deck-settings";
import { openJsonPanel } from "../components/json-panel";
import { renderSourceContext } from "../components/source-context";

const injectedElement = '<img src=x onerror="window.__injected=true"> & literal';

let appEl;

beforeEach(() => {
  document.body.innerHTML = "";
  appEl = document.createElement("div");
  document.body.appendChild(appEl);
});

describe("safe rendering boundaries", () => {
  it("renders a persisted deck name literally", () => {
    openDeckSettings(appEl, {
      id: "deck-id",
      name: injectedElement,
      lang: "ja",
      createdAt: "2026-01-01T00:00:00.000Z",
      mode: "study",
      order: "default",
      readingDisplay: "reading",
    }, {
      updateDeckMode: vi.fn(),
      updateDeckName: vi.fn(),
      updateDeckOrder: vi.fn(),
      updateDeckReadingDisplay: vi.fn(),
      deleteDeck: vi.fn(),
      exportJson: vi.fn(),
    }, () => {}, () => {});

    expect(appEl.querySelector("img")).toBeNull();
    expect(appEl.querySelector("#ds-name-value").textContent).toBe(injectedElement);
  });

  it("keeps hostile persisted card fields inside their form controls", () => {
    openCardEditPanel(appEl, {
      key: "occurrence-id",
      cardId: "card-id",
      card: {
        lang: "ja",
        type: "phrase",
        text: injectedElement,
        translation: injectedElement,
        reading: [[injectedElement, null]],
        romanization: injectedElement,
        notes: injectedElement,
        example: { text: injectedElement },
      },
      sources: [],
    }, {
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
    }, () => {}, () => {}, () => {});

    expect(appEl.querySelector("img")).toBeNull();
    for (const id of ["edit-text", "edit-translation", "edit-romanization", "edit-notes", "edit-example"]) {
      expect(appEl.querySelector(`#${id}`).value).toBe(injectedElement);
    }
    expect(appEl.querySelector("#edit-reading").value).toBe(JSON.stringify([[injectedElement, null]]));
  });

  it("renders an untrusted JSON panel title literally and assigns JSON as textarea data", () => {
    const json = `{"value":"</textarea>${injectedElement}"}`;
    openJsonPanel(appEl, injectedElement, json, () => {});

    expect(appEl.querySelector("img")).toBeNull();
    expect(appEl.querySelector(".pane-header-title").textContent).toBe(injectedElement);
    expect(appEl.querySelector(".json-pane-textarea").value).toBe(json);
  });

  it("masks only the chosen script span without leaking cut-token ruby or romaji", () => {
    const snapshot = {lang:"ja",text:"肉も魚",translation:"meat and fish",reading:[["肉も","にくも"],["魚","さかな"]],romanization:"niku mo sakana"};
    appEl.innerHTML = renderSourceContext(snapshot,{start:0,end:1},{mask:true});
    expect(appEl.querySelector("mark").textContent).toBe("____");
    expect(appEl.textContent).not.toContain("肉");
    expect(appEl.textContent).not.toContain("にくも");
    expect(appEl.textContent).not.toContain("niku");
    expect(appEl.querySelector("ruby").textContent).toBe("魚さかな");
    appEl.innerHTML = renderSourceContext(snapshot,{start:0,end:1});
    expect(appEl.querySelector("mark").textContent).toBe("肉");
    expect(appEl.textContent).not.toContain("にくも");
  });

  it("preserves hostile snapshot offsets as escaped literal source text", () => {
    const snapshot = {lang:"ja",text:injectedElement+"続き",translation:"Literal source"};
    appEl.innerHTML = renderSourceContext(snapshot,{start:0,end:injectedElement.length});
    expect(appEl.querySelector("img")).toBeNull();
    expect(appEl.querySelector("mark").textContent).toBe(injectedElement);
    expect(appEl.textContent).toBe(snapshot.text);
  });
});
