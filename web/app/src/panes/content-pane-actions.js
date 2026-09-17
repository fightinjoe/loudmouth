/**
 * Content pane — card-row action handlers.
 *
 * Registers click actions on the content layer's delegate. Normal phrasebook
 * drags belong to the pager, so edit/delete are reached by tapping a card
 * after entering Edit cards; legacy browse rows retain swipe-to-reveal.
 * Star mutations use a narrow state transition so the pager DOM is not
 * rebuilt underneath focus or scroll.
 *
 * Returns a cleanup function that unregisters everything.
 */
import { toggleCardStar } from "../js/db.js";
import { speak, ttsText } from "../js/tts.js";

export function registerCardActions({ host, isEdit, resetReveal }) {
  const { ui, delegate } = host;
  function openEditor(el) {
    resetReveal();
    const { cards } = ui.get("content");
    const card = cards.find((candidate) => String(candidate.id) === el.dataset.cardId);
    if (card) ui.transition("action/open", { kind: "card-edit", payload: { card } });
  }

  const actions = [
    ["content/star-card", async (_e, el) => {
      if (isEdit()) return;
      resetReveal();
      const cardId = el.dataset.cardId;
      const { cards } = ui.get("content");
      if (!cards.some((card) => String(card.id) === cardId)) return;
      const nowStarred = await toggleCardStar(cardId);
      ui.transition("content/card-star-changed", {
        cardId,
        starredAt: nowStarred ? new Date().toISOString() : null,
      });
    }],

    ["content/edit-card", (_e, el) => {
      if (isEdit()) return;
      openEditor(el);
    }],

    ["content/delete-card", (_e, el) => {
      if (isEdit()) return;
      resetReveal();
      const { cards } = ui.get("content");
      ui.transition("content/cards-changed", {
        cards: cards.filter((c) => String(c.id) !== el.dataset.cardId),
      });
    }],

    // Edit mode keeps the existing editor; vocabulary keeps tap-to-pronounce.
    ["content/open-card", (_e, el) => {
      if (isEdit()) {
        openEditor(el);
        return;
      }
      const wrapper = el.closest(".card-row-wrapper");
      if (wrapper?.classList.contains("card-row-wrapper--swiped")) {
        resetReveal();
        return;
      }
      const { cards } = ui.get("content");
      const card = cards.find((candidate) => String(candidate.id) === el.dataset.cardId);
      if (!card) return;
      if (card.type === "word") {
        speak(ttsText(card), card.lang);
      } else if (!ui.get("action")) {
        ui.transition("details/open", {
          card,
          opener: el.querySelector(".card-term"),
          readingDisplay: ui.get("content").deck?.readingDisplay || "reading",
          showEnglish: true,
          showReadings: true,
        });
      }
    }],

    ["content/play-card", (_e, el) => {
      if (isEdit()) return;
      const card = ui.get("content").cards.find((candidate) => String(candidate.id) === el.dataset.cardId);
      if (card) speak(ttsText(card), card.lang);
    }],
  ];

  for (const [name, fn] of actions) delegate.register(name, fn);

  return () => {
    for (const [name] of actions) delegate.unregister(name);
  };
}
