import { wireNavPaneGesture } from "../js/gestures.js";
import { buildNavPane } from "../panes/navPane.js";

export function initApp(params) {
  const appEl = document.getElementById("app");

  appEl.innerHTML = `
    <div class="nav-shell fixed-inset overflow-hidden">
      <div id="nav-pane" class="nav-pane flex-col bg-primary overflow-y-auto"></div>
      <div id="nav-main" class="nav-main absolute-inset flex-col bg-primary transition-transform">
        <div class="handle"></div>
        <div id="nav-main-scrim" class="nav-main-scrim absolute-inset transition-opacity"></div>
        <div id="content-pane" class="screen flex-1 flex-col bg-primary overflow-hidden"></div>
      </div>
    </div>
  `;

  const els = {
    navPane: appEl.querySelector("#nav-pane"),
    handle: appEl.querySelector("#nav-main .handle"),
    contentPane: appEl.querySelector("#nav-main"),
    scrim: appEl.querySelector("#nav-main-scrim"),
  };

  let app = { els };

  app.navPane = wireNavPaneGesture(app);

  // Scrim tap closes nav pane
  app.els.scrim.addEventListener("click", () => app.navPane.close());

  buildNavPane(app, params);
}
