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
 *     deck:      object | null,       // hydrated deck (from db or synthesized)
 *     cards:     Card[],
 *     editMode:  boolean,             // edit-cards mode toggle
 *     menuOpen:  boolean,             // deck-title menu toggle
 *     tab:       'phrasebook' | 'starred', // phrasebook-view filter tab
 *     reload:    number,              // bump to force a re-fetch of the current deck
 *     browse:    { title, groupsHtml } | null, // browse-view content, replaces the deck body while set
 *   }
 *
 * Transitions:
 *   content/select-deck { id }     — request a load; subscriber fetches and fires content/loaded; exits browse
 *   content/reload-deck            — re-fetch the current deck (deckId unchanged); picks up in-place field changes (e.g. mode)
 *   content/loaded { deck, cards } — replace deck + cards
 *   content/cards-changed { cards } — replace cards (after add/edit/delete)
 *   content/toggle-edit            — flip editMode
 *   content/exit-edit              — exit edit mode
 *   content/toggle-menu            — toggle the deck-title menu
 *   content/close-menu             — close the deck-title menu
 *   content/browse { title, groupsHtml } — enter a browse view (nav's "View all")
 *   content/browse-back            — exit the browse view, returning to the current deck
 */
import { createDeck, importCards, updateDeckAccessTime, updateDeckCardOrder } from "../js/db.js";
import { setAttrSafe, setListHTMLSafe } from "../js/uiState.js";
import { renderDeckBody, renderCardsHTML, renderBrowseBody, renderTabsBar } from "./content-pane-render.js";
import { wireContentGestures } from "./content-pane-gestures.js";
import { registerCardActions } from "./content-pane-actions.js";
import { getLookupHistory } from "../js/preferences.js";
import { loadDeckData } from "./content-pane-load.js";
import { SUGGESTED_PHRASEBOOKS } from "../js/suggested-phrasebooks.js";

// Group collapse/expand is DOM-only transient state (see content/toggle-group).
// A list re-render rebuilds every group collapsed; these helpers carry the
// user's expanded groups across a re-render, keyed by the group's section title.
function snapshotExpandedGroups(region) {
  const expanded = new Set();
  region.querySelectorAll('.card-group[data-collapsed="false"]').forEach((g) => {
    if (g.dataset.groupKey) expanded.add(g.dataset.groupKey);
  });
  return expanded;
}

function restoreExpandedGroups(region, expanded) {
  if (!expanded.size) return;
  region.querySelectorAll(".card-group").forEach((g) => {
    if (expanded.has(g.dataset.groupKey)) g.dataset.collapsed = "false";
  });
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
    tab: "phrasebook",
    reload: 0,
    browse: null,
  },

  transitions: {
    "content/select-deck": (slice, { id }) => ({
      ...slice,
      deckId: id,
      browse: null,
      // Blank the stale deck immediately when switching decks while the
      // browse view is visible on-screen (Rule 7 isn't in play here — this
      // is a state transition, not a gesture — but showing the *previous*
      // deck's content while the new one loads would be actively wrong).
      // Re-selecting the deck already loaded needn't blank anything.
      // Switching decks resets the filter tab back to the full phrasebook.
      ...(id !== slice.deckId ? { deck: null, cards: [], tab: "phrasebook" } : {}),
    }),
    // Force a reload of the currently-selected deck even when deckId is
    // unchanged — used after an in-place mutation of deck fields (e.g. mode)
    // so the deck object is re-fetched from the DB. `reload` is bumped to a
    // fresh value so the load subscriber's dedup guard doesn't bail.
    "content/reload-deck": (slice) => ({ ...slice, reload: (slice.reload || 0) + 1 }),
    "content/loaded": (slice, { deck, cards }) => ({
      ...slice,
      deck,
      cards,
      editMode: false,
      editOrder: null,
      menuOpen: false,
      browse: null,
      tab: "phrasebook",
    }),
    "content/cards-changed": (slice, { cards }) => ({ ...slice, cards }),
    "content/set-tab": (slice, { tab }) =>
      tab === slice.tab ? slice : { ...slice, tab },

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
    "content/browse": (slice, payload) => ({ ...slice, browse: payload }),
    "content/browse-back": (slice) => ({ ...slice, browse: null }),
  },

  render(initial) {
    return `
      <div id="content-pane" class="content-pane absolute-inset flex-col bg-surface transition-transform"${initial.deck ? "" : " data-empty"}>
        <div class="meat screen flex-1 flex-col bg-surface overflow-hidden" data-region="content-body">
          ${renderDeckBody(initial.deck, initial.cards, initial.tab)}
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

    let lastDeckRendered = null;
    const unsubContent = ui.subscribe("content", (next, prev) => {
      if (next.browse !== prev?.browse) {
        // Entering/exiting a browse view swaps the whole body; the deck
        // diffing below is skipped for this event either way.
        meatEl.innerHTML = next.browse ? renderBrowseBody(next.browse) : renderDeckBody(next.deck, next.cards, next.tab);
        lastDeckRendered = next.browse ? null : next.deck;
      } else if (!next.browse) {
        const cardsChanged = next.cards !== prev?.cards;
        const tabChanged = next.tab !== prev?.tab;
        const listOrderChanged = cardsChanged || next.editOrder !== prev?.editOrder;
        if (next.deck !== prev?.deck || listOrderChanged || tabChanged) {
          const listRegion = meatEl.querySelector('[data-region="card-list"]');
          if (listRegion && next.deck === lastDeckRendered) {
            // In edit mode the visible order is editOrder, not the underlying
            // cards order — that snapshot only commits on confirm.
            const visible =
              next.editMode && next.editOrder
                ? next.editOrder.map((id) => next.cards.find((c) => c.id === id)).filter(Boolean)
                : next.cards;
            // A list re-render (e.g. star toggle, card edit) rebuilds group
            // markup with the default-collapsed state; snapshot which groups
            // the user had expanded and restore them so an unrelated card
            // mutation doesn't collapse an open group.
            const expanded = snapshotExpandedGroups(listRegion);
            if (setListHTMLSafe(listRegion, renderCardsHTML(next.deck, visible, next.tab))) {
              restoreExpandedGroups(listRegion, expanded);
            }
            // Refresh the tabs bar so the starred count and active-tab
            // highlight track card/tab changes (skip on pure reorder ticks).
            if (cardsChanged || tabChanged) {
              const tabsRegion = meatEl.querySelector('[data-region="deck-tabs"]');
              if (tabsRegion) tabsRegion.outerHTML = renderTabsBar(next.deck, next.cards, next.tab);
            }
          } else {
            meatEl.innerHTML = renderDeckBody(next.deck, next.cards, next.tab);
            lastDeckRendered = next.deck;
          }
        }
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

    // ── Gestures (shell swipe + card-row reveal + edit-mode reorder) ───────
    function isEdit() { return ui.get("content").editMode; }
    const { resetReveal } = wireContentGestures({
      rootEl, handleEl, reorderHandleEl, ui, isEdit,
    });

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
      const { deck, cards, tab } = ui.get("content");
      // Review the terms currently in view: the Starred tab reviews only
      // starred cards, the Phrasebook tab the whole deck. Skip opening an
      // empty starred review (nothing to flip through).
      if (tab === "starred") {
        const starred = cards.filter((c) => c.state?.starredAt);
        if (!starred.length) return;
        ui.transition("action/open", { kind: "review", payload: { deck, cards: starred } });
        return;
      }
      ui.transition("action/open", { kind: "review", payload: { deck, cards } });
    });

    delegate.register("content/add", () => {
      const { deck, cards } = ui.get("content");
      // A phrasebook can have prior look-ups without saved cards. History is
      // therefore the durable first-use signal for VIBE's initial state; cards
      // retain compatibility with phrasebooks created before lookup history.
      const hasTranslatedBefore = cards.length > 0 || getLookupHistory(deck.id).length > 0;
      ui.transition("action/open", {
        kind: "lookup",
        payload: { deck, hasTranslatedBefore },
      });
    });

    delegate.register("content/save-preview", async () => {
      const { deck: preview, cards: previewCards } = ui.get("content");
      if (!preview?.preview) return;
      // Commit the suggested phrasebook for real: create the deck, import
      // its seed terms fresh (stripping the temp preview-only ids/createdAt
      // so importCards assigns real ones — see suggested-phrasebooks.js),
      // and access-stamp it so it lands at the top of RECENT (docs/journeys.md
      // Journey 2 step 4: "moves out of Suggested and into Recent").
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

    // Group collapse/expand (Figma "Group", node 754:6178) is transient UI
    // state, not app data — toggled directly on the DOM via a data attribute,
    // no ui.transition, so it never triggers a content-slice re-render (which
    // would blow away in-progress swipe-reveal state elsewhere in the list)
    // and needs no persistence. Mirrors the existing
    // `.lookup-vibe-group[data-expanded]` toggle pattern in lookup-panel.js.
    delegate.register("content/toggle-group", (_e, el) => {
      const group = el.closest(".card-group");
      if (!group) return;
      group.dataset.collapsed = group.dataset.collapsed === "true" ? "false" : "true";
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

    delegate.register("content/set-tab", (_e, el) => {
      const tab = el.dataset.tab;
      if (tab) ui.transition("content/set-tab", { tab });
    });

    const unregisterCardActions = registerCardActions({ host, isEdit, resetReveal });

    return () => {
      unsubContent();
      unsubPersist();
      unsubLoad();
      unregisterCardActions();
      delegate.unregister("content/toggle-group");
      delegate.unregister("content/browse-back");
      delegate.unregister("content/browse-select");
      delegate.unregister("content/browse-view-suggested");
      delegate.unregister("content/set-tab");
    };
  },
};
