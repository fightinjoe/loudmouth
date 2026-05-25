/**
 * Content pane — card-row action handlers.
 *
 * Registers click actions on the content layer's delegate. Each handler
 * (a) is gated on `isEdit()` — in edit mode, the reorder handle owns the
 * row; clicks should not bleed through; (b) calls `resetReveal()` if a
 * row was previously swiped, then performs its work via state transitions.
 *
 * `host` is the protocol host (ui + delegate). `deps` is the bag of db
 * mutations + UI openers the actions need.
 *
 * Returns a cleanup function that unregisters everything.
 */
import { toggleCardStar } from "../js/db.js";
import { speak, ttsText } from "../js/tts.js";

const CARD_WRAPPER_SEL = ".card-row-wrapper";
const SWIPED_CLASS = "card-row-wrapper--swiped";

export function registerCardActions({ host, isEdit, resetReveal }) {
  const { ui, delegate } = host;

  const actions = [
    ["content/star-card", async (_e, el) => {
      if (isEdit()) return;
      resetReveal();
      const cardId = el.dataset.cardId;
      const { cards, isStarred } = ui.get("content");
      const idx = cards.findIndex((c) => String(c.id) === cardId);
      if (idx < 0) return;
      const nowStarred = await toggleCardStar(cardId);
      const updated = {
        ...cards[idx],
        state: { ...(cards[idx].state || {}), starredAt: nowStarred ? new Date().toISOString() : null },
      };
      if (isStarred && !nowStarred) {
        ui.transition("content/cards-changed", { cards: cards.filter((c) => String(c.id) !== cardId) });
      } else {
        const next = cards.slice();
        next[idx] = updated;
        ui.transition("content/cards-changed", { cards: next });
      }
    }],

    ["content/edit-card", (_e, el) => {
      if (isEdit()) return;
      resetReveal();
      const { cards } = ui.get("content");
      const card = cards.find((c) => String(c.id) === el.dataset.cardId);
      if (!card) return;
      ui.transition("action/open", { kind: "card-edit", payload: { card } });
    }],

    ["content/delete-card", (_e, el) => {
      if (isEdit()) return;
      resetReveal();
      const { cards } = ui.get("content");
      ui.transition("content/cards-changed", {
        cards: cards.filter((c) => String(c.id) !== el.dataset.cardId),
      });
    }],

    ["content/play-card", (e, el) => {
      if (isEdit()) return;
      e.stopPropagation();
      const { cards } = ui.get("content");
      const card = cards.find((c) => String(c.id) === el.dataset.cardId);
      if (card) speak(ttsText(card), card.lang);
    }],

    ["content/open-card", (_e, el) => {
      if (isEdit()) return;
      const wrapper = el.closest(CARD_WRAPPER_SEL);
      if (wrapper?.classList.contains(SWIPED_CLASS)) {
        resetReveal();
        return;
      }
      const { cards, deck } = ui.get("content");
      const index = cards.findIndex((c) => String(c.id) === el.dataset.cardId);
      ui.transition("details/open", { deck, cards, index: index < 0 ? 0 : index });
    }],
  ];

  for (const [name, fn] of actions) delegate.register(name, fn);

  return () => {
    for (const [name] of actions) delegate.unregister(name);
  };
}
