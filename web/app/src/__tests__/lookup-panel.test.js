// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { saveTermCard, updateDeckVibe, updateDeckName } = vi.hoisted(() => ({
  saveTermCard: vi.fn(async (card, deckId) => ({
    id: `saved-${Math.random().toString(36).slice(2)}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...card,
    deckIds: [deckId],
  })),
  updateDeckVibe: vi.fn(async () => {}),
  updateDeckName: vi.fn(async () => {}),
}));
vi.mock("../js/db.js", () => ({ saveTermCard, updateDeckVibe, updateDeckName }));

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("../js/lookup-api.js", () => ({ lookup }));

import { openLookupPanel } from "../components/lookup-panel.js";
import { PLACEHOLDER_DECK_NAME } from "../components/new-phrasebook-panel.js";
let deck;

const sampleResponse = {
  blocks: [
    {
      card: { lang: "ja", text: "晩ご飯", translation: "dinner", reading: [["晩", "ばん"], ["ご飯", "ごはん"]] },
      groups: [
        {
          title: "Ordering at a restaurant",
          cards: [
            { lang: "ja", text: "メニュー", translation: "menu", type: "word" },
            { lang: "ja", text: "お会計", translation: "check, please", type: "phrase" },
          ],
        },
      ],
    },
  ],
};

let appEl;

beforeEach(() => {
  appEl = document.createElement("div");
  document.body.appendChild(appEl);
  deck = { id: "d1", name: "Dinner", lang: "ja", ability: "beginner", formality: "polite", audience: "staff" };
  localStorage.clear();
  saveTermCard.mockClear();
  updateDeckVibe.mockClear();
  updateDeckName.mockClear();
  lookup.mockReset();
});

function pressEnter(inputEl) {
  inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

function typeAndSubmit(appEl, term) {
  const inputEl = appEl.querySelector(".lookup-input-field");
  inputEl.value = term;
  inputEl.dispatchEvent(new Event("input"));
  pressEnter(inputEl);
}

describe("openLookupPanel — Input mode", () => {
  it("renders the language flag/name and an empty field", () => {
    openLookupPanel(appEl, deck, {}, () => {}, () => {});
    expect(appEl.querySelector(".pane-header-title").textContent).toContain("Japanese");
    expect(appEl.querySelector(".lookup-input-field").value).toBe("");
  });

  it("VIBE opens expanded on a phrasebook's first-ever translation", () => {
    openLookupPanel(appEl, deck, { hasTranslatedBefore: false }, () => {}, () => {});
    expect(appEl.querySelector(".lookup-vibe-group").dataset.expanded).toBe("true");
  });

  it("VIBE opens collapsed when the phrasebook has translated before", () => {
    openLookupPanel(appEl, deck, { hasTranslatedBefore: true }, () => {}, () => {});
    expect(appEl.querySelector(".lookup-vibe-group").dataset.expanded).toBe("false");
    expect(appEl.querySelector(".lookup-vibe-summary-label").textContent).toBe("Polite conversation with staff");
  });

  it("back in Input mode dismisses the whole pane", () => {
    let dismissed = false;
    openLookupPanel(appEl, deck, {}, () => {}, () => { dismissed = true; });
    const panel = appEl.querySelector(".lookup-panel");
    appEl.querySelector('[data-action="lookup/back"]').click();
    panel.dispatchEvent(new Event("transitionend"));
    expect(dismissed).toBe(true);
  });

  it("changing formality persists immediately via updateDeckVibe", () => {
    openLookupPanel(appEl, deck, { hasTranslatedBefore: true }, () => {}, () => {});
    appEl.querySelector('[data-action="lookup/vibe-toggle"]').click(); // expand
    const select = appEl.querySelector('[data-action="lookup/formality"]');
    select.value = "casual";
    select.dispatchEvent(new Event("change"));
    expect(updateDeckVibe).toHaveBeenCalledWith("d1", { formality: "casual" });
  });

  it("submission fires only on Enter, not on every keystroke", () => {
    openLookupPanel(appEl, deck, {}, () => {}, () => {});
    const inputEl = appEl.querySelector(".lookup-input-field");
    inputEl.value = "dinner";
    inputEl.dispatchEvent(new Event("input"));
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("openLookupPanel — submit + Translation mode", () => {
  it("calls /lookup with the phrasebook's language/ability/formality/audience and shows a loading skeleton first", async () => {
    let resolveLookup;
    lookup.mockReturnValueOnce(new Promise((res) => { resolveLookup = res; }));
    openLookupPanel(appEl, deck, {}, () => {}, () => {});
    typeAndSubmit(appEl, "dinner");

    expect(lookup).toHaveBeenCalledWith({
      term: "dinner",
      language: "ja",
      ability: "beginner",
      formality: "polite",
      audience: "staff",
    });
    expect(appEl.querySelector(".lookup-skeleton-list")).toBeTruthy();
    expect(appEl.querySelector(".pane-header-title").textContent).toBe('"dinner"');

    resolveLookup(sampleResponse);
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-card")).toBeTruthy());
    expect(appEl.querySelector(".lookup-card-headword").textContent).toBe("dinner");
  });

  it("shows an error message when /lookup rejects", async () => {
    lookup.mockRejectedValueOnce(new Error("LLM request failed"));
    openLookupPanel(appEl, deck, {}, () => {}, () => {});
    typeAndSubmit(appEl, "dinner");
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-error")).toBeTruthy());
    expect(appEl.querySelector(".lookup-error").textContent).toContain("LLM request failed");
  });

  it("back from Translation mode returns to Input mode", async () => {
    lookup.mockResolvedValueOnce(sampleResponse);
    openLookupPanel(appEl, deck, {}, () => {}, () => {});
    typeAndSubmit(appEl, "dinner");
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-card")).toBeTruthy());
    appEl.querySelector('[data-action="lookup/back"]').click();
    expect(appEl.querySelector(".lookup-input-field")).toBeTruthy();
  });

  it("records the term in HISTORY, shown next time Input mode is empty", async () => {
    lookup.mockResolvedValueOnce(sampleResponse);
    openLookupPanel(appEl, deck, {}, () => {}, () => {});
    typeAndSubmit(appEl, "dinner");
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-card")).toBeTruthy());
    appEl.querySelector('[data-action="lookup/back"]').click();
    expect(appEl.querySelector('[data-action="lookup/history-item"]').dataset.term).toBe("dinner");
  });

  it("tapping a HISTORY item re-runs that look-up", async () => {
    lookup.mockResolvedValue(sampleResponse);
    openLookupPanel(appEl, deck, {}, () => {}, () => {});
    typeAndSubmit(appEl, "dinner");
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-card")).toBeTruthy());
    appEl.querySelector('[data-action="lookup/back"]').click();
    appEl.querySelector('[data-action="lookup/history-item"]').click();
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-card")).toBeTruthy());
    expect(lookup).toHaveBeenLastCalledWith(expect.objectContaining({ term: "dinner" }));
  });
});

describe("openLookupPanel — save + basket badge", () => {
  async function openWithResults(onSaved = () => {}) {
    lookup.mockResolvedValueOnce(sampleResponse);
    openLookupPanel(appEl, deck, {}, onSaved, () => {});
    typeAndSubmit(appEl, "dinner");
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-card")).toBeTruthy());
  }

  it("saving the primary card commits it immediately and shows no badge before any save", async () => {
    await openWithResults();
    expect(appEl.querySelector(".lookup-badge")).toBeFalsy();
    appEl.querySelector('[data-action="lookup/save"]').click();
    await vi.waitFor(() => expect(saveTermCard).toHaveBeenCalledTimes(1));
    expect(saveTermCard).toHaveBeenCalledWith(sampleResponse.blocks[0].card, "d1");
  });

  it("increments the header badge per save and tints the saved card", async () => {
    const onSaved = vi.fn();
    await openWithResults(onSaved);
    appEl.querySelector('[data-action="lookup/save"]').click();
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-badge")).toBeTruthy());
    expect(appEl.querySelector(".lookup-badge").textContent).toBe("1");
    expect(appEl.querySelector(".lookup-card").dataset.saved).toBe("true");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("tapping the badge dismisses the whole stack to the phrasebook", async () => {
    let dismissed = false;
    await openWithResults();
    appEl.querySelector('[data-action="lookup/save"]').click();
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-badge")).toBeTruthy());
    // Re-open with a fresh onDismiss to observe the badge-tap dismissal path.
    const panel = appEl.querySelector(".lookup-panel");
    appEl.querySelector('[data-action="lookup/badge"]').click();
    panel.dispatchEvent(new Event("transitionend"));
    expect(panel.isConnected).toBe(false);
  });
});

describe("openLookupPanel — Group mode + re-seed", () => {
  async function openWithResults() {
    lookup.mockResolvedValueOnce(sampleResponse);
    openLookupPanel(appEl, deck, {}, () => {}, () => {});
    typeAndSubmit(appEl, "dinner");
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-card")).toBeTruthy());
  }

  it("opening a group shows its full card list", async () => {
    await openWithResults();
    appEl.querySelector('[data-action="lookup/open-group"]').click();
    expect(appEl.querySelector(".pane-header-title").textContent).toBe("Ordering at a restaurant");
    expect(appEl.querySelectorAll(".lookup-card")).toHaveLength(2);
  });

  it("back from Group mode returns to Translation mode", async () => {
    await openWithResults();
    appEl.querySelector('[data-action="lookup/open-group"]').click();
    appEl.querySelector('[data-action="lookup/back"]').click();
    expect(appEl.querySelector(".pane-header-title").textContent).toBe('"dinner"');
  });

  it("🔍 on a group card re-seeds Input with text + group name in parentheses", async () => {
    await openWithResults();
    appEl.querySelector('[data-action="lookup/open-group"]').click();
    appEl.querySelector('[data-action="lookup/reseed"]').click();
    expect(appEl.querySelector(".lookup-input-field").value).toBe("メニュー (Ordering at a restaurant)");
  });

  it("🔍 on a primary card with no group prefills with just the card's text", async () => {
    await openWithResults();
    appEl.querySelector('[data-action="lookup/reseed"]').click();
    expect(appEl.querySelector(".lookup-input-field").value).toBe("晩ご飯");
  });

  it("re-seeding collapses VIBE (never treated as a first look-up)", async () => {
    lookup.mockResolvedValueOnce(sampleResponse);
    openLookupPanel(appEl, deck, { hasTranslatedBefore: false }, () => {}, () => {});
    typeAndSubmit(appEl, "dinner");
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-card")).toBeTruthy());
    appEl.querySelector('[data-action="lookup/reseed"]').click();
    expect(appEl.querySelector(".lookup-vibe-group").dataset.expanded).toBe("false");
  });

  it("saving a group card is independently tracked from the primary card", async () => {
    await openWithResults();
    appEl.querySelector('[data-action="lookup/open-group"]').click();
    appEl.querySelectorAll('[data-action="lookup/save"]')[0].click();
    await vi.waitFor(() => expect(saveTermCard).toHaveBeenCalledTimes(1));
    appEl.querySelector('[data-action="lookup/back"]').click();
    // Primary card in Translation mode is unaffected by the group-card save.
    expect(appEl.querySelector(".lookup-card").dataset.saved).toBe("false");
  });
});

describe("openLookupPanel — auto-name a freshly created phrasebook", () => {
  it("renames a placeholder-named deck to '{Term} phrasebook' on first save", async () => {
    deck.name = PLACEHOLDER_DECK_NAME;
    lookup.mockResolvedValueOnce(sampleResponse);
    let onDeckRenamedArg = null;
    openLookupPanel(appEl, deck, {}, () => {}, () => {}, (renamed) => { onDeckRenamedArg = renamed; });
    typeAndSubmit(appEl, "dinner");
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-card")).toBeTruthy());
    appEl.querySelector('[data-action="lookup/save"]').click();
    await vi.waitFor(() => expect(updateDeckName).toHaveBeenCalledTimes(1));
    expect(updateDeckName).toHaveBeenCalledWith("d1", "Dinner phrasebook");
    expect(onDeckRenamedArg?.name).toBe("Dinner phrasebook");
  });

  it("does not rename a phrasebook that already has a real name", async () => {
    deck.name = "My Existing Phrasebook";
    lookup.mockResolvedValueOnce(sampleResponse);
    openLookupPanel(appEl, deck, {}, () => {}, () => {});
    typeAndSubmit(appEl, "dinner");
    await vi.waitFor(() => expect(appEl.querySelector(".lookup-card")).toBeTruthy());
    appEl.querySelector('[data-action="lookup/save"]').click();
    await vi.waitFor(() => expect(saveTermCard).toHaveBeenCalledTimes(1));
    expect(updateDeckName).not.toHaveBeenCalled();
  });
});
