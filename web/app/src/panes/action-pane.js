/**
 * Action pane — Pane Protocol contract for the `action` namespace.
 *
 * Layer: action. A bottom-anchored, modal surface that slides up over a
 * scrim. Used for transient tasks: deck settings, card edit, JSON export.
 *
 * Slice shape:
 *   { kind: 'settings' | 'card-edit' | 'json' | 'review' | 'new-phrasebook' | 'creation', payload: object }
 *
 * Transitions:
 *   action/open  ({ kind, payload })  — open a kind; if one is already
 *                                       open, close it first (Rule 8).
 *   action/close                      — clear the slice.
 *
 * Sub-kinds are content providers. The action pane composes them based on
 * `slice.kind`. Each sub-kind opens via the bottom-sheet primitive and
 * returns a handle `{ close }`. The action pane wires the bottom-sheet's
 * onClose to `action/close` so the slice stays in sync no matter how the
 * pane was dismissed (back button, scrim, swipe-down).
 */
import { setAttrSafe } from "../js/uiState.js";
import { openDeckSettings } from "../components/deck-settings.js";
import { openJsonPanel, toImportJson } from "../components/json-panel.js";
import { openCardEditPanel } from "../components/card-edit-panel.js";
import { openReviewPanel } from "../components/review-panel.js";
import { openNewPhrasebookPanel } from "../components/new-phrasebook-panel.js";
import { openCreationPanel } from "../components/creation-panel.js";
import { DEFAULT_MODE } from "../js/modes.js";
import {
  updateDeckMode,
  updateDeckName,
  updateDeckOrder,
  updateDeckReadingDisplay,
  deleteDeck,
  updateCard,
  deleteCard,
} from "../js/db.js";

function openKind(kind, payload, host, hostEl, onDismiss) {
  const { ui } = host;

  if (kind === "settings") {
    const { deck, cards } = payload;
    return openDeckSettings(
      hostEl,
      deck,
      {
        updateDeckMode, updateDeckName, updateDeckOrder,
        updateDeckReadingDisplay, deleteDeck,
        exportJson: () => ui.transition("action/open", {
          kind: "json", payload: { title: deck.name, jsonString: toImportJson(cards) },
        }),
      },
      (changes) => {
        ui.transition("nav/reload");
        if (changes.deleted) {
          ui.transition("content/select-deck", { id: null });
        } else {
          // Deck id is unchanged, but a field (e.g. mode) may have changed —
          // force a re-fetch so the content pane picks up the new value.
          ui.transition("content/reload-deck");
        }
      },
      onDismiss,
    );
  }

  if (kind === "review") {
    const { deck, cards } = payload;
    return openReviewPanel(hostEl, deck, cards, onDismiss);
  }


  if (kind === "creation") {
    const { lang, ability } = payload;
    return openCreationPanel(
      hostEl,
      { lang, ability },
      (deck) => {
        ui.transition("shell/close");
        ui.transition("nav/reload");
        ui.transition("content/select-deck", { id: deck.id });
      },
      onDismiss,
    );
  }

  if (kind === "new-phrasebook") {
    const { suggestion } = payload;
    let sheetHandle;
    sheetHandle = openNewPhrasebookPanel(
      hostEl,
      (lang, ability) => {
        // Hand off to guided creation without persisting an empty deck.
        // creation-panel.js commits the deck and generated cards together
        // after the /context and /phrasebook requests succeed.
        ui.transition("action/open", {
          kind: "creation",
          payload: { lang, ability },
        });
      },
      onDismiss,
      suggestion,
      suggestion
        ? ({ lang, ability }) => {
            // Confirm mode builds an unsaved preview. It is persisted only
            // when the user taps Save in the content pane.
            const previewDeck = {
              id: `preview:${suggestion.id}`,
              name: suggestion.title,
              lang,
              ability,
              mode: DEFAULT_MODE,
              order: "default",
              readingDisplay: "reading",
              system: false,
              preview: true,
              seedId: suggestion.id,
            };
            const previewCards = suggestion.terms.map((term, i) => ({
              id: `preview-${i}`,
              createdAt: new Date(0).toISOString(),
              deckIds: [],
              ...term,
            }));
            ui.transition("shell/close");
            ui.transition("content/loaded", { deck: previewDeck, cards: previewCards });
            sheetHandle.close();
          }
        : undefined,
    );
    return sheetHandle;
  }

  if (kind === "card-edit") {
    const { card } = payload;
    return openCardEditPanel(
      hostEl,
      card,
      { updateCard, deleteCard },
      (updatedCard) => {
        const content = ui.get("content");
        if (!content) return;
        const idx = content.cards.findIndex((c) => String(c.id) === String(updatedCard.id));
        if (idx < 0) return;
        const next = content.cards.slice();
        next[idx] = updatedCard;
        ui.transition("content/cards-changed", { cards: next });
      },
      (cardId) => {
        const content = ui.get("content");
        if (!content) return;
        ui.transition("content/cards-changed", {
          cards: content.cards.filter((c) => String(c.id) !== String(cardId)),
        });
      },
      onDismiss,
    );
  }

  if (kind === "json") {
    const { title, jsonString } = payload;
    return openJsonPanel(hostEl, title, jsonString, onDismiss);
  }

  console.warn(`action-pane: unknown kind ${kind}`);
  return null;
}

export default {
  namespace: "action",

  initialState: null,

  transitions: {
    "action/open": (_slice, payload) => ({
      kind: payload?.kind,
      payload: payload?.payload ?? {},
    }),
    "action/close": () => undefined,
  },

  render() {
    // Stable host element for sub-kinds to mount into. Sub-kinds expect a
    // parent for appendChild; this gives them one that lives for the life
    // of the app and is identifiable in the DOM. The data-action-state
    // attribute on the stage drives any CSS that needs to know whether an
    // action pane is open.
    return `<div id="action-layer"></div>`;
  },

  bindEvents(rootEl, host) {
    const { ui, stageEl } = host;

    // Mirror the slice presence onto the stage so CSS can react.
    const unsubAttr = ui.subscribe("action", (next) => {
      setAttrSafe(stageEl, "actionState", next ? "open" : "closed");
    });

    let currentHandle = null;
    let currentKey = null;

    function makeKey(slice) {
      return slice ? `${slice.kind}:${JSON.stringify(slice.payload || {})}` : null;
    }

    const unsub = ui.subscribe("action", (next) => {
      const nextKey = makeKey(next);
      if (nextKey === currentKey && currentHandle) return; // idempotent

      // Rule 8: close whatever's open before opening anything new.
      if (currentHandle) {
        const closing = currentHandle;
        currentHandle = null;
        closing.close();
      }

      if (!next) {
        currentKey = null;
        return;
      }

      const onDismiss = () => {
        // The bottom-sheet finished its close animation. Sync the slice
        // if it still thinks this kind is open. Guard with reference
        // check so a transition that ALREADY closed the slice doesn't
        // re-fire action/close.
        if (ui.get("action") && currentHandle === handle) {
          currentHandle = null;
          currentKey = null;
          ui.transition("action/close");
        }
      };

      const handle = openKind(next.kind, next.payload || {}, host, rootEl, onDismiss);
      currentHandle = handle;
      currentKey = nextKey;
    });

    return () => {
      unsub();
      unsubAttr();
      if (currentHandle) currentHandle.close();
    };
  },
};
