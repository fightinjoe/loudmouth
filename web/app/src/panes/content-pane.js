/**
 * Content pane — Pane Protocol contract for the `content` namespace.
 *
 * Layer: content. Renders the currently selected deck, a browse view
 * (all phrasebooks / suggested phrasebooks, entered from the nav pane's
 * "View all" links), or the empty state.
 *
 * Slice shape:
 *   {
 *     deckId:    string | null,
 *     deck:      object | null,
 *     cards:     Card[],
 *     editMode:  boolean,
 *     editOrder: string[] | null,
 *     menuOpen:  boolean,
 *     pageKey:   string | null,        // current conversation/Vocab page
 *     starPatch: { cardId, starredAt } | null,
 *     reload:    number,
 *     browse:    { title, groupsHtml } | null,
 *   }
 *
 * Page selection is state, while motion and per-page scroll offsets remain
 * properties of the stable pager DOM. Star updates carry a narrow patch so
 * they never rebuild that DOM or disturb page position/focus.
 */
import { createDeck, importCards, updateDeckAccessTime, updateDeckCardOrder } from "../js/db.js";
import { setAttrSafe, setListHTMLSafe } from "../js/uiState.js";
import {
  getDeckPages,
  normalizePageKey,
  renderBrowseBody,
  renderBrowseCardsHTML,
  renderDeckBody,
  renderDeckPager,
} from "./content-pane-render.js";
import { wireContentGestures } from "./content-pane-gestures.js";
import { registerCardActions } from "./content-pane-actions.js";
import { icon } from "../components/icon.js";

import { loadDeckData } from "./content-pane-load.js";
import { SUGGESTED_PHRASEBOOKS } from "../js/suggested-phrasebooks.js";

function reconcilePageKey(previousCards, nextCards, currentKey) {
  const nextPages = getDeckPages(nextCards);
  if (nextPages.some((page) => page.key === currentKey)) return currentKey;
  const previousPages = getDeckPages(previousCards);
  const previousIndex = Math.max(0, previousPages.findIndex((page) => page.key === currentKey));
  return nextPages[Math.min(previousIndex, nextPages.length - 1)].key;
}

