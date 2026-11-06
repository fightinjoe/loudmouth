import { initApp, type AppMount } from "../panes/app";

export function initRouter(): () => void {
  let currentMount: AppMount | null = null;
  function route() {
    const raw = window.location.hash.slice(1) || "deck";
    const [, qparams] = raw.split("?");
    const params = Object.fromEntries(new URLSearchParams(qparams || ""));

    currentMount?.dispose();
    currentMount = null;
    currentMount = initApp(params);
  }

  window.addEventListener("hashchange", route);
  route();
  return () => {
    window.removeEventListener("hashchange", route);
    currentMount?.dispose();
    currentMount = null;
  };
}
