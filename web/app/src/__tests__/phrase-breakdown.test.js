// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderExplanations, renderSource } from "../components/phrase-breakdown.js";
import detailsPane from "../panes/details-pane.js";
import { createUIState, createHost } from "../js/uiState.js";
import { createDelegate } from "../js/delegate.js";

vi.mock("../js/phrasebook-api.js", () => ({
  getPhraseBreakdown: () => new Promise(() => {}),
}));

function slice(text, reading, chunks) {
  return {
    card: { lang: "ja", text, reading, translation: "A photo" },
    readingDisplay: "reading", showReadings: true, showEnglish: true,
    status: "ready", selectedIndex: 0, all: true,
    breakdown: { chunks: chunks.map(([start, end]) => ({
      start, end, text: text.slice(start, end), gloss: "Meaning", role: "Role", explanation: "Explanation",
    })) },
  };
}

function root(html) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

describe("phrase-breakdown source fidelity", () => {
  it("does not duplicate a compound reading onto partial semantic chunks", () => {
    const state = slice("写真", [["写真", "しゃしん"]], [[0, 1], [1, 2]]);
    const source = root(renderSource(state));
    const explanations = root(renderExplanations(state, state.breakdown.chunks));
    expect(source.querySelector(".card-term-target").textContent).toBe("写真");
    expect([...explanations.querySelectorAll(".details-fragment")].map(el => el.textContent)).toEqual(["写", "真"]);
    expect(source.querySelector("rt")).toBeNull();
    expect(explanations.querySelector("rt")).toBeNull();

    const whole = slice("写真", [["写真", "しゃしん"]], [[0, 2]]);
    expect(root(renderSource(whole)).querySelector("rt").textContent).toBe("しゃしん");
  });

  it("keeps the actual source when saved readings describe different text", () => {
    const state = slice("写真", [["車内", "しゃない"]], [[0, 2]]);
    const source = root(renderSource(state));
    expect(source.querySelector(".card-term-target").textContent).toBe("写真");
    expect(source.querySelector("rt")).toBeNull();
  });

  it("renders source, readings and generated teaching as literal untrusted text", () => {
    const attack = '<img src=x onerror="alert(1)">';
    const state = slice(attack, [[attack, attack]], [[0, attack.length]]);
    Object.assign(state.breakdown.chunks[0], { gloss: attack, role: attack, explanation: attack });
    const content = root(renderSource(state) + renderExplanations(state, state.breakdown.chunks));
    expect(content.querySelector("img, [onerror]")).toBeNull();
    expect(content.querySelector(".details-explanation h3").textContent).toBe(attack);
    expect(content.querySelector(".details-explanation p").textContent).toBe(attack);
    expect(content.querySelector("rt").textContent).toBe(attack);
  });
});

it("keeps keyboard focus inside the dialog when Retry replaces the focused button", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.body.innerHTML = `<main id="app"><div id="app-shell"><button id="source">Source</button></div>${detailsPane.render()}</main>`;
  const ui = createUIState({ details: null, action: null, shell: { exposed: "foreground" }, content: {} });
  ui.registerTransitions(detailsPane.transitions);
  const stageEl = document.querySelector("#app");
  const layer = document.querySelector("#details-layer");
  const cleanup = detailsPane.bindEvents(layer, createHost({ ui, stageEl, delegate: createDelegate(layer) }));
  try {
    ui.transition("details/open", {
      card: { lang: "ja", text: "写真", translation: "photo" },
      opener: document.querySelector("#source"),
    });
    ui.transition("details/failed", { requestId: 0 });
    const retry = layer.querySelector('[data-action="details/retry"]');
    retry.focus();
    retry.click();
    expect(layer.querySelector('[role="dialog"]').contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(layer.querySelector(".details-close"));
  } finally {
    cleanup();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});
