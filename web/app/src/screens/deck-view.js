import {
  db,
  getCards,
  getCardsByLang,
  getStarredCards,
  toggleCardStar,
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
  applyCardOrder,
  updateDeckCardOrder,
  updateCard,
  deleteCard,
} from "../js/db.js";
import { DEFAULT_MODE } from "../js/modes.js";
import { decode as base64urlDecode } from "../js/base64url.js";
import { parseCardBatch } from "../js/import-parser.js";
import { speak, ttsText } from "../js/tts.js";

import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { stripHashParam } from "../js/utils.js";
import {
  wireNavPaneGesture,
  wireRevealGesture,
  wireCardReorder,
} from "../js/gestures.js";
import { renderCardRow } from "../components/card.js";
import { openAddCardsPanel } from "../components/add-cards-panel.js";
import { openDeckSettings } from "../components/deck-settings.js";
import { openCardReview } from "../components/card-review.js";
import { openCardEditPanel } from "../components/card-edit-panel.js";
import { openJsonPanel, toImportJson } from "../components/json-panel.js";
import { openGenerateCardsPanel } from "../components/generate-cards-panel.js";
import { openTranslationPanel } from "../components/translation-panel.js";
import { icon } from "../components/icon.js";

const LAST_DECK_KEY = "loudmouth.lastDeckId";

const ERROR = true;

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

/**
 *
 */
