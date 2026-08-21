// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { openReviewPanel } from "../components/review-panel.js";

const deck = { id: "d1", name: "Dinner", lang: "ja", order: "default" };

const cards = [
  { id: "c1", lang: "ja", text: "晩ご飯", translation: "dinner", reading: [["晩", "ばん"], ["ご飯", "ごはん"]] },
  { id: "c2", lang: "ja", text: "水", translation: "water" },
  { id: "c3", lang: "ja", text: "お会計", translation: "check, please" },
];

let appEl;

beforeEach(() => {
  appEl = document.createElement("div");
  document.body.appendChild(appEl);
});

function currentCardEl() {
  return appEl.querySelector(".review-panel-inner");
}

function swipe(el, dx) {
  const start = new Event("touchstart");
  start.touches = [{ clientX: 200, clientY: 100 }];
  el.dispatchEvent(start);

  const move = new Event("touchmove");
  move.touches = [{ clientX: 200 + dx, clientY: 100 }];
  el.dispatchEvent(move);

  const end = new Event("touchend");
  end.changedTouches = [{ clientX: 200 + dx, clientY: 100 }];
  el.dispatchEvent(end);
}

describe("openReviewPanel", () => {
  it("renders the prompt hidden behind a skeleton until revealed", () => {
    openReviewPanel(appEl, deck, cards, () => {});
    const card = appEl.querySelector(".review-card-wrap");
    expect(card.dataset.revealed).toBe("false");
    expect(appEl.querySelector(".review-prompt").textContent).toBe("dinner");
  });

  it("toggle-reveal flips data-revealed", () => {
    openReviewPanel(appEl, deck, cards, () => {});
    appEl.querySelector('[data-action="review/toggle-reveal"]').click();
    expect(appEl.querySelector(".review-card-wrap").dataset.revealed).toBe("true");
    appEl.querySelector('[data-action="review/toggle-reveal"]').click();
    expect(appEl.querySelector(".review-card-wrap").dataset.revealed).toBe("false");
  });

  it("toggle-direction swaps prompt and answer sides", () => {
    openReviewPanel(appEl, deck, cards, () => {});
    expect(appEl.querySelector(".review-prompt").textContent).toBe("dinner");
    appEl.querySelector('[data-action="review/toggle-direction"]').click();
    // Reversed: prompt is now the target-language text (ruby-rendered 晩ご飯).
    expect(appEl.querySelector(".review-prompt").textContent).toContain("晩");
    expect(appEl.querySelector(".review-answer").textContent).toBe("dinner");
  });

  it("toggle-direction resets reveal state", () => {
    openReviewPanel(appEl, deck, cards, () => {});
    appEl.querySelector('[data-action="review/toggle-reveal"]').click();
    expect(appEl.querySelector(".review-card-wrap").dataset.revealed).toBe("true");
    appEl.querySelector('[data-action="review/toggle-direction"]').click();
    expect(appEl.querySelector(".review-card-wrap").dataset.revealed).toBe("false");
  });

  it("swiping left advances to the next card", () => {
    openReviewPanel(appEl, deck, cards, () => {});
    expect(appEl.querySelector(".review-prompt").textContent).toBe("dinner");
    swipe(appEl.querySelector(".review-card-wrap"), -120);
    expect(appEl.querySelector(".review-prompt").textContent).toBe("water");
  });

  it("swiping right goes back to the previous card", () => {
    openReviewPanel(appEl, deck, cards, () => {});
    swipe(appEl.querySelector(".review-card-wrap"), -120); // -> water
    swipe(appEl.querySelector(".review-card-wrap"), 120); // <- dinner
    expect(appEl.querySelector(".review-prompt").textContent).toBe("dinner");
  });

  it("does not loop past the last card", () => {
    openReviewPanel(appEl, deck, cards, () => {});
    swipe(appEl.querySelector(".review-card-wrap"), -120); // water
    swipe(appEl.querySelector(".review-card-wrap"), -120); // check, please
    swipe(appEl.querySelector(".review-card-wrap"), -120); // no-op, at boundary
    expect(appEl.querySelector(".review-prompt").textContent).toBe("check, please");
  });

  it("does not loop before the first card", () => {
    openReviewPanel(appEl, deck, cards, () => {});
    swipe(appEl.querySelector(".review-card-wrap"), 120); // no-op, already at index 0
    expect(appEl.querySelector(".review-prompt").textContent).toBe("dinner");
  });

  it("a sub-threshold swipe does not advance", () => {
    openReviewPanel(appEl, deck, cards, () => {});
    swipe(appEl.querySelector(".review-card-wrap"), -20);
    expect(appEl.querySelector(".review-prompt").textContent).toBe("dinner");
  });

  it("renders an empty state for a deck with no cards", () => {
    openReviewPanel(appEl, deck, [], () => {});
    expect(appEl.querySelector(".review-empty")).toBeTruthy();
    expect(appEl.querySelector(".review-prompt")).toBeNull();
  });

  it("close button fires onDismiss via the bottom-sheet close handle", () => {
    let dismissed = false;
    openReviewPanel(appEl, deck, cards, () => { dismissed = true; });
    const panel = appEl.querySelector(".review-panel");
    appEl.querySelector('[data-action="review/close"]').click();
    expect(panel.classList.contains("bottom-sheet--visible")).toBe(false);
    // The real dismissal (panel removal + onDismiss) is gated on a CSS
    // `transitionend` event, which happy-dom does not fire on its own.
    panel.dispatchEvent(new Event("transitionend"));
    expect(dismissed).toBe(true);
  });
});
