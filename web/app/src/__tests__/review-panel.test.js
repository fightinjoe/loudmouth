// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { speak } = vi.hoisted(() => ({ speak: vi.fn() }));

vi.mock("../js/tts", async () => {
  const actual = await vi.importActual("../js/tts");
  return { ...actual, speak };
});

import { openReviewPanel } from "../components/review-panel";

const deck = {
  id: "d1",
  name: "Dinner",
  lang: "ja",
  createdAt: "2026-01-01T00:00:00.000Z",
  mode: "review",
  order: "default",
  readingDisplay: "reading",
};

function phraseEntry({
  key,
  text,
  canonicalTranslation,
  occurrenceTranslation,
}) {
  return {
    key,
    cardId: `card-${key}`,
    card: {
      type: "phrase",
      lang: "ja",
      text,
      translation: canonicalTranslation,
      reading: [[text, `${text}-reading`]],
    },
    occurrence: {
      id: key,
      deckId: deck.id,
      cardId: `card-${key}`,
      position: 0,
      translation: occurrenceTranslation,
    },
    sources: [],
  };
}

const dinnerPhrase = phraseEntry({
  key: "occurrence-dinner",
  text: "晩ご飯",
  canonicalTranslation: "canonical dinner",
  occurrenceTranslation: "dinner for this conversation",
});

const waterPhrase = phraseEntry({
  key: "occurrence-water",
  text: "水",
  canonicalTranslation: "canonical water",
  occurrenceTranslation: "water here",
});

const wordEntry = {
  key: JSON.stringify([deck.id, "word-eat"]),
  cardId: "word-eat",
  card: {
    type: "word",
    lang: "ja",
    text: "食べる",
    reading: [["食", "た"], ["べる", null]],
    translation: "to eat",
    partOfSpeech: "verb",
    senseKey: "consume-food",
  },
  sources: [
    {
      snapshot: {
        lang: "ja",
        text: "肉を食べません。",
        translation: "I do not eat meat.",
        reading: [["肉を", "にくを"], ["食べません", "たべません"], ["。", null]],
      },
      ref: { cardId: "deleted-parent", occurrenceId: "deleted-occurrence" },
      span: { start: 2, end: 7 },
    },
    {
      snapshot: {
        lang: "ja",
        text: "魚を食べる。",
        translation: "I eat fish.",
      },
      span: { start: 2, end: 5 },
    },
  ],
};

const hostileRole = '<img src=x onerror="window.__reviewInjected=true">';
const hostileExplanation = 'particle"><svg onload=alert(1)>';
const hostileSourceTranslation = "<b>historical meat sentence</b>";
const hostileReading = 'た"><img src=x onerror=alert(1)>';
const chunkEntry = {
  key: JSON.stringify([deck.id, "chunk-object-marker"]),
  cardId: "chunk-object-marker",
  card: {
    type: "chunk",
    lang: "ja",
    text: "を",
    translation: "object marker",
    source: {
      snapshot: {
        lang: "ja",
        text: "肉を食べる。",
        translation: hostileSourceTranslation,
        reading: [["肉を", "にくを"], ["食べる", hostileReading], ["。", null]],
      },
      ref: { cardId: "edited-parent", occurrenceId: "deleted-parent-occurrence" },
      span: { start: 1, end: 2 },
    },
    role: hostileRole,
    explanation: hostileExplanation,
  },
  sources: [],
};

let appElement;

beforeEach(() => {
  document.body.innerHTML = "";
  appElement = document.createElement("div");
  document.body.appendChild(appElement);
  speak.mockClear();
});

function reviewWrap() {
  return appElement.querySelector(".review-card-wrap");
}

function baseText(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll("rt").forEach((annotation) => annotation.remove());
  return clone.textContent;
}

function swipe(element, deltaX) {
  const start = new Event("touchstart");
  start.touches = [{ clientX: 200, clientY: 100 }];
  element.dispatchEvent(start);

  const move = new Event("touchmove");
  move.touches = [{ clientX: 200 + deltaX, clientY: 100 }];
  element.dispatchEvent(move);

  const end = new Event("touchend");
  end.changedTouches = [{ clientX: 200 + deltaX, clientY: 100 }];
  element.dispatchEvent(end);
}