export function buildNavPane(el, params) {
  async function init() {
    let deckId = params.id || getLastDeckId();
    if (!deckId) {
      const recent = await getRecentDecks(1);
      deckId = recent[0]?.id ?? null;
    }

    // ── Build nav shell ──────────────────────────────────────────────────────

    el.innerHTML = `
      <div class="nav-shell fixed-inset overflow-hidden">
        <div id="nav-pane" class="nav-pane flex-col bg-primary overflow-y-auto"></div>
        <div id="nav-main" class="nav-main absolute-inset flex-col bg-primary transition-transform">
          <div id="nav-main-scrim" class="nav-main-scrim absolute-inset transition-opacity"></div>
          <div id="content-pane" class="screen flex-1 flex-col bg-primary overflow-hidden"></div>
        </div>
      </div>
    `;

    const navPaneEl = el.querySelector("#nav-pane");
    const navMainEl = el.querySelector("#nav-main");
    const scrimEl = el.querySelector("#nav-main-scrim");
    const contentPaneEl = el.querySelector("#content-pane");

    // Populate nav pane
    navPaneEl.innerHTML = await renderNavPane();

    // Wire nav pane gesture
    const navPane = wireNavPaneGesture(navMainEl);

    // Scrim tap closes nav pane
    scrimEl.addEventListener("click", () => navPane.close());

    function registerEvents() {
      // Nav pane deck selection
      navPaneEl
        .querySelector(".deck-list")
        .addEventListener("click", async (e) => {
          const row = e.target.closest("[data-deck-id]");
          if (!row) return;
          navPane.close();
          await selectDeck(row.dataset.deckId);
        });

      navPaneEl
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
      navPaneEl.innerHTML = await renderNavPane();
      registerEvents();
    }

    function openGenerateCards() {
      openGenerateCardsPanel(
        el,
        { createDeck, importCards },
        async (newDeckId) => {
          await refreshNavPane();
          navPane.close();
          await selectDeck(newDeckId);
        },
      );
    }

    /**
     * Function that loads a selected deck into the content pane
     */
    async function loadDeck() {
      if (!deckId) {
        contentPaneEl.innerHTML = `
          <div class="deck-view-empty text-center fg-secondary">
            <p>No decks yet.</p>
            <button id="btn-import-cards" class="btn btn-primary">Import cards</button>
          </div>
        `;
        contentPaneEl
          .querySelector("#btn-import-cards")
          .addEventListener("click", () => openGenerateCards());
        return;
      }

      // Load the cards into the `deck` object
      let cards,
        isStarredView = false;
      let deck = { mode: DEFAULT_MODE, order: "default", system: true };
      if (deckId.startsWith("lang:")) {
        const lang = deckId.split(":")[1];
        cards = await getCardsByLang(lang);
        const langName = LANG_NAMES[lang] ?? lang.toUpperCase();
        deck = {
          ...deck,
          ...{ id: deckId, name: `All ${langName} Cards`, lang },
        };
      } else if (deckId.startsWith("starred:")) {
        isStarredView = true;
        const lang = deckId.split(":")[1];
        cards = await getStarredCards(lang);
        const langName = LANG_NAMES[lang] ?? lang.toUpperCase();
        deck = {
          ...deck,
          ...{ id: deckId, name: `★ Starred ${langName}`, lang },
        };
      } else {
        deck = await db.decks.get(deckId);
        if (!deck) {
          contentPaneEl.innerHTML = `
            <div class="deck-view-empty text-center fg-secondary">
              <p>Deck not found.</p>
            </div>
          `;
          return;
        }
        cards = await getCards(deckId);
        cards = applyCardOrder(
          cards,
          deck.order || "default",
          deck.cardOrder || null,
        );
      }

      el.dataset.mode = deck.mode;

      // HTML for the Content pane
      contentPaneEl.innerHTML = `
        <div class="pane-header flex items-center">
          <button class="icon-button" id="btn-menu" aria-label="Menu">${icon("Menu")}</button>
          <button class="pane-header-title flex-1 text-center text-header fg-body tappable" id="btn-deck-title">${deck.name}</button>
          ${
            deck.system
              ? '<span class="pane-header-spacer shrink-0"></span>'
              : `
              <button class="icon-button" id="btn-deck-add" aria-label="Translate">${icon("Add")}</button>
              <button class="icon-button deck-header-done" id="btn-deck-done" aria-label="Done">${icon("Done")}</button>
            `
          }
        </div>
        <div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto">
          ${
            cards.length === 0
              ? `<div class="deck-view-empty text-center fg-secondary"><p>No cards in this deck.</p></div>`
              : cards
                  .map((card) => renderCardRow(card, deck.readingDisplay))
                  .join("")
          }
        </div>
        ${
          deck.system
            ? ""
            : `
          <div class="deck-view-add-cards-bar shrink-0 flex items-center px-5 py-4">
            <button class="deck-view-add-cards-btn flex-1 text-body1 fg-tertiary surface-field" id="btn-edit-add-cards" aria-label="Add cards">
              Add cards
            </button>
          </div>
        `
        }
      `;

      const listEl = contentPaneEl.querySelector(".deck-view-list");
      const editOps = { updateCard, deleteCard };
      const reveal = wireRevealGesture(
        listEl,
        ".card-row-wrapper",
        ".card-row",
        undefined,
        undefined,
        () => "editMode" in contentPaneEl.dataset,
      );
      navPane.setSuppressed(
        () => reveal.isAnyOpen() || "editMode" in contentPaneEl.dataset,
      );

      function onSaveCard(updatedCard) {
        const idx = cards.findIndex(
          (c) => String(c.id) === String(updatedCard.id),
        );
        if (idx >= 0) cards[idx] = updatedCard;
        const wrapperEl = contentPaneEl.querySelector(
          `.card-row-wrapper[data-card-id="${updatedCard.id}"]`,
        );
        if (wrapperEl) {
          const tmp = document.createElement("div");
          tmp.innerHTML = renderCardRow(updatedCard, deck.readingDisplay);
          wrapperEl.replaceWith(tmp.firstElementChild);
        }
      }

      function onDeleteCard(cardId) {
        const idx = cards.findIndex((c) => String(c.id) === String(cardId));
        if (idx >= 0) cards.splice(idx, 1);
        const wrapperEl = contentPaneEl.querySelector(
          `.card-row-wrapper[data-card-id="${cardId}"]`,
        );
        if (wrapperEl) wrapperEl.remove();
        if (cards.length === 0) {
          const list = contentPaneEl.querySelector(".deck-view-list");
          if (list)
            list.innerHTML = `<div class="deck-view-empty text-center fg-secondary"><p>No cards in this deck.</p></div>`;
        }
      }

      listEl.addEventListener("click", async (e) => {
        // In edit mode, only the reorder handle is active — block all other interactions
        if ("editMode" in contentPaneEl.dataset) return;

        const starBtn = e.target.closest(".card-row-star-btn");
        if (starBtn) {
          reveal.reset();
          const cardId = starBtn.dataset.cardId;
          const cardIdx = cards.findIndex((c) => String(c.id) === cardId);
          if (cardIdx >= 0) {
            const nowStarred = await toggleCardStar(cardId);
            const updatedCard = {
              ...cards[cardIdx],
              state: {
                ...(cards[cardIdx].state || {}),
                starredAt: nowStarred ? new Date().toISOString() : null,
              },
            };
            if (isStarredView && !nowStarred) {
              onDeleteCard(cardId);
            } else {
              onSaveCard(updatedCard);
            }
          }
          return;
        }

        const editBtn = e.target.closest(".card-row-edit-btn");
        if (editBtn) {
          reveal.reset();
          const card = cards.find(
            (c) => String(c.id) === editBtn.dataset.cardId,
          );
          if (card)
            openCardEditPanel(el, card, editOps, onSaveCard, onDeleteCard);
          return;
        }

        const wrapper = e.target.closest(".card-row-wrapper");
        if (wrapper && wrapper.classList.contains("card-row-wrapper--swiped")) {
          reveal.reset();
          return;
        }

        const playBtn = e.target.closest(".card-row-play");
        if (playBtn) {
          e.stopPropagation();
          const card = cards.find(
            (c) => String(c.id) === playBtn.dataset.cardId,
          );
          if (card) speak(ttsText(card), card.lang);
          return;
        }

        const row = e.target.closest(".card-row");
        if (!row) return;
        const idx = cards.findIndex((c) => String(c.id) === row.dataset.cardId);
        openCardReview(el, cards, deck, idx < 0 ? 0 : idx);
      });

      contentPaneEl
        .querySelector("#btn-menu")
        .addEventListener("click", () => navPane.open());

      function closeTitleMenu() {
        document.getElementById("deck-title-menu")?.remove();
      }

      function showTitleMenu(anchor) {
        const rect = anchor.getBoundingClientRect();
        const menu = document.createElement("div");
        menu.id = "deck-title-menu";
        menu.className = "deck-title-menu bg-surface overflow-hidden";
        menu.style.top = rect.bottom + 4 + "px";
        menu.innerHTML = `
          <button class="deck-title-menu-item fg-body text-menu-item text-left tappable" id="dtm-settings">Settings</button>
          <button class="deck-title-menu-item fg-body text-menu-item text-left tappable" id="dtm-edit">Edit cards</button>
        `;
        document.body.appendChild(menu);
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            menu.classList.add("deck-title-menu--visible"),
          ),
        );
        menu.querySelector("#dtm-settings").addEventListener("click", () => {
          closeTitleMenu();
          openDeckSettings(
            el,
            deck,
            {
              ...settingsOps,
              exportJson: () =>
                openJsonPanel(el, deck.name, toImportJson(cards)),
            },
            async (changes) => {
              if (changes.deleted) {
                deckId = null;
                await refreshNavPane();
              } else {
                await refreshNavPane();
              }
              await loadDeck();
            },
          );
        });
        menu.querySelector("#dtm-edit").addEventListener("click", () => {
          closeTitleMenu();
          contentPaneEl.dataset.editMode = "";
        });
        setTimeout(
          () =>
            document.addEventListener("click", closeTitleMenu, {
              once: true,
              capture: true,
            }),
          0,
        );
      }

      const titleBtn = contentPaneEl.querySelector("#btn-deck-title");
      if (deck.system) {
        titleBtn.addEventListener("click", () => navPane.open());
      } else {
        titleBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (document.getElementById("deck-title-menu")) {
            closeTitleMenu();
            return;
          }
          showTitleMenu(titleBtn);
        });
        contentPaneEl
          .querySelector("#btn-deck-done")
          .addEventListener("click", () => {
            delete contentPaneEl.dataset.editMode;
          });
      }

      if (!deck.system) {
        contentPaneEl
          .querySelector("#btn-deck-add")
          .addEventListener("click", () => {
            openTranslationPanel(el, deck, { importCards }, (addedCard) => {
              cards.push(addedCard);
              const list = contentPaneEl.querySelector(".deck-view-list");
              if (list) {
                // Remove empty state if present
                const empty = list.querySelector(".deck-view-empty");
                if (empty) empty.remove();
                const tmp = document.createElement("div");
                tmp.innerHTML = renderCardRow(addedCard, deck.readingDisplay);
                list.appendChild(tmp.firstElementChild);
              }
            });
          });

        contentPaneEl
          .querySelector("#btn-edit-add-cards")
          ?.addEventListener("click", () => {
            const prevIds = new Set(cards.map((c) => c.id));
            openGenerateCardsPanel(
              el,
              { createDeck, importCards },
              async () => {
                const freshCards = await getCards(deck.id);
                const addedCards = freshCards.filter((c) => !prevIds.has(c.id));
                for (const c of addedCards) cards.push(c);
                const list = contentPaneEl.querySelector(".deck-view-list");
                if (list) {
                  const empty = list.querySelector(".deck-view-empty");
                  if (empty) empty.remove();
                  for (const card of addedCards) {
                    const tmp = document.createElement("div");
                    tmp.innerHTML = renderCardRow(card, deck.readingDisplay);
                    list.appendChild(tmp.firstElementChild);
                  }
                }
              },
              deck,
            );
          });

        wireCardReorder(listEl, async (fromIndex, toIndex) => {
          const moved = cards.splice(fromIndex, 1)[0];
          cards.splice(toIndex, 0, moved);
          await updateDeckCardOrder(
            deck.id,
            cards.map((c) => c.id),
          );
        });
      }
    }

    await loadDeck();
  }

  init();
}
