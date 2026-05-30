/**
 * Nav pane — Pane Protocol contract for the `nav` namespace.
 *
 * Layer: shell. Lists decks; sits underneath the content pane.
 *
 * Slice shape:
 *   { items: NavItem[], reloadAt: number }
 *   NavItem = { kind: 'header', title } |
 *             { kind: 'deck',   deck, count } |
 *             { kind: 'lang-group', title, rows: { deck, count }[] }
 *
 * Transitions:
 *   nav/reload  — bumps `reloadAt`; the subscriber sees the change and
 *                 re-reads decks from db, then fires `nav/refresh`.
 *   nav/refresh — replaces `items` from a payload of pre-loaded data.
 *
 * Actions registered on the shell delegate:
 *   nav/open-deck      — payload from element data-deck-id
 *   nav/open-generate  — opens the generate-cards action pane
 */
import {
  getCards,
  getStarredCards,
  getDecks,
  getRecentDecks,
  updateDeckAccessTime,
} from "../js/db.js";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { setListHTMLSafe } from "../js/uiState.js";

// ── Pure renderers ───────────────────────────────────────────────────────────

function renderHeader(title) {
  return `
    <div class="deck-picker-section-header flex items-baseline justify-between section-label">
      ${title}
    </div>
  `;
}

function renderDeckRow(deck, count) {
  return `
    <div class="deck-picker-row flex items-center tappable" data-action="nav/open-deck" data-deck-id="${deck.id}">
      <div class="flex-row gap-md justify-center">
        <span class="text-h2 fg-body">${deck.name}</span>
        <span class="text-body2 fg-secondary">${count} card${count !== 1 ? "s" : ""}</span>
      </div>
    </div>
  `;
}

function renderItemsHTML(items) {
  return items.map((item) => {
    if (item.kind === "header") return renderHeader(item.title);
    if (item.kind === "deck") return renderDeckRow(item.deck, item.count);
    if (item.kind === "lang-group") {
      return `
        ${renderHeader(item.title)}
        <div class="deck-picker-lang-group">
          ${item.rows.map((r) => renderDeckRow(r.deck, r.count)).join("")}
        </div>
      `;
    }
    return "";
  }).join("");
}

function renderListHTML(items) {
  const isEmpty = !items.some(
    (i) => i.kind === "deck" || (i.kind === "lang-group" && i.rows.length),
  );
  return (
    renderItemsHTML(items) +
    (isEmpty
      ? '<p class="deck-picker-empty text-center fg-secondary">No decks yet.</p>'
      : "")
  );
}

// ── Data loader ──────────────────────────────────────────────────────────────

async function loadNavItems() {
  const items = [];

  const recent = await getRecentDecks(3);
  if (recent.length) {
    items.push({ kind: "header", title: "Most recent" });
    for (const deck of recent) {
      const cards = await getCards(deck.id);
      items.push({ kind: "deck", deck, count: cards.length });
    }
  }

  const allDecks = await getDecks(null, { includeSystem: false });
  const byLang = {};
  for (const deck of allDecks) (byLang[deck.lang] ??= []).push(deck);
  for (const lang of Object.keys(byLang)) {
    byLang[lang].sort((a, b) => a.name.localeCompare(b.name));
  }

  for (const [lang, decks] of Object.entries(byLang).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const flag = LANG_FLAGS[lang] ?? "";
    const name = LANG_NAMES[lang] ?? lang.toUpperCase();
    const rows = [];

    const starred = await getStarredCards(lang);
    if (starred.length) {
      rows.push({
        deck: { id: `starred:${lang}`, name: "★ Starred", lang },
        count: starred.length,
      });
    }
    for (const deck of decks) {
      const cards = await getCards(deck.id);
      rows.push({ deck, count: cards.length });
    }

    items.push({
      kind: "lang-group",
      title: `<span>${flag} ${name}</span>`,
      rows,
    });
  }

  return items;
}

// ── Contract ─────────────────────────────────────────────────────────────────

export default {
  namespace: "nav",

  initialState: { items: [], reloadAt: 0 },

  transitions: {
    "nav/reload": (slice) => ({ ...slice, reloadAt: Date.now() }),
    "nav/refresh": (slice, payload) => ({ ...slice, items: payload?.items ?? [] }),
  },

  render(initial) {
    return `
      <div id="nav-pane" class="nav-pane flex-col bg-primary overflow-y-auto">
        <div class="pane-header">
          <span class="pane-header-spacer shrink-0"></span>
          <span class="pane-header-title flex-1 text-center text-header font-semibold fg-body bg-none no-tap-highlight">Decks</span>
          <span class="pane-header-spacer shrink-0"></span>
        </div>
        <div class="deck-list flex-1 overflow-y-auto" data-region="nav-list">${renderListHTML(initial.items)}</div>
        <button class="nav-pane-add-fab flex items-center justify-center bg-accent fg-surface text-h2 shrink-0 tappable" data-action="nav/open-generate" aria-label="Add deck">＋</button>
      </div>
    `;
  },

  bindEvents(rootEl, host) {
    const { ui, delegate } = host;
    const listRegion = rootEl.querySelector('[data-region="nav-list"]');

    // Re-render the list when items change.
    const unsubItems = ui.subscribe("nav", (next, prev) => {
      if (!listRegion) return;
      if (next?.items !== prev?.items) {
        setListHTMLSafe(listRegion, renderListHTML(next?.items ?? []));
      }
    });

    // Effect subscriber: when reloadAt bumps, re-read from db and refresh.
    let inflight = 0;
    const unsubReload = ui.subscribe("nav", async (next, prev) => {
      if (next?.reloadAt === prev?.reloadAt) return;
      const stamp = ++inflight;
      const items = await loadNavItems();
      if (stamp !== inflight) return; // a newer reload superseded us
      ui.transition("nav/refresh", { items });
    });

    // Initial load.
    ui.transition("nav/reload");

    // Action handlers (shell delegate).
    delegate.register("nav/open-deck", (_e, el) => {
      const id = el.dataset.deckId;
      if (id && !id.startsWith("lang:") && !id.startsWith("starred:")) {
        updateDeckAccessTime(id);
      }
      ui.transition("content/select-deck", { id });
      ui.transition("shell/close");
    });

    delegate.register("nav/open-generate", () => {
      ui.transition("shell/close");
      ui.transition("action/open", { kind: "generate", payload: {} });
    });

    return () => {
      unsubItems();
      unsubReload();
      delegate.unregister("nav/open-deck");
      delegate.unregister("nav/open-generate");
    };
  },
};
