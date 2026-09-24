import "../styles/components.css";
import "../styles/variables.css";
import "../styles/utilities.css";
import "../styles/base.css";
import "../styles/panes.css";
import "../styles/phrase-breakdown.css";
import { initRouter } from "./router";
import { initializeLibrary } from "./db";

async function start(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) throw new Error("Missing application root");
  app.textContent = "Initializing library…";
  try {
    await initializeLibrary();
    initRouter();
  } catch (error) {
    const message = document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent = error instanceof Error ? error.message : String(error);
    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "Reload";
    reload.addEventListener("click", () => window.location.reload());
    app.replaceChildren(message, reload);
  }
}

void start();
