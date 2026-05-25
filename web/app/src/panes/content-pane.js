/**
 * Content pane — Pane Protocol contract for the `content` namespace.
 *
 * Layer: content. Renders the currently selected deck (or empty state).
 *
 * Slice shape:
 *   {
 *     deckId:    string | null,
 *     deck:      object | null,       // hydrated deck (from db or synthesized)
 *     cards:     Card[],
 *     editMode:  boolean,             // edit-cards mode toggle
 *     menuOpen:  boolean,             // deck-title menu toggle
 *     isStarred: boolean,             // viewing a starred deck
 *   }
 *
 * Transitions:
 *   content/select-deck { id }     — request a load; subscriber fetches and fires content/loaded
 *   content/loaded { deck, cards, isStarred } — replace deck + cards
 *   content/cards-changed { cards } — replace cards (after add/edit/delete)
 *   content/toggle-edit            — flip editMode
 *   content/exit-edit              — exit edit mode
 *   content/toggle-menu            — toggle the deck-title menu
 *   content/close-menu             — close the deck-title menu
 */
import { updateCard, deleteCard, updateDeckCardOrder } from "../js/db.js";
import { setAttrSafe, setListHTMLSafe } from "../js/uiState.js";
import { openCardEditPanel } from "../components/card-edit-panel.js";
import { renderDeckBody, renderCardsHTML } from "./content-pane-render.js";
import { wireContentGestures } from "./content-pane-gestures.js";
import { registerCardActions } from "./content-pane-actions.js";
import { loadDeckData } from "./content-pane-load.js";

export default {
  namespace: "content",

  initialState: {
    deckId: null,
    deck: null,
    cards: [],
    editMode: false,
    editOrder: null,
    menuOpen: false,
    isStarred: false,
  },

  transitions: {
    "content/select-deck": (slice, { id }) => ({ ...slice, deckId: id }),
    "content/loaded": (slice, { deck, cards, isStarred }) => ({
      ...slice,
      deck,
      cards,
      isStarred: !!isStarred,
      editMode: false,
      editOrder: null,
      menuOpen: false,
    }),
    "content/cards-changed": (slice, { cards }) => ({ ...slice, cards }),

    // Enter edit mode — snapshot current order so we can mutate freely.
    "content/enter-edit": (slice) => ({
      ...slice,
      editMode: true,
      menuOpen: false,
      editOrder: slice.cards.map((c) => c.id),
    }),

    // Reorder during edit. Payload: { fromId, toIndex }. Returns same
    // reference if nothing changed (Rule 2: no notification).
    "content/reorder": (slice, { fromId, toIndex }) => {
      if (!slice.editMode || !slice.editOrder) return slice;
      const from = slice.editOrder.indexOf(fromId);
      if (from < 0) return slice;
      const clamped = Math.max(0, Math.min(slice.editOrder.length - 1, toIndex));
      if (from === clamped) return slice;
      const next = slice.editOrder.slice();
      const [moved] = next.splice(from, 1);
      next.splice(clamped, 0, moved);
      return { ...slice, editOrder: next };
    },

    // Commit edit: reorder cards to match editOrder, exit edit mode.
    "content/confirm-edit": (slice) => {
      if (!slice.editMode || !slice.editOrder) return slice;
      const byId = new Map(slice.cards.map((c) => [c.id, c]));
      const reordered = slice.editOrder.map((id) => byId.get(id)).filter(Boolean);
      return {
        ...slice,
        cards: reordered,
        editMode: false,
        editOrder: null,
        menuOpen: false,
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
  },

  render(initial) {
    return `
      <div id="content-pane" class="content-pane absolute-inset flex-col bg-primary transition-transform">
        <div class="handle"></div>
        <div id="content-pane-scrim" class="content-pane-scrim absolute-inset transition-opacity" data-action="shell/close"></div>
        <div class="meat screen flex-1 flex-col bg-primary overflow-hidden" data-region="content-body">
          ${renderDeckBody(initial.deck, initial.cards)}
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
    const handleEl = rootEl.querySelector(".handle");
    const reorderHandleEl = rootEl.querySelector("#reorder-handle");

    // ── Subscribers ─────────────────────────────────────────────────────────

    let lastDeckRendered = null;
    const unsubContent = ui.subscribe("content", (next, prev) => {
      const listOrderChanged =
        next.cards !== prev?.cards || next.editOrder !== prev?.editOrder;
      if (next.deck !== prev?.deck || listOrderChanged) {
        const listRegion = meatEl.querySelector('[data-region="card-list"]');
        if (listRegion && next.deck === lastDeckRendered) {
          // In edit mode the visible order is editOrder, not the underlying
          // cards order — that snapshot only commits on confirm.
          const visible =
            next.editMode && next.editOrder
              ? next.editOrder.map((id) => next.cards.find((c) => c.id === id)).filter(Boolean)
              : next.cards;
          setListHTMLSafe(listRegion, renderCardsHTML(next.deck, visible));
        } else {
          meatEl.innerHTML = renderDeckBody(next.deck, next.cards);
          lastDeckRendered = next.deck;
        }
      }
      setAttrSafe(rootEl, "editMode", next.editMode ? "" : null);
      setAttrSafe(rootEl, "menuOpen", next.menuOpen ? "" : null);
      if (next.deck?.mode) stageEl.dataset.deckMode = next.deck.mode;
    });

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
      if (next.deckId === prev?.deckId) return;
      const stamp = ++inflight;
      const data = await loadDeckData(next.deckId);
      if (stamp !== inflight) return;
      ui.transition("content/loaded", data);
    });

    // ── Gestures (shell swipe + card-row reveal + edit-mode reorder) ───────
    function isEdit() { return ui.get("content").editMode; }
    const { resetReveal } = wireContentGestures({
      rootEl, handleEl, reorderHandleEl, ui, isEdit,
    });

    // ── Click actions ───────────────────────────────────────────────────────

    delegate.register("shell/close", () => ui.transition("shell/close"));
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

    delegate.register("content/add-card", () => {
      const { deck } = ui.get("content");
      ui.transition("action/open", { kind: "translation", payload: { deck } });
    });

    delegate.register("content/done", () => ui.transition("content/confirm-edit"));

    delegate.register("content/import-cards", () => {
      ui.transition("action/open", { kind: "generate", payload: {} });
    });

    delegate.register("content/edit-add-cards", () => {
      const { deck } = ui.get("content");
      ui.transition("action/open", { kind: "generate", payload: { targetDeck: deck } });
    });

    const unregisterCardActions = registerCardActions({
      host,
      stageEl,
      isEdit,
      resetReveal,
      deps: { updateCard, deleteCard, openCardEditPanel },
    });

    return () => {
      unsubContent();
      unsubPersist();
      unsubLoad();
      unregisterCardActions();
    };
  },
};
