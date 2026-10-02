// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { openNewPhrasebookPanel } from "../components/new-phrasebook-panel";
import { setLastAbility } from "../js/preferences";

let appEl;

beforeEach(() => {
  appEl = document.createElement("div");
  document.body.appendChild(appEl);
  localStorage.clear();
});

const suggestion = { id: "seed-greetings-ja", emoji: "👋", title: "Greetings", lang: "ja" };

describe("openNewPhrasebookPanel", () => {

  it.each(["ja", "uk"])("restores the remembered %s ability when switching languages", (lang) => {
    setLastAbility(lang, "conversational");
    openNewPhrasebookPanel(appEl, () => {}, suggestion, () => {});
    let langSelect = appEl.querySelector('[data-action="new-phrasebook/lang"]');
    langSelect.value = lang;
    langSelect.dispatchEvent(new Event("change"));
    expect(appEl.querySelector('[data-action="new-phrasebook/ability"]').value).toBe("conversational");
    langSelect = appEl.querySelector('[data-action="new-phrasebook/lang"]');
    langSelect.value = "es";
    langSelect.dispatchEvent(new Event("change"));
    expect(appEl.querySelector('[data-action="new-phrasebook/ability"]').value).toBe("basics");
    langSelect = appEl.querySelector('[data-action="new-phrasebook/lang"]');
    langSelect.value = lang;
    langSelect.dispatchEvent(new Event("change"));
    expect(appEl.querySelector('[data-action="new-phrasebook/ability"]').value).toBe("conversational");
  });

});

describe("openNewPhrasebookPanel — Confirm mode (suggestion)", () => {

  it("pre-fills language from the suggestion instead of the first supported language", () => {
    openNewPhrasebookPanel(appEl, () => {}, suggestion, () => {});
    expect(appEl.querySelector('[data-action="new-phrasebook/lang"]').value).toBe("ja");
  });


  it("hands language and ability to onConfirmed", async () => {
    let confirmed = null;
    openNewPhrasebookPanel(appEl, () => {}, suggestion, (args) => { confirmed = args; });
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
      { ...suggestion, title: hostileTitle },
      () => {},
    );

    expect(appEl.querySelector("img")).toBeNull();
    expect(appEl.querySelector(".new-phrasebook-header span").textContent).toBe(`"${hostileTitle}" phrasebook`);
    expect(appEl.querySelector('[data-action="new-phrasebook/create"]').textContent.trim())
      .toBe(`View "${hostileTitle}" phrasebook`);
  });
});
