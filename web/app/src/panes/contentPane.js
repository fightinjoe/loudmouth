import {
  db,
  getCards,
  getCardsByLang,
  getStarredCards,
  toggleCardStar,
  updateDeckMode,
  updateDeckName,
  updateDeckOrder,
  updateDeckReadingDisplay,
  deleteDeck,
  createDeck,
  importCards,
  applyCardOrder,
  updateDeckCardOrder,
  updateCard,
  deleteCard,
} from "../js/db.js";
import { DEFAULT_MODE } from "../js/modes.js";
import { speak, ttsText } from "../js/tts.js";
import { LANG_NAMES } from "../js/lang.js";
import { wireContentPaneGestures } from "./contentPaneGestures.js";
import { renderCardRow } from "../components/card.js";
import { openDeckSettings } from "../components/deck-settings.js";
import { openCardReview } from "../components/card-review.js";
import { openCardEditPanel } from "../components/card-edit-panel.js";
import { openJsonPanel, toImportJson } from "../components/json-panel.js";
import { openGenerateCardsPanel } from "../components/generate-cards-panel.js";
import { openTranslationPanel } from "../components/translation-panel.js";
import { icon } from "../components/icon.js";

const settingsOps = {
  updateDeckMode,
  updateDeckName,
  updateDeckOrder,
  updateDeckReadingDisplay,
  deleteDeck,
};

// ── Pure renderer ─────────────────────────────────────────────────────────────

function renderDeckHeader(deck) {
  return `
    <div class="pane-header flex items-center">
      <button class="icon-button" data-action="menu" aria-label="Menu">${icon("Menu")}</button>
      <button class="pane-header-title flex-1 text-center text-header fg-body tappable" data-action="deck-title">${deck.name}</button>
      ${
        deck.system
          ? `<span class="pane-header-spacer shrink-0"></span>`
          : `<button class="icon-button" data-action="add-card" aria-label="Translate">${icon("Add")}</button>
          <button class="icon-button deck-header-done" data-action="done" aria-label="Done">${icon("Done")}</button>`
      }
    </div>
  `;
}

function renderDeckCards(deck, cards) {
  const cardListHTML =
    cards.length === 0
      ? `<div class="deck-view-empty text-center fg-secondary"><p>No cards in this deck.</p></div>`
      : cards.map((card) => renderCardRow(card, deck.readingDisplay)).join("");

  return `
    <div class="deck-view-list flex-1 flex-col min-h-0 overflow-y-auto">
      ${cardListHTML}
    </div>
    ${
      deck.system
        ? ""
        : `
      <div class="deck-view-add-cards-bar shrink-0 flex items-center px-5 py-4">
        <button class="deck-view-add-cards-btn flex-1 text-body1 fg-tertiary surface-field" data-action="edit-add-cards" aria-label="Add cards">
          Add cards
        </button>
      </div>
    `
    }
  `;
}

// ── Builder ───────────────────────────────────────────────────────────────────
// Called once. Wires all event listeners on the stable pane element.
// Exposes app.contentPane.loadDeck(deckId) for external callers.

const CARD_WRAPPER_SEL = ".card-row-wrapper";

