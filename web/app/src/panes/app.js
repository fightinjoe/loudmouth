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
import * as db from "../js/db.js";

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

  // Fresh installs / no last-loaded deck land on the nav pane's landing
  // view (docs/journeys.md Journey 1 step 1) rather than an empty content
  // pane — the shell only starts "foreground" once there's a deck to show.
  const initialDeckId = params?.id || getLastDeckId();
  const initialShell = initialDeckId ? "foreground" : "background";

  // Mount the static stage scaffolding. Each pane's `render` produces its own
  // root element; they go inside #app-shell in z-order: nav (shell) → content.
  appEl.dataset.shell = initialShell;
  appEl.dataset.actionState = "closed";
  appEl.innerHTML = `
    <div id="app-shell" class="fixed-inset overflow-hidden">
      ${navPane.render(navPane.initialState)}
      ${contentPane.render(contentPane.initialState)}
    </div>
    ${actionPane.render(actionPane.initialState)}
  `;

  // Build the state machine with every pane's initial slice + cross-layer slices.
  const ui = createUIState({
    shell: { exposed: initialShell },
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

  // Bind panes. The action pane has a stable host element (#action-layer)
  // that sub-kinds mount into when opened.
  const actionEl = appEl.querySelector("#action-layer");
  navPane.bindEvents(navEl, createHost({ ui, delegate: shellDelegate, stageEl: appEl }));
  contentPane.bindEvents(contentEl, createHost({ ui, delegate: contentDelegate, stageEl: appEl }));
  actionPane.bindEvents(actionEl, createHost({ ui, delegate: null, stageEl: appEl }));

  // Initial route — kick off a deck load.
  if (initialDeckId) ui.transition("content/select-deck", { id: initialDeckId });

  // Expose the state machine + db for end-to-end smoke tests, which drive
  // transitions and seed data the same way the app does internally.
  // Harmless in prod (nothing reads this outside tests).
  window.__loudmouth = { ui, db };
}