export default {
  namespace: "content",

  initialState: {
    deckId: null,
    deck: null,
    cards: [],
    editMode: false,
    editOrder: null,
    menuOpen: false,
    pageKey: null,
    starPatch: null,
    reload: 0,
    browse: null,
  },

  transitions: {
    "content/select-deck": (slice, { id }) => ({
      ...slice,
      deckId: id,
      browse: null,
      ...(id !== slice.deckId
        ? { deck: null, cards: [], pageKey: null, starPatch: null }
        : {}),
    }),
    "content/reload-deck": (slice) => ({
      ...slice,
      reload: (slice.reload || 0) + 1,
    }),
    "content/loaded": (slice, { deck, cards }) => ({
      ...slice,
      deck,
      cards,
      editMode: false,
      editOrder: null,
      menuOpen: false,
      browse: null,
      pageKey: deck && !deck.system && !deck.preview
        ? normalizePageKey(cards, slice.deckId === deck.id ? slice.pageKey : null)
        : null,
      starPatch: null,
    }),
    "content/cards-changed": (slice, { cards }) => ({
      ...slice,
      cards,
      pageKey: slice.deck && !slice.deck.system && !slice.deck.preview
        ? reconcilePageKey(slice.cards, cards, slice.pageKey)
        : null,
      starPatch: null,
    }),
    "content/card-star-changed": (slice, { cardId, starredAt }) => {
      const index = slice.cards.findIndex((card) => String(card.id) === String(cardId));
      if (index < 0) return slice;
      const cards = slice.cards.slice();
      cards[index] = {
        ...cards[index],
        state: { ...(cards[index].state || {}), starredAt },
      };
      return {
        ...slice,
        cards,
        starPatch: { cardId: String(cardId), starredAt },
      };
    },
    "content/set-page": (slice, { pageKey }) => {
      if (!slice.deck || slice.deck.system || slice.deck.preview) return slice;
      const nextPageKey = normalizePageKey(slice.cards, pageKey);
      return nextPageKey === slice.pageKey ? slice : { ...slice, pageKey: nextPageKey };
    },

    "content/enter-edit": (slice) => ({
      ...slice,
      editMode: true,
      menuOpen: false,
      editOrder: slice.cards.map((card) => card.id),
    }),

    // Reorder only the cards in the active page. Replacing their existing
    // global slots keeps every other conversation and Vocab in place.
    "content/reorder": (slice, { pageOrder }) => {
      if (!slice.editMode || !slice.editOrder || !Array.isArray(pageOrder)) return slice;
      const pageIds = pageOrder.filter((id, index) =>
        slice.editOrder.includes(id) && pageOrder.indexOf(id) === index);
      if (pageIds.length < 2) return slice;
      const pageSet = new Set(pageIds);
      const current = slice.editOrder.filter((id) => pageSet.has(id));
      if (current.length !== pageIds.length
        || current.every((id, index) => id === pageIds[index])) return slice;
      let replacementIndex = 0;
      const editOrder = slice.editOrder.map((id) =>
        pageSet.has(id) ? pageIds[replacementIndex++] : id);
      return { ...slice, editOrder };
    },

    "content/confirm-edit": (slice) => {
      if (!slice.editMode || !slice.editOrder) return slice;
      const byId = new Map(slice.cards.map((card) => [card.id, card]));
      const cards = slice.editOrder.map((id) => byId.get(id)).filter(Boolean);
      return {
        ...slice,
        cards,
        editMode: false,
        editOrder: null,
        menuOpen: false,
        starPatch: null,
      };
    },

    "content/cancel-edit": (slice) => ({
      ...slice,
      editMode: false,
      editOrder: null,
      menuOpen: false,
    }),

    "content/toggle-menu": (slice) => ({ ...slice, menuOpen: !slice.menuOpen }),
    "content/close-menu": (slice) => ({ ...slice, menuOpen: false }),
    "content/browse": (slice, payload) => ({ ...slice, browse: payload }),
    "content/browse-back": (slice) => ({ ...slice, browse: null }),
  },

  render(initial) {
    return `
      <div id="content-pane" class="content-pane absolute-inset flex-col bg-surface transition-transform"${initial.deck ? "" : " data-empty"}>
        <div class="meat screen flex-1 flex-col bg-surface overflow-hidden" data-region="content-body">
          ${renderDeckBody(initial.deck, initial.cards, initial.pageKey)}
        </div>
        <!-- Static reorder handle. Always in the DOM; CSS only enables
             pointer-events when [data-edit-mode] is set on the pane.
             Overlays the list region so a single gesture handler can
             elementFromPoint to find the row underneath. -->
        <div id="reorder-handle" class="reorder-handle" aria-hidden="true"></div>
        <div id="deck-title-menu-scrim" data-action="content/close-menu"></div>
        <div id="deck-title-menu" class="deck-title-menu bg-surface overflow-hidden">
          <button class="deck-title-menu-item fg-body text-menu-item text-left tappable" data-action="content/menu-settings">Settings</button>
          <button class="deck-title-menu-item fg-body text-menu-item text-left tappable" data-action="content/menu-edit">Edit cards</button>
        </div>
      </div>
    `;
  },

  bindEvents(rootEl, host) {
    const { ui, delegate, stageEl } = host;
    const meatEl = rootEl.querySelector('[data-region="content-body"]');
    const handleEl = stageEl.querySelector(".shell-swipe-handle");
    const reorderHandleEl = rootEl.querySelector("#reorder-handle");

    // ── Subscribers ─────────────────────────────────────────────────────────

    let syncPager = () => {};

    function visibleCards(slice) {
      if (!slice.editMode || !slice.editOrder) return slice.cards;
      const byId = new Map(slice.cards.map((card) => [card.id, card]));
      return slice.editOrder.map((id) => byId.get(id)).filter(Boolean);
    }

    function capturePageScrolls() {
      return new Map(
        [...meatEl.querySelectorAll(".deck-page")].map((page) => [
          page.dataset.pageKey,
          page.scrollTop,
        ]),
      );
    }

    function restorePageScrolls(scrolls) {
      meatEl.querySelectorAll(".deck-page").forEach((page) => {
        page.scrollTop = scrolls.get(page.dataset.pageKey) || 0;
      });
    }

    function patchStar({ cardId, starredAt }, cards) {
      const card = cards.find((candidate) => String(candidate.id) === cardId);
      if (!card) return;
      const starred = !!starredAt;
      meatEl.querySelectorAll(".card-star[data-card-id]").forEach((button) => {
        if (button.dataset.cardId !== cardId) return;
        button.dataset.selected = String(starred);
        button.setAttribute("aria-pressed", String(starred));
        button.setAttribute(
          "aria-label",
          `${starred ? "Unstar" : "Star"}: ${card.translation}`,
        );
        button.innerHTML = icon(starred ? "star-fill" : "star");
      });
    }

    const unsubContent = ui.subscribe("content", (next, prev) => {
      const deckChanged = next.deck !== prev?.deck;
      const browseChanged = next.browse !== prev?.browse;
      const cardsChanged = next.cards !== prev?.cards;
      const pageChanged = next.pageKey !== prev?.pageKey;
      const reorderedWhileEditing =
        next.editMode && prev?.editMode && next.editOrder !== prev.editOrder;
      const leavingEditOrder =
        prev?.editMode && !next.editMode && prev.editOrder !== null;

      if (browseChanged || deckChanged) {
        const scrolls = capturePageScrolls();
        meatEl.innerHTML = next.browse
          ? renderBrowseBody(next.browse)
          : renderDeckBody(next.deck, next.cards, next.pageKey);
        restorePageScrolls(scrolls);
        syncPager(next.pageKey, { animate: false });
      } else if (!next.browse && cardsChanged
        && next.starPatch && next.starPatch !== prev?.starPatch) {
        // Star state never determines grouping or page membership.
        patchStar(next.starPatch, next.cards);
      } else if (!next.browse
        && (cardsChanged || reorderedWhileEditing || leavingEditOrder)) {
        const orderedCards = visibleCards(next);
        if (next.deck?.system || next.deck?.preview) {
          const list = meatEl.querySelector('.deck-view-list[data-region="card-list"]');
          if (list) setListHTMLSafe(list, renderBrowseCardsHTML(next.deck, orderedCards));
        } else {
          const scrolls = capturePageScrolls();
          const pager = meatEl.querySelector('[data-region="deck-pager"]');
          if (pager) pager.outerHTML = renderDeckPager(next.deck, orderedCards, next.pageKey);
          else meatEl.innerHTML = renderDeckBody(next.deck, orderedCards, next.pageKey);
          restorePageScrolls(scrolls);
          syncPager(next.pageKey, { animate: false });
        }
      } else if (!next.browse && pageChanged) {
        // Selecting a tab moves the existing strip and pages; their contents
        // and independent vertical offsets remain untouched.
        syncPager(next.pageKey);
      }

      setAttrSafe(rootEl, "editMode", next.editMode ? "" : null);
      setAttrSafe(rootEl, "menuOpen", next.menuOpen ? "" : null);
      setAttrSafe(rootEl, "empty", (next.browse || next.deck) ? null : "");
      if (next.menuOpen && !prev?.menuOpen) positionTitleMenu();
      if (next.deck?.mode) stageEl.dataset.deckMode = next.deck.mode;
    });

    // Position the title-tap menu anchored to the title button. The button
    // is in the dynamic header (re-rendered on deck swap), so we re-query
    // it at open time rather than holding a stale reference.
    const menuEl = rootEl.querySelector("#deck-title-menu");
    function positionTitleMenu() {
      const anchor = meatEl.querySelector('[data-action="content/deck-title"]');
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      menuEl.style.top = `${rect.bottom + 4}px`;
      menuEl.style.left = `${rect.left + rect.width / 2}px`;
    }

    // Persistence: when edit mode exits with a committed order, write it.
    const unsubPersist = ui.subscribe("content", (next, prev) => {
      const justConfirmed =
        prev?.editMode && !next.editMode && next.cards !== prev.cards;
      if (justConfirmed && next.deck && !next.deck.system) {
        updateDeckCardOrder(next.deck.id, next.cards.map((c) => c.id));
      }
    });

    // Effect subscriber: when deckId changes, load the deck.
    let inflight = 0;
    const unsubLoad = ui.subscribe("content", async (next, prev) => {
      if (next.deckId === prev?.deckId && next.reload === prev?.reload) return;
      const stamp = ++inflight;
      const data = await loadDeckData(next.deckId);
      if (stamp !== inflight) return;
      ui.transition("content/loaded", data);
    });

    // ── Gestures (shell edge, pager, legacy reveal, edit reorder) ─────────
    function isEdit() { return ui.get("content").editMode; }
    const gestures = wireContentGestures({
      rootEl, handleEl, reorderHandleEl, ui, isEdit,
    });
    const { resetReveal } = gestures;
    syncPager = gestures.syncPager;

    // ── Click actions ───────────────────────────────────────────────────────

    delegate.register("content/menu", () => ui.transition("shell/toggle"));

    delegate.register("content/deck-title", () => {
      const s = ui.get("content");
      if (s.deck?.system) ui.transition("shell/toggle");
      else ui.transition("content/toggle-menu");
    });

    delegate.register("content/menu-settings", () => {
      ui.transition("content/close-menu");
      const { deck, cards } = ui.get("content");
      ui.transition("action/open", { kind: "settings", payload: { deck, cards } });
    });

    delegate.register("content/menu-edit", () => {
      ui.transition("content/close-menu");
      ui.transition("content/enter-edit");
    });

    delegate.register("content/close-menu", () => ui.transition("content/close-menu"));

    delegate.register("content/done", () => ui.transition("content/confirm-edit"));

    delegate.register("content/review", () => {
      const { deck, cards } = ui.get("content");
      // Review remains the starred study set even though Starred is no longer
      // a browse page in the phrasebook pager.
      const starred = cards.filter((card) => card.state?.starredAt);
      if (!starred.length) return;
      ui.transition("action/open", { kind: "review", payload: { deck, cards: starred } });
    });


    delegate.register("content/save-preview", async () => {
      const { deck: preview, cards: previewCards } = ui.get("content");
      if (!preview?.preview) return;
      // Commit the preview with fresh IDs, then access-stamp the deck so it
      // moves to the top of Recent.
      const realDeck = await createDeck(preview.name, preview.lang, {
        ability: preview.ability,
        seedId: preview.seedId,
      });
      const cleanCards = previewCards.map(({ id: _id, createdAt: _createdAt, deckIds: _deckIds, ...rest }) => rest);
      await importCards(cleanCards, realDeck.id);
      await updateDeckAccessTime(realDeck.id);
      ui.transition("nav/reload");
      ui.transition("content/select-deck", { id: realDeck.id });
    });

    delegate.register("content/browse-back", () => ui.transition("content/browse-back"));

    delegate.register("content/browse-select", (_e, el) => {
      const id = el.dataset.deckId;
      if (id) updateDeckAccessTime(id);
      ui.transition("content/select-deck", { id });
    });

    delegate.register("content/browse-view-suggested", (_e, el) => {
      const suggestion = SUGGESTED_PHRASEBOOKS.find((s) => s.id === el.dataset.suggestionId);
      if (!suggestion) return;
      ui.transition("action/open", { kind: "new-phrasebook", payload: { suggestion } });
    });

    delegate.register("content/set-page", (_event, element) => {
      const pageKey = element.dataset.pageKey;
      if (pageKey) ui.transition("content/set-page", { pageKey });
    });

    const unregisterCardActions = registerCardActions({ host, isEdit, resetReveal });

    return () => {
      unsubContent();
      unsubPersist();
      unsubLoad();
      unregisterCardActions();
      delegate.unregister("content/browse-back");
      delegate.unregister("content/browse-select");
      delegate.unregister("content/browse-view-suggested");
      delegate.unregister("content/set-page");
    };
  },
};
