/**
 * Action pane — Pane Protocol contract for the `action` namespace.
 *
 * Layer: action. A bottom-anchored, modal surface that slides up over a
 * scrim. Used for transient tasks: translation, generate-cards, settings.
 *
 * Slice shape:
 *   null when no action pane is open, or
 *   { kind: 'translation' | 'generate' | 'settings', payload: object }
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
import { openTranslationPanel } from "../components/translation-panel.js";
import { openGenerateCardsPanel } from "../components/generate-cards-panel.js";
import { openDeckSettings } from "../components/deck-settings.js";
import { openJsonPanel, toImportJson } from "../components/json-panel.js";
import {
  createDeck,
  importCards,
  updateDeckMode,
  updateDeckName,
  updateDeckOrder,
  updateDeckReadingDisplay,
  deleteDeck,
  getCards,
} from "../js/db.js";

function openKind(kind, payload, host, stageEl, onDismiss) {
  const { ui } = host;

  if (kind === "translation") {
    const { deck } = payload;
    return openTranslationPanel(
      stageEl,
      deck,
      { importCards },
      (addedCard) => {
        const content = ui.get("content");
        if (content?.deck?.id === deck.id) {
          ui.transition("content/cards-changed", { cards: [...content.cards, addedCard] });
        }
      },
      onDismiss,
    );
  }

  if (kind === "generate") {
    const targetDeck = payload?.targetDeck || null;
    return openGenerateCardsPanel(
      stageEl,
      { createDeck, importCards },
      async (resultDeckId) => {
        ui.transition("nav/reload");
        if (resultDeckId) {
          if (!targetDeck) {
            ui.transition("content/select-deck", { id: resultDeckId });
          } else {
            const content = ui.get("content");
            if (content?.deck?.id === targetDeck.id) {
              const fresh = await getCards(targetDeck.id);
              ui.transition("content/cards-changed", { cards: fresh });
            }
          }
        }
      },
      targetDeck,
      onDismiss,
    );
  }

  if (kind === "settings") {
    const { deck, cards } = payload;
    return openDeckSettings(
      stageEl,
      deck,
      {
        updateDeckMode, updateDeckName, updateDeckOrder,
        updateDeckReadingDisplay, deleteDeck,
        exportJson: () => openJsonPanel(stageEl, deck.name, toImportJson(cards)),
      },
      (changes) => {
        ui.transition("nav/reload");
        ui.transition("content/select-deck", { id: changes.deleted ? null : deck.id });
      },
      onDismiss,
    );
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
    return "";
  },

  bindEvents(_rootEl, host) {
    const { ui } = host;
    const stageEl = document.getElementById("app");

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

      const handle = openKind(next.kind, next.payload || {}, host, stageEl, onDismiss);
      currentHandle = handle;
      currentKey = nextKey;
    });

    return () => {
      unsub();
      if (currentHandle) currentHandle.close();
    };
  },
};
