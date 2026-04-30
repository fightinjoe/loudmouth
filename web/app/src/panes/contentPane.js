import {
  db,
  getCards,
  getCardsByLang,
  getStarredCards,
  toggleCardStar,
  getDecks,
  getRecentDecks,
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
import { speak, ttsText } from "../js/tts.js";

import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { wireRevealGesture, wireCardReorder } from "../js/gestures.js";
import { renderCardRow } from "../components/card.js";
import { openDeckSettings } from "../components/deck-settings.js";
import { openCardReview } from "../components/card-review.js";
import { openCardEditPanel } from "../components/card-edit-panel.js";
import { openJsonPanel, toImportJson } from "../components/json-panel.js";
import { openGenerateCardsPanel } from "../components/generate-cards-panel.js";
import { openTranslationPanel } from "../components/translation-panel.js";
import { icon } from "../components/icon.js";

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

/**
 * Function that loads a selected deck into the content pane
 */
export async function buildContentPane(deckId, el) {
  const contentPaneEl = el.querySelector("#content-pane");

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
    const idx = cards.findIndex((c) => String(c.id) === String(updatedCard.id));
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
      const card = cards.find((c) => String(c.id) === editBtn.dataset.cardId);
      if (card) openCardEditPanel(el, card, editOps, onSaveCard, onDeleteCard);
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
      const card = cards.find((c) => String(c.id) === playBtn.dataset.cardId);
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
          exportJson: () => openJsonPanel(el, deck.name, toImportJson(cards)),
        },
        async (changes) => {
          if (changes.deleted) {
            deckId = null;
            await refreshNavPane();
          } else {
            await refreshNavPane();
          }
          await buildContentPane();
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