export function initContentPane(app) {
  const { appEl, contentPaneEl } = app.els;
  const meatEl = contentPaneEl.querySelector(".meat");

  // Gesture wiring — once, on the stable pane element
  const gestures = wireContentPaneGestures(app);
  gestures.shell.setSuppressed(
    () => gestures.reveal.isAnyOpen() || "editMode" in contentPaneEl.dataset,
  );
  app.navPane = gestures.shell;

  // Per-render mutable state
  let cards = [];
  let deck = null;
  let isStarredView = false;

  // ── Title menu ──────────────────────────────────────────────────────────────

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
      <button class="deck-title-menu-item fg-body text-menu-item text-left tappable" data-menu="settings">Settings</button>
      <button class="deck-title-menu-item fg-body text-menu-item text-left tappable" data-menu="edit">Edit cards</button>
    `;
    document.body.appendChild(menu);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        menu.classList.add("deck-title-menu--visible"),
      ),
    );
    menu
      .querySelector("[data-menu='settings']")
      .addEventListener("click", () => {
        closeTitleMenu();
        openDeckSettings(
          appEl,
          deck,
          {
            ...settingsOps,
            exportJson: () =>
              openJsonPanel(appEl, deck.name, toImportJson(cards)),
          },
          async (changes) => {
            if (changes.deleted) {
              await app.panes.nav.refresh();
              app.contentPane.loadDeck(null);
            } else {
              await app.panes.nav.refresh();
              app.contentPane.loadDeck(deck.id);
            }
          },
        );
      });
    menu.querySelector("[data-menu='edit']").addEventListener("click", () => {
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

  // ── Delegated click handler on the stable content pane ─────────────────────

  contentPaneEl.addEventListener("click", async (e) => {
    // Title menu items (rendered into document.body, not paneEl — handled above via direct listeners)

    const action = e.target.closest("[data-action]")?.dataset.action;

    if (action === "menu") {
      app.navPane.open();
      return;
    }

    if (action === "deck-title") {
      if (deck?.system) {
        app.navPane.open();
      } else {
        e.stopPropagation();
        if (document.getElementById("deck-title-menu")) {
          closeTitleMenu();
        } else {
          showTitleMenu(e.target.closest("[data-action='deck-title']"));
        }
      }
      return;
    }

    if (action === "add-card") {
      openTranslationPanel(appEl, deck, { importCards }, (addedCard) => {
        cards.push(addedCard);
        const list = meatEl.querySelector(".deck-view-list");
        if (list) {
          list.querySelector(".deck-view-empty")?.remove();
          const tmp = document.createElement("div");
          tmp.innerHTML = renderCardRow(addedCard, deck.readingDisplay);
          list.appendChild(tmp.firstElementChild);
        }
      });
      return;
    }

    if (action === "done") {
      delete contentPaneEl.dataset.editMode;
      return;
    }

    if (action === "edit-add-cards") {
      const prevIds = new Set(cards.map((c) => c.id));
      openGenerateCardsPanel(
        appEl,
        { createDeck, importCards },
        async () => {
          const freshCards = await getCards(deck.id);
          const addedCards = freshCards.filter((c) => !prevIds.has(c.id));
          for (const c of addedCards) cards.push(c);
          const list = meatEl.querySelector(".deck-view-list");
          if (list) {
            list.querySelector(".deck-view-empty")?.remove();
            for (const card of addedCards) {
              const tmp = document.createElement("div");
              tmp.innerHTML = renderCardRow(card, deck.readingDisplay);
              list.appendChild(tmp.firstElementChild);
            }
          }
        },
        deck,
      );
      return;
    }

    // Card list interactions — blocked in edit mode (only reorder handle active)
    if ("editMode" in contentPaneEl.dataset) return;

    const starBtn = e.target.closest(
      "[aria-label='Star'], [aria-label='Unstar']",
    );
    if (starBtn && starBtn.closest(CARD_WRAPPER_SEL)) {
      gestures.reveal.reset();
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

    const editBtn = e.target.closest("[aria-label='Edit']");
    if (editBtn && editBtn.closest(CARD_WRAPPER_SEL)) {
      gestures.reveal.reset();
      const card = cards.find((c) => String(c.id) === editBtn.dataset.cardId);
      if (card)
        openCardEditPanel(
          appEl,
          card,
          { updateCard, deleteCard },
          onSaveCard,
          onDeleteCard,
        );
      return;
    }

    const deleteBtn = e.target.closest("[aria-label='Delete']");
    if (deleteBtn && deleteBtn.closest(CARD_WRAPPER_SEL)) {
      gestures.reveal.reset();
      onDeleteCard(deleteBtn.dataset.cardId);
      return;
    }

    const wrapper = e.target.closest(CARD_WRAPPER_SEL);
    if (wrapper?.classList.contains("card-row-wrapper--swiped")) {
      gestures.reveal.reset();
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
    openCardReview(appEl, cards, deck, idx < 0 ? 0 : idx);
  });

  // ── Card mutation helpers ───────────────────────────────────────────────────

  function onSaveCard(updatedCard) {
    const idx = cards.findIndex((c) => String(c.id) === String(updatedCard.id));
    if (idx >= 0) cards[idx] = updatedCard;
    const wrapperEl = meatEl.querySelector(
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
    meatEl
      .querySelector(`.card-row-wrapper[data-card-id="${cardId}"]`)
      ?.remove();
    if (cards.length === 0) {
      const list = meatEl.querySelector(".deck-view-list");
      if (list)
        list.innerHTML = `<div class="deck-view-empty text-center fg-secondary"><p>No cards in this deck.</p></div>`;
    }
  }

  // ── loadDeck — re-renders content, updates gesture callbacks ───────────────

  async function loadDeck(deckId) {
    app.setLastDeckId(deckId);
    isStarredView = false;

    if (!deckId) {
      meatEl.innerHTML = `
        <div class="deck-view-empty text-center fg-secondary">
          <p>No decks yet.</p>
          <button data-action="open-generate" class="btn btn-primary">Import cards</button>
        </div>
      `;
      deck = null;
      cards = [];
      return;
    }

    if (deckId.startsWith("lang:")) {
      const lang = deckId.split(":")[1];
      cards = await getCardsByLang(lang);
      const langName = LANG_NAMES[lang] ?? lang.toUpperCase();
      deck = {
        id: deckId,
        name: `All ${langName} Cards`,
        lang,
        mode: DEFAULT_MODE,
        order: "default",
        system: true,
      };
    } else if (deckId.startsWith("starred:")) {
      isStarredView = true;
      const lang = deckId.split(":")[1];
      cards = await getStarredCards(lang);
      const langName = LANG_NAMES[lang] ?? lang.toUpperCase();
      deck = {
        id: deckId,
        name: `★ Starred ${langName}`,
        lang,
        mode: DEFAULT_MODE,
        order: "default",
        system: true,
      };
    } else {
      deck = await db.decks.get(deckId);
      if (!deck) {
        meatEl.innerHTML = `<div class="deck-view-empty text-center fg-secondary"><p>Deck not found.</p></div>`;
        cards = [];
        return;
      }
      cards = await getCards(deckId);
      cards = applyCardOrder(
        cards,
        deck.order || "default",
        deck.cardOrder || null,
      );
    }

    appEl.dataset.deckMode = deck.mode;
    meatEl.innerHTML = renderDeckHeader(deck) + renderDeckCards(deck, cards);

    gestures.setReorderCallback(
      deck.system
        ? null
        : async (fromIndex, toIndex) => {
            const moved = cards.splice(fromIndex, 1)[0];
            cards.splice(toIndex, 0, moved);
            await updateDeckCardOrder(
              deck.id,
              cards.map((c) => c.id),
            );
          },
    );
  }

  app.contentPane = { loadDeck };
}
