// import { buildNavPane } from "../panes/navPane.js";
import { initApp } from "../panes/app.js";

export function initRouter() {
  function route() {
    const raw = window.location.hash.slice(1) || "deck";
    const [, qparams] = raw.split("?");
    const params = Object.fromEntries(new URLSearchParams(qparams || ""));

    initApp(params);
  }

  window.addEventListener("hashchange", route);
  route();
}
