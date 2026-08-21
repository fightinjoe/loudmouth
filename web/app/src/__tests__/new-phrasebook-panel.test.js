// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { openNewPhrasebookPanel, PLACEHOLDER_DECK_NAME } from "../components/new-phrasebook-panel.js";
import { setLastAbility } from "../js/preferences.js";

let appEl;
let createDeck;

beforeEach(() => {
  appEl = document.createElement("div");
  document.body.appendChild(appEl);
  localStorage.clear();
  createDeck = vi.fn(async (name, lang, opts) => ({
    id: "001-new",
    name,
    lang,
    ability: opts?.ability || "beginner",
    formality: "polite",
    audience: "staff",
  }));
});

describe("openNewPhrasebookPanel", () => {
  it("defaults to the first language with beginner ability", () => {
    openNewPhrasebookPanel(appEl, { createDeck }, () => {}, () => {});
    expect(appEl.querySelector('[data-action="new-phrasebook/lang"]').value).toBe("zh");
    expect(appEl.querySelector('[data-action="new-phrasebook/ability"]').value).toBe("beginner");
  });

  it("pre-fills ability from the last-used-per-language preference when switching language", () => {
    setLastAbility("ja", "advanced");
    openNewPhrasebookPanel(appEl, { createDeck }, () => {}, () => {});
    const langSelect = appEl.querySelector('[data-action="new-phrasebook/lang"]');
    langSelect.value = "ja";
    langSelect.dispatchEvent(new Event("change"));
    expect(appEl.querySelector('[data-action="new-phrasebook/ability"]').value).toBe("advanced");
  });

  it("creates the phrasebook with the placeholder name and chosen language/ability", async () => {
    let created = null;
    openNewPhrasebookPanel(appEl, { createDeck }, (deck) => { created = deck; }, () => {});
    const langSelect = appEl.querySelector('[data-action="new-phrasebook/lang"]');
    langSelect.value = "es";
    langSelect.dispatchEvent(new Event("change"));
    const abilitySelect = appEl.querySelector('[data-action="new-phrasebook/ability"]');
    abilitySelect.value = "advanced";
    abilitySelect.dispatchEvent(new Event("change"));

    appEl.querySelector('[data-action="new-phrasebook/create"]').click();
    await vi.waitFor(() => expect(createDeck).toHaveBeenCalledTimes(1));
    expect(createDeck).toHaveBeenCalledWith(PLACEHOLDER_DECK_NAME, "es", { ability: "advanced" });
    await vi.waitFor(() => expect(created).toBeTruthy());
    expect(created.lang).toBe("es");
  });
});

describe("openNewPhrasebookPanel — Confirm mode (suggestion)", () => {
  const suggestion = { id: "seed-greetings-ja", emoji: "👋", title: "Greetings", lang: "ja" };

  it("pre-fills language from the suggestion instead of the first supported language", () => {
    openNewPhrasebookPanel(appEl, { createDeck }, () => {}, () => {}, suggestion, () => {});
    expect(appEl.querySelector('[data-action="new-phrasebook/lang"]').value).toBe("ja");
  });

  it("shows confirm-specific copy: quoted title heading and 'View' button label", () => {
    openNewPhrasebookPanel(appEl, { createDeck }, () => {}, () => {}, suggestion, () => {});
    expect(appEl.querySelector(".new-phrasebook-header span").textContent).toBe('"Greetings" phrasebook');
    expect(appEl.querySelector('[data-action="new-phrasebook/create"]').textContent.trim()).toBe('View "Greetings" phrasebook');
  });

  it("does not call createDeck — hands language/ability to onConfirmed instead", async () => {
    let confirmed = null;
    openNewPhrasebookPanel(appEl, { createDeck }, () => {}, () => {}, suggestion, (args) => { confirmed = args; });
    const abilitySelect = appEl.querySelector('[data-action="new-phrasebook/ability"]');
    abilitySelect.value = "intermediate";
    abilitySelect.dispatchEvent(new Event("change"));

    appEl.querySelector('[data-action="new-phrasebook/create"]').click();
    await vi.waitFor(() => expect(confirmed).toBeTruthy());
    expect(createDeck).not.toHaveBeenCalled();
    expect(confirmed).toEqual({ lang: "ja", ability: "intermediate" });
  });
});
