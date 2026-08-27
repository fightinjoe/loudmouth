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

export function registerCardActions({ host, isEdit, resetReveal }) {
  const { ui, delegate } = host;

  const actions = [
    ["content/star-card", async (_e, el) => {
      if (isEdit()) return;
      resetReveal();
      const cardId = el.dataset.cardId;
      const { cards } = ui.get("content");
      const idx = cards.findIndex((c) => String(c.id) === cardId);
      if (idx < 0) return;
      const nowStarred = await toggleCardStar(cardId);
      // Update the card in place; the Starred tab's render filter drops it
      // from view when unstarred (see renderCardsHTML), so no removal here.
      const next = cards.slice();
      next[idx] = {
        ...cards[idx],
        state: { ...(cards[idx].state || {}), starredAt: nowStarred ? new Date().toISOString() : null },
      };
      ui.transition("content/cards-changed", { cards: next });
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

    // Tapping the row body itself (card.js's .card-row) speaks the card —
    // no dedicated play button in the new Figma row (docs/journeys.md-style
    // decision, see components.css). If the row is currently swiped open
    // (revealing star/edit/delete), the tap dismisses that reveal instead of
    // also speaking — matches the other row actions' resetReveal() posture,
    // but here it's an either/or since a tap while revealed reads as "close
    // this," not "close this AND play."
    ["content/play-card", (_e, el) => {
      if (isEdit()) return;
      const wrapper = el.closest(".card-row-wrapper");
      if (wrapper?.classList.contains("card-row-wrapper--swiped")) {
        resetReveal();
        return;
      }
      const { cards } = ui.get("content");
      const card = cards.find((c) => String(c.id) === el.dataset.cardId);
      if (card) speak(ttsText(card), card.lang);
    }],
  ];

  for (const [name, fn] of actions) delegate.register(name, fn);

  return () => {
    for (const [name] of actions) delegate.unregister(name);
  };
}