describe("openReviewPanel", () => {
  it("reviews a Phrase with the selected occurrence interpretation", () => {
    openReviewPanel(appElement, deck, [dinnerPhrase], () => {});

    expect(appElement.querySelector(".review-prompt").textContent)
      .toBe("dinner for this conversation");

    appElement.querySelector('[data-action="review/toggle-reveal"]').click();
    expect(reviewWrap().dataset.revealed).toBe("true");

    appElement.querySelector('[data-action="review/toggle-direction"]').click();
    expect(reviewWrap().dataset.revealed).toBe("false");
    expect(appElement.querySelector(".review-prompt").textContent).toContain("晩ご飯");
    expect(appElement.querySelector(".review-answer-primary").textContent)
      .toBe("dinner for this conversation");

    appElement.querySelector('[data-action="review/play"]').click();
    expect(speak).toHaveBeenLastCalledWith("晩ご飯-reading", "ja");
  });

  it("keeps the Word headword primary and reveals durable source snapshots in provided order", () => {
    openReviewPanel(appElement, deck, [wordEntry], () => {});

    expect(appElement.querySelector(".review-prompt").textContent).toBe("to eat");
    appElement.querySelector('[data-action="review/toggle-reveal"]').click();

    expect(baseText(appElement.querySelector(".review-answer-primary"))).toBe("食べる");
    const examples = [...appElement.querySelectorAll(".review-source-example")];
    expect(examples.map((example) => baseText(example.querySelector(".source-context"))))
      .toEqual(["肉を食べません。", "魚を食べる。"]);
    expect(examples.map((example) => example.querySelector(".review-source-example-translation").textContent))
      .toEqual(["I do not eat meat.", "I eat fish."]);
    expect(baseText(examples[0].querySelector("mark"))).toBe("食べません");
  });

  it("omits the source disclosure when a Word has no evidence", () => {
    openReviewPanel(
      appElement,
      deck,
      [{ ...wordEntry, key: "word-without-source", sources: [] }],
      () => {},
    );
    appElement.querySelector('[data-action="review/toggle-reveal"]').click();
    expect(appElement.querySelector(".review-source-examples")).toBeNull();
  });

  it("masks a Chunk in full original-script context without leaking a cut ruby token", () => {
    openReviewPanel(appElement, deck, [chunkEntry], () => {});

    const masked = appElement.querySelector('[data-region="review-chunk-context"]');
    expect(masked.querySelector("mark").textContent).toBe("____");
    expect(baseText(masked)).toBe("肉____食べる。");
    expect([...masked.querySelectorAll("rt")].map((node) => node.textContent))
      .not.toContain("にくを");
    expect(masked.querySelector("rt").textContent).toBe(hostileReading);

    appElement.querySelector('[data-action="review/toggle-reveal"]').click();
    expect(appElement.querySelector('[data-region="review-chunk-context"] mark').textContent)
      .toBe("を");
    expect(appElement.querySelector(".review-chunk-teaching").textContent)
      .toContain(hostileRole);
    expect(appElement.querySelector(".review-chunk-teaching").textContent)
      .toContain(hostileExplanation);
    expect(appElement.querySelector(".review-chunk-teaching").textContent)
      .toContain(hostileSourceTranslation);
    expect(appElement.querySelector("img")).toBeNull();
    expect(appElement.querySelector("svg[onload]")).toBeNull();
  });

  it("shows Chunk context immediately in target-to-English mode but keeps its gloss in the answer", () => {
    openReviewPanel(appElement, deck, [chunkEntry], () => {});
    appElement.querySelector('[data-action="review/toggle-direction"]').click();

    expect(reviewWrap().dataset.revealed).toBe("false");
    expect(appElement.querySelector(".review-prompt mark").textContent).toBe("を");
    expect(appElement.querySelector(".review-prompt").textContent)
      .not.toContain("object marker");
    expect(appElement.querySelector(".review-answer-primary").textContent)
      .toBe("object marker");
  });

  it("press-and-hold peeks and then remasks a Chunk without changing persistent reveal", () => {
    openReviewPanel(appElement, deck, [chunkEntry], () => {});
    const skeleton = appElement.querySelector(".review-answer-skeleton");

    skeleton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(reviewWrap().dataset.revealed).toBe("true");
    expect(appElement.querySelector('[data-region="review-chunk-context"] mark').textContent)
      .toBe("を");

    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(reviewWrap().dataset.revealed).toBe("false");
    expect(appElement.querySelector('[data-region="review-chunk-context"] mark').textContent)
      .toBe("____");
  });

  it("speaks a Word's own pronunciation and a Chunk's full historical source", () => {
    openReviewPanel(appElement, deck, [wordEntry, chunkEntry], () => {});

    appElement.querySelector('[data-action="review/play"]').click();
    expect(speak).toHaveBeenLastCalledWith("たべる", "ja");

    swipe(reviewWrap(), -120);
    appElement.querySelector('[data-action="review/play"]').click();
    expect(speak).toHaveBeenLastCalledWith("肉を食べる。", "ja");
  });

  it("applies session order once and stops swipes at both boundaries", () => {
    const entries = [dinnerPhrase, waterPhrase];
    openReviewPanel(appElement, { ...deck, order: "reverse" }, entries, () => {});

    expect(appElement.querySelector(".review-prompt").textContent).toBe("water here");
    appElement.querySelector('[data-action="review/toggle-reveal"]').click();
    expect(reviewWrap().dataset.revealed).toBe("true");
    swipe(reviewWrap(), -120);
    expect(appElement.querySelector(".review-prompt").textContent)
      .toBe("dinner for this conversation");
    expect(reviewWrap().dataset.revealed).toBe("false");
    swipe(reviewWrap(), -120);
    expect(appElement.querySelector(".review-prompt").textContent)
      .toBe("dinner for this conversation");
    swipe(reviewWrap(), 120);
    expect(appElement.querySelector(".review-prompt").textContent).toBe("water here");
    swipe(reviewWrap(), 120);
    expect(appElement.querySelector(".review-prompt").textContent).toBe("water here");
    expect(entries).toEqual([dinnerPhrase, waterPhrase]);
  });

  it("ignores a sub-threshold swipe", () => {
    openReviewPanel(appElement, deck, [dinnerPhrase, waterPhrase], () => {});
    swipe(reviewWrap(), -20);
    expect(appElement.querySelector(".review-prompt").textContent)
      .toBe("dinner for this conversation");
  });

  it("dismisses through the bottom-sheet transition", () => {
    const onDismiss = vi.fn();
    openReviewPanel(appElement, deck, [dinnerPhrase], onDismiss);
    const panel = appElement.querySelector(".review-panel");

    appElement.querySelector('[data-action="review/close"]').click();
    panel.dispatchEvent(new Event("transitionend"));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
