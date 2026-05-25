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
import detailsPane from "./details-pane.js";
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
  appEl.dataset.details = "closed";
  appEl.dataset.actionState = "closed";
  // Render order: nav (lowest), shell-reveal scrim (between nav and
  // content), content (above scrim), then details and action layers on top.
  // The scrim sits BEHIND the content pane in z-order — it dims the nav
  // when exposed; the content pane is the actionable surface that the
  // user drags back. Click on the scrim fires shell/close via the
  // shell-layer delegate.
  appEl.innerHTML = `
    <div id="app-shell" class="fixed-inset overflow-hidden">
      ${navPane.render(navPane.initialState)}
      <div id="content-pane-scrim" class="content-pane-scrim absolute-inset transition-opacity" data-action="shell/close"></div>
      ${contentPane.render(contentPane.initialState)}
    </div>
    ${detailsPane.render(detailsPane.initialState)}
    ${actionPane.render(actionPane.initialState)}
  `;

  // Build the state machine with every pane's initial slice + cross-layer slices.
  const ui = createUIState({
    shell: { exposed: "foreground" },
    [navPane.namespace]: navPane.initialState,
    [contentPane.namespace]: contentPane.initialState,
    [detailsPane.namespace]: detailsPane.initialState,
    [actionPane.namespace]: actionPane.initialState,
  });
  ui.registerTransitions(shellTransitions);
  ui.registerTransitions(navPane.transitions);
  ui.registerTransitions(contentPane.transitions);
  ui.registerTransitions(detailsPane.transitions);
  ui.registerTransitions(actionPane.transitions);

  // Shell subscriber writes the data-* attribute that the CSS uses.
  ui.subscribe("shell", (next) => {
    setAttrSafe(appEl, "shell", next.exposed);
  });

  // Per-layer delegates. The shell delegate lives on #app-shell so it
  // catches both nav-pane clicks AND the scrim that sits between nav
  // and content. The content delegate stays on #content-pane.
  const shellRootEl = appEl.querySelector("#app-shell");
  const navEl = appEl.querySelector("#nav-pane");
  const contentEl = appEl.querySelector("#content-pane");
  const detailsEl = appEl.querySelector("#details-pane");
  const shellDelegate = createDelegate(shellRootEl);
  const contentDelegate = createDelegate(contentEl);
  const detailsDelegate = createDelegate(detailsEl);

  // Persist last-loaded deck whenever content changes.
  ui.subscribe("content", (next, prev) => {
    if (next.deckId && next.deckId !== prev?.deckId) setLastDeckId(next.deckId);
  });

  // Bind panes. The action pane has a stable host element (#action-layer)
  // that sub-kinds mount into when opened.
  const actionEl = appEl.querySelector("#action-layer");
  navPane.bindEvents(navEl, createHost({ ui, delegate: shellDelegate, stageEl: appEl }));
  contentPane.bindEvents(contentEl, createHost({ ui, delegate: contentDelegate, stageEl: appEl }));
  detailsPane.bindEvents(detailsEl, createHost({ ui, delegate: detailsDelegate, stageEl: appEl }));
  actionPane.bindEvents(actionEl, createHost({ ui, delegate: null, stageEl: appEl }));

  // Initial route — kick off a deck load.
  const initialDeckId = params?.id || getLastDeckId();
  if (initialDeckId) ui.transition("content/select-deck", { id: initialDeckId });
}
