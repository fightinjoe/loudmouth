import { initNavPane } from "../panes/navPane.js";
import { initContentPane } from "../panes/contentPane.js";

const LAST_DECK_KEY = "loudmouth.lastDeckId";

export function getLastDeckId() {
  try {
    return localStorage.getItem(LAST_DECK_KEY);
  } catch {
    return null;
  }
}

export function setLastDeckId(deckId) {
  try {
    localStorage.setItem(LAST_DECK_KEY, deckId);
  } catch {
    /* ignore */
  }
}

export function initApp(params) {
  const appEl = document.getElementById("app");

  appEl.dataset.content = "foreground";

  appEl.innerHTML = `
    <div id="app-shell" class="fixed-inset overflow-hidden">
      <div id="nav-pane" class="nav-pane flex-col bg-primary overflow-y-auto">
        <div class="meat"></div>
      </div>
      <div id="content-pane" class="content-pane absolute-inset flex-col bg-primary transition-transform">
        <div class="handle"></div>
        <div id="content-pane-scrim" class="content-pane-scrim absolute-inset transition-opacity"></div>
        <div class="meat screen flex-1 flex-col bg-primary overflow-hidden"></div>
      </div>
    </div>
  `;

  const app = {
    els: {
      appEl,
      navPaneEl: appEl.querySelector("#nav-pane"),
      contentPaneEl: appEl.querySelector("#content-pane"),
      handleEl: appEl.querySelector("#content-pane .handle"),
      scrimEl: appEl.querySelector("#content-pane-scrim"),
    },
    getLastDeckId,
    setLastDeckId,
  };

  initNavPane(app, params);
  initContentPane(app); // sets app.navPane = gestures.shell

  app.els.scrimEl.addEventListener("click", () => app.navPane.close());

  const initialDeckId = params.id || getLastDeckId();
  app.contentPane.loadDeck(initialDeckId);
}
