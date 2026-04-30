import {
  db,
  getCards,
  getCardsByLang,
  getStarredCards,
  getDecks,
  getRecentDecks,
  updateDeckAccessTime,
  updateDeckMode,
  updateDeckName,
  updateDeckOrder,
  updateDeckReadingDisplay,
  deleteDeck,
  createDeck,
  importCards,
  exportAllData,
  restoreAllData,
} from "../js/db.js";

import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
// import { wireNavPaneGesture } from "../js/gestures.js";
import { buildContentPane } from "../panes/contentPane.js";
import { openGenerateCardsPanel } from "../components/generate-cards-panel.js";

const LAST_DECK_KEY = "loudmouth.lastDeckId";

export function getLastDeckId() {
  try {
    return localStorage.getItem(LAST_DECK_KEY);
  } catch {
    return null;
  }
}

export function setLastDeckId(deckId) {
  try {
    localStorage.setItem(LAST_DECK_KEY, deckId);
  } catch {
    /* ignore */
  }
}

const dbOps = {
  db,
  getDecks,
  getRecentDecks,
  getCardsByLang,
  createDeck,
  importCards,
  exportAllData,
  restoreAllData,
};
const settingsOps = {
  updateDeckMode,
  updateDeckName,
  updateDeckOrder,
  updateDeckReadingDisplay,
  deleteDeck,
};

// ── Nav pane HTML builder ────────────────────────────────────────────────────

function renderHeader(title) {
  return `
    <div class="deck-picker-section-header flex items-baseline justify-between section-label">
      ${title}
    </div>
  `;
}

/*==
 * Renders a singleton row for a deck, as used on the Navigation pane
 */
async function renderDeck(deck) {
  const cards = await getCards(deck.id);
  return `
    <div class="deck-picker-row flex items-center tappable" data-deck-id="${deck.id}">
      <div class="flex-row gap-md justify-center">
        <span class="text-h2 fg-body">${deck.name}</span>
        <span class="text-body2 fg-secondary">${cards.length} card${cards.length ? "s" : ""}</span>
      </div>
    </div>
  `;
}

// Renders a group of decks
async function renderDecks(decks) {
  return await Promise.all(decks.map(async (d) => await renderDeck(d))).then(
    (ds) => ds.join(""),
  );
}

async function renderRecentDecks() {
  const recentDecks = await getRecentDecks(3);
  if (recentDecks.length === 0) return "";

  return `
    ${renderHeader("Most recent")}
    ${await renderDecks(recentDecks)}
  `;
}

// Renders the deck row for the ephimeral "starred" deck
async function renderStarredDeck(lang) {
  const starredCount = await getStarredCards(lang).length;
  if (starredCount === 0) return "";

  return await renderDeck(
    { id: `starred:${lang}`, name: "★ Starred", lang },
    starredCount,
  );
}

// Render the group of decks for a given language
async function renderLangSection(lang, decks) {
  const flag = LANG_FLAGS[lang] ?? "";
  const name = LANG_NAMES[lang] ?? lang.toUpperCase();

  return `
    ${renderHeader(`
      <span>${flag} ${name}</span>
    `)}
    <div class="deck-picker-lang-group">
      ${await renderStarredDeck(lang)}
      ${await renderDecks(decks)}
    </div>
  `;
}

// Renders the content for the Nav pane
async function renderNavPane() {
  const allDecks = await getDecks(null, { includeSystem: false });

  // Collect the decks by language
  const byLang = {};
  for (const deck of allDecks) {
    (byLang[deck.lang] ??= []).push(deck);
  }
  for (const lang of Object.keys(byLang)) {
    byLang[lang].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Render all of the language sections
  let byLangHTML = "";
  for (const [lang, decks] of Object.entries(byLang).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    byLangHTML += await renderLangSection(lang, decks);
  }

  const isEmpty = allDecks.length === 0;

  return `
    <div class="pane-header">
      <span class="pane-header-spacer shrink-0"></span>
      <span class="pane-header-title flex-1 text-center text-header font-semibold fg-body bg-none no-tap-highlight">Decks</span>
      <span class="pane-header-spacer shrink-0"></span>
    </div>
    <div class="deck-list flex-1 overflow-y-auto">
      ${await renderRecentDecks()}
      ${byLangHTML}
      ${isEmpty ? '<p class="deck-picker-empty text-center fg-secondary">No decks yet.</p>' : ""}
    </div>
    <button class="nav-pane-add-fab flex items-center justify-center bg-accent fg-surface text-h2 shrink-0 tappable" aria-label="Add deck">＋</button>
  `;
}

// ── Main render ──────────────────────────────────────────────────────────────

export function buildNavPane(app, params) {
  async function init() {
    let deckId = params.id || getLastDeckId();
    if (!deckId) {
      const recent = await getRecentDecks(1);
      deckId = recent[0]?.id ?? null;
    }

    // ── Build nav shell ──────────────────────────────────────────────────────

    // el.innerHTML = `
    //   <div class="nav-shell fixed-inset overflow-hidden">
    //     <div id="nav-pane" class="nav-pane flex-col bg-primary overflow-y-auto"></div>
    //     <div id="nav-main" class="nav-main absolute-inset flex-col bg-primary transition-transform">
    //       <div id="nav-main-scrim" class="nav-main-scrim absolute-inset transition-opacity"></div>
    //       <div id="content-pane" class="screen flex-1 flex-col bg-primary overflow-hidden"></div>
    //     </div>
    //   </div>
    // `;

    // const app.navPane.el = el.querySelector("#nav-pane");
    // const navMainEl = el.querySelector("#nav-main");
    // const scrimEl = el.querySelector("#nav-main-scrim");

    // Populate nav pane
    app.els.navPane.innerHTML = await renderNavPane();

    // Wire nav pane gesture
    // const navPane = wireNavPaneGesture(navMainEl);

    // Scrim tap closes nav pane
    // scrimEl.addEventListener("click", () => app.navPane.close());

    function registerEvents() {
      // Nav pane deck selection
      app.els.navPane
        .querySelector(".deck-list")
        .addEventListener("click", async (e) => {
          const row = e.target.closest("[data-deck-id]");
          if (!row) return;
          app.navPane.close();
          await selectDeck(row.dataset.deckId);
        });

      app.els.navPane
        .querySelector(".nav-pane-add-fab")
        .addEventListener("click", () => openGenerateCards());
    }

    registerEvents();

    // ── Load deck content ────────────────────────────────────────────────────

    async function selectDeck(newDeckId) {
      setLastDeckId(newDeckId);
      if (!newDeckId.startsWith("lang:") && !newDeckId.startsWith("starred:")) {
        await updateDeckAccessTime(newDeckId);
      }
      deckId = newDeckId;
      await loadDeck();
    }

    async function refreshNavPane() {
      app.navPane.el.innerHTML = await renderNavPane();
      registerEvents();
    }

    function openGenerateCards() {
      openGenerateCardsPanel(
        el,
        { createDeck, importCards },
        async (newDeckId) => {
          await refreshNavPane();
          app.navPane.close();
          await selectDeck(newDeckId);
        },
      );
    }

    /**
     * Function that loads a selected deck into the content pane
     */

    await buildContentPane(deckId, document.querySelector(".nav-shell"));
  }

  init();
}
