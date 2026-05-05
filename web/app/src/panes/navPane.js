import {
  db,
  getCards,
  getStarredCards,
  getDecks,
  getRecentDecks,
  updateDeckAccessTime,
  createDeck,
  importCards,
  exportAllData,
  restoreAllData,
  getCardsByLang,
} from "../js/db.js";

import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { openGenerateCardsPanel } from "../components/generate-cards-panel.js";

// ── Renderers (pure HTML) ────────────────────────────────────────────────────

function renderHeader(title) {
  return `
    <div class="deck-picker-section-header flex items-baseline justify-between section-label">
      ${title}
    </div>
  `;
}

async function renderDeck(deck) {
  const cards = await getCards(deck.id);
  return `
    <div class="deck-picker-row flex items-center tappable" data-deck-id="${deck.id}">
      <div class="flex-row gap-md justify-center">
        <span class="text-h2 fg-body">${deck.name}</span>
        <span class="text-body2 fg-secondary">${cards.length} card${cards.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  `;
}

async function renderDecks(decks) {
  return (await Promise.all(decks.map(renderDeck))).join("");
}

async function renderRecentDecks() {
  const recentDecks = await getRecentDecks(3);
  if (recentDecks.length === 0) return "";
  return `
    ${renderHeader("Most recent")}
    ${await renderDecks(recentDecks)}
  `;
}

async function renderStarredDeck(lang) {
  const starred = await getStarredCards(lang);
  if (starred.length === 0) return "";
  return renderDeck({ id: `starred:${lang}`, name: "★ Starred", lang });
}

async function renderLangSection(lang, decks) {
  const flag = LANG_FLAGS[lang] ?? "";
  const name = LANG_NAMES[lang] ?? lang.toUpperCase();
  return `
    ${renderHeader(`<span>${flag} ${name}</span>`)}
    <div class="deck-picker-lang-group">
      ${await renderStarredDeck(lang)}
      ${await renderDecks(decks)}
    </div>
  `;
}

async function renderNavPaneHTML() {
  const allDecks = await getDecks(null, { includeSystem: false });

  const byLang = {};
  for (const deck of allDecks) {
    (byLang[deck.lang] ??= []).push(deck);
  }
  for (const lang of Object.keys(byLang)) {
    byLang[lang].sort((a, b) => a.name.localeCompare(b.name));
  }

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

// ── Builder ──────────────────────────────────────────────────────────────────

export function initNavPane(app, params) {
  const { navPaneEl } = app.els;
  const meatEl = navPaneEl.querySelector(".meat");

  async function refresh() {
    meatEl.innerHTML = await renderNavPaneHTML();
  }

  function openGenerateCards() {
    openGenerateCardsPanel(
      document.getElementById("app"),
      { createDeck, importCards },
      async (newDeckId) => {
        await refresh();
        app.navPane.close();
        app.contentPane.loadDeck(newDeckId);
      },
    );
  }

  async function openCardFullScreen(row) {
    app.navPane.close();
    const deckId = row.dataset.deckId;
    app.setLastDeckId(deckId);
    if (!deckId.startsWith("lang:") && !deckId.startsWith("starred:")) {
      await updateDeckAccessTime(deckId);
    }
    app.contentPane.loadDeck(deckId);
  }

  // One delegated click listener on the stable nav pane element — never re-attached
  navPaneEl.addEventListener("click", async (e) => {
    // Clicking the FAB
    if (closest(".nav-pane-add-fab")) return openGenerateCards();

    // Click a card in the deck
    const row = e.target.closest("[data-deck-id]");
    if (row) return await openCardFullScreen(row);
  });

  // Expose refresh so contentPane can trigger it after settings changes
  app.panes.nav.refresh = refresh;

  refresh();
}

const closest = (e, selector) => e.target.closest(selector);
