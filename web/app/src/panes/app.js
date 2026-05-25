/**
 * App boot — wires the Pane Protocol primitives to the live DOM.
 *
 * Responsibilities:
 *  1. Build the root state machine with one slice per registered pane.
 *  2. Build per-layer delegates (shell layer = nav root, content layer = #app).
 *  3. Mount each pane (call render → set innerHTML → call bindEvents).
 *  4. Wire the initial route (load the last deck or the one in the URL).
 */
import { createUIState, createHost, setAttrSafe } from "../js/uiState.js";
import { createDelegate } from "../js/delegate.js";
import navPane from "./nav-pane.js";
import contentPane from "./content-pane.js";
import actionPane from "./action-pane.js";

const LAST_DECK_KEY = "loudmouth.lastDeckId";

function getLastDeckId() {
  try { return localStorage.getItem(LAST_DECK_KEY); } catch { return null; }
}
function setLastDeckId(deckId) {
  try {
    if (deckId) localStorage.setItem(LAST_DECK_KEY, deckId);
  } catch { /* ignore */ }
}

// ── Cross-pane transitions (shell, action) ───────────────────────────────────
// These don't belong to a single pane module — they coordinate layers.

const shellTransitions = {
  "shell/toggle": (slice) => ({
    exposed: slice.exposed === "foreground" ? "background" : "foreground",
  }),
  "shell/close": () => ({ exposed: "foreground" }),
};

export function initApp(params) {
  const appEl = document.getElementById("app");

  // Mount the static stage scaffolding. Each pane's `render` produces its own
  // root element; they go inside #app-shell in z-order: nav (shell) → content.
  appEl.dataset.shell = "foreground";
  appEl.innerHTML = `
    <div id="app-shell" class="fixed-inset overflow-hidden">
      ${navPane.render(navPane.initialState)}
      ${contentPane.render(contentPane.initialState)}
    </div>
  `;

  // Build the state machine with every pane's initial slice + cross-layer slices.
  const ui = createUIState({
    shell: { exposed: "foreground" },
    [navPane.namespace]: navPane.initialState,
    [contentPane.namespace]: contentPane.initialState,
    [actionPane.namespace]: actionPane.initialState,
  });
  ui.registerTransitions(shellTransitions);
  ui.registerTransitions(navPane.transitions);
  ui.registerTransitions(contentPane.transitions);
  ui.registerTransitions(actionPane.transitions);

  // Shell subscriber writes the data-* attribute that the CSS uses.
  ui.subscribe("shell", (next) => {
    setAttrSafe(appEl, "shell", next.exposed);
  });

  // Per-layer delegates.
  const navEl = appEl.querySelector("#nav-pane");
  const contentEl = appEl.querySelector("#content-pane");
  const shellDelegate = createDelegate(navEl);
  const contentDelegate = createDelegate(contentEl);

  // Persist last-loaded deck whenever content changes.
  ui.subscribe("content", (next, prev) => {
    if (next.deckId && next.deckId !== prev?.deckId) setLastDeckId(next.deckId);
  });

  // Bind panes. The action pane has no resting DOM in v1 — sub-kinds inject
  // their own DOM via the bottom-sheet primitive when opened.
  navPane.bindEvents(navEl, createHost({ ui, delegate: shellDelegate }));
  contentPane.bindEvents(contentEl, createHost({ ui, delegate: contentDelegate }));
  actionPane.bindEvents(null, createHost({ ui, delegate: null }));

  // Initial route — kick off a deck load.
  const initialDeckId = params?.id || getLastDeckId();
  if (initialDeckId) ui.transition("content/select-deck", { id: initialDeckId });
}
