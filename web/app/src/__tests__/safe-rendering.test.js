// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openCardEditPanel } from "../components/card-edit-panel.js";
import { openDeckSettings } from "../components/deck-settings.js";
import { openJsonPanel } from "../components/json-panel.js";

const injectedElement = '<img src=x onerror="window.__injected=true"> & literal';

let appEl;

beforeEach(() => {
  document.body.innerHTML = "";
  appEl = document.createElement("div");
  document.body.appendChild(appEl);
});

describe("safe rendering boundaries", () => {
  it("renders a persisted deck name as literal settings text", () => {
    openDeckSettings(appEl, {
      id: "deck-id",
      name: injectedElement,
      mode: "study",
      order: "default",
      readingDisplay: "reading",
      system: false,
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
      id: "card-id",
      text: injectedElement,
      translation: injectedElement,
      reading: injectedElement,
      romanization: injectedElement,
      notes: injectedElement,
      example: { text: injectedElement },
    }, {
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
    }, () => {}, () => {}, () => {});

    expect(appEl.querySelector("img")).toBeNull();
    for (const id of ["edit-text", "edit-translation", "edit-reading", "edit-romanization", "edit-notes", "edit-example"]) {
      expect(appEl.querySelector(`#${id}`).value).toBe(injectedElement);
    }
  });

  it("renders an untrusted JSON panel title literally and assigns JSON as textarea data", () => {
    const json = `{"value":"</textarea>${injectedElement}"}`;
    openJsonPanel(appEl, injectedElement, json, () => {});

    expect(appEl.querySelector("img")).toBeNull();
    expect(appEl.querySelector(".pane-header-title").textContent).toBe(injectedElement);
    expect(appEl.querySelector(".json-pane-textarea").value).toBe(json);
  });
});
