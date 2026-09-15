// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { openNewPhrasebookPanel } from "../components/new-phrasebook-panel.js";
import { setLastAbility } from "../js/preferences.js";

let appEl;

beforeEach(() => {
  appEl = document.createElement("div");
  document.body.appendChild(appEl);
  localStorage.clear();
});

describe("openNewPhrasebookPanel", () => {
  it("defaults to the first language and hides ability during setup", () => {
    openNewPhrasebookPanel(appEl, () => {}, () => {});
    expect(appEl.querySelector('[data-action="new-phrasebook/lang"]').value).toBe("zh");
    expect(appEl.querySelector(".new-phrasebook-body").dataset.suggestion).toBe("false");
  });

  it("pre-fills ability from the last-used-per-language preference when switching language", () => {
    setLastAbility("ja", "conversational");
    openNewPhrasebookPanel(appEl, () => {}, () => {});
    const langSelect = appEl.querySelector('[data-action="new-phrasebook/lang"]');
    langSelect.value = "ja";
    langSelect.dispatchEvent(new Event("change"));
    expect(appEl.querySelector('[data-action="new-phrasebook/ability"]').value).toBe("conversational");
  });

  it("hands only language to guided creation without persisting ability", async () => {
    let createdLang = null;
    let createdAbility = null;
    openNewPhrasebookPanel(appEl, (lang, ability) => { createdLang = lang; createdAbility = ability; }, () => {});
    const langSelect = appEl.querySelector('[data-action="new-phrasebook/lang"]');
    langSelect.value = "es";
    langSelect.dispatchEvent(new Event("change"));
    const abilitySelect = appEl.querySelector('[data-action="new-phrasebook/ability"]');
    abilitySelect.value = "conversational";
    abilitySelect.dispatchEvent(new Event("change"));

    appEl.querySelector('[data-action="new-phrasebook/create"]').click();
    await vi.waitFor(() => expect(createdLang).toBeTruthy());
    expect(createdLang).toBe("es");
    expect(createdAbility).toBeUndefined();
  });
});

describe("openNewPhrasebookPanel — Confirm mode (suggestion)", () => {
  const suggestion = { id: "seed-greetings-ja", emoji: "👋", title: "Greetings", lang: "ja" };

  it("pre-fills language from the suggestion instead of the first supported language", () => {
    openNewPhrasebookPanel(appEl, () => {}, () => {}, suggestion, () => {});
    expect(appEl.querySelector('[data-action="new-phrasebook/lang"]').value).toBe("ja");
  });

  it("shows confirm-specific copy: quoted title heading and 'View' button label", () => {
    openNewPhrasebookPanel(appEl, () => {}, () => {}, suggestion, () => {});
    expect(appEl.querySelector(".new-phrasebook-header span").textContent).toBe('"Greetings" phrasebook');
    expect(appEl.querySelector('[data-action="new-phrasebook/create"]').textContent.trim()).toBe('View "Greetings" phrasebook');
  });

  it("hands language and ability to onConfirmed", async () => {
    let confirmed = null;
    openNewPhrasebookPanel(appEl, () => {}, () => {}, suggestion, (args) => { confirmed = args; });
    const abilitySelect = appEl.querySelector('[data-action="new-phrasebook/ability"]');
    abilitySelect.value = "basics";
    abilitySelect.dispatchEvent(new Event("change"));

    appEl.querySelector('[data-action="new-phrasebook/create"]').click();
    await vi.waitFor(() => expect(confirmed).toBeTruthy());
    expect(confirmed).toEqual({ lang: "ja", ability: "basics" });
  });

  it("renders a hostile suggested title literally without creating elements", () => {
    const hostileTitle = '<img src=x onerror="window.__injected=true">';
    openNewPhrasebookPanel(
      appEl,
      () => {},
      () => {},
      { ...suggestion, title: hostileTitle },
      () => {},
    );

    expect(appEl.querySelector("img")).toBeNull();
    expect(appEl.querySelector(".new-phrasebook-header span").textContent).toBe(`"${hostileTitle}" phrasebook`);
    expect(appEl.querySelector('[data-action="new-phrasebook/create"]').textContent.trim())
      .toBe(`View "${hostileTitle}" phrasebook`);
  });
});
