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
 *   nav/open-deck             — payload from element data-deck-id
 *   nav/open-new-phrasebook   — opens the New-phrasebook action pane
 */
import {
  getCards,
  getDecks,
  getRecentDecks,
  getSeededDeckIds,
  updateDeckAccessTime,
} from "../js/db.js";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { setListHTMLSafe } from "../js/uiState.js";
import { SUGGESTED_PHRASEBOOKS, pendingSuggestions } from "../js/suggested-phrasebooks.js";
import { icon } from "../components/icon.js";
import { renderPhrasebookRow } from "../components/phrasebook-row.js";

// ── Pure renderers ───────────────────────────────────────────────────────────

function renderHero() {
  return `
    <div class="nav-hero flex-col">
      <span class="nav-hero-logo text-h1 font-bold fg-accent">CatchPhrase</span>
      <span class="nav-hero-tagline text-body1 fg-secondary font-light">Collect the language you need, avoid the rest!</span>
    </div>
  `;
}

// Empty-state-only banner (docs/journeys.md Journey 1 step 1). The empty
// state and populated landing share this component; once the user has any
// phrasebook the banner steps aside for the FAB as the add entry point.
function renderCtaBanner(hasDecks) {
  if (hasDecks) return "";
  return `
    <div class="nav-cta-banner flex items-center justify-between">
      <div class="nav-cta-banner-text flex-col">
        <span class="text-body1 font-semibold fg-surface">No phrasebooks</span>
        <span class="text-body2 fg-surface">Create your first!</span>
      </div>
      <button class="nav-cta-banner-btn tappable" data-action="nav/open-new-phrasebook">New phrasebook</button>
    </div>
  `;
}

function renderHeader(title, { viewAllAction } = {}) {
  return `
    <div class="deck-picker-section-header section-label flex items-center justify-between">
      <span>${title}</span>
      ${viewAllAction ? `<button class="deck-picker-view-all text-body1 fg-accent tappable" data-action="${viewAllAction}">View all</button>` : ""}
    </div>
  `;
}

function renderDeckRow(deck, count, subtitle, rowAction = "nav/open-deck") {
  return renderPhrasebookRow({
    title: deck.name,
    subtitle: subtitle ?? `${count} card${count !== 1 ? "s" : ""}`,
    chevron: true,
    rowAction,
    rowAttrs: `data-deck-id="${deck.id}"`,
  });
}

function renderSuggestedRow(suggestion, action = "nav/view-suggested") {
  const count = suggestion.terms.length;
  const noun = suggestion.terms.every((t) => t.type === "word") ? "words" : "words & phrases";
  return renderPhrasebookRow({
    title: `${suggestion.emoji} ${suggestion.title}`,
    subtitle: `${count} ${noun}`,
    pill: { label: "View", action, attrs: `data-suggestion-id="${suggestion.id}"` },
  });
}

function renderItemsHTML(items) {
  return items.map((item) => {
    if (item.kind === "header") return renderHeader(item.title, { viewAllAction: item.viewAllAction });
    if (item.kind === "deck") return renderDeckRow(item.deck, item.count, item.subtitle);
    if (item.kind === "suggested") {
      return `
        ${renderHeader(item.title, { viewAllAction: "nav/view-all-suggested" })}
        <div class="deck-picker-lang-group">
          ${item.suggestions.map((s) => renderSuggestedRow(s)).join("")}
        </div>
      `;
    }
    if (item.kind === "lang-group") {
      return `
        ${renderHeader(item.title)}
        <div class="deck-picker-lang-group">
          ${item.rows.map((r) => renderDeckRow(r.deck, r.count, r.subtitle)).join("")}
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

function nounFor(cards) {
  return cards.every((c) => c.type === "word") ? "words" : "words & phrases";
}

// ── Data loader ──────────────────────────────────────────────────────────────

async function loadNavItems() {
  const items = [];

  const recent = await getRecentDecks(3);
  if (recent.length) {
    items.push({ kind: "header", title: "Recent", viewAllAction: "nav/view-all-recent" });
    for (const deck of recent) {
      const cards = await getCards(deck.id);
      const langName = LANG_NAMES[deck.lang] ?? deck.lang;
      items.push({
        kind: "deck",
        deck,
        count: cards.length,
        subtitle: `${langName} · ${cards.length} ${nounFor(cards)}`,
      });
    }
  }

  const seededDeckIds = await getSeededDeckIds();
  const suggestions = pendingSuggestions(seededDeckIds);
  if (suggestions.length) {
    items.push({ kind: "suggested", title: "Suggested phrasebooks", suggestions });
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

    for (const deck of decks) {
      const cards = await getCards(deck.id);
      rows.push({ deck, count: cards.length, subtitle: `${cards.length} ${nounFor(cards)}` });
    }

    items.push({
      kind: "lang-group",
      title: `${flag} ${name}`,
      rows,
    });
  }

  return items;
}

// ── Browse views ("View all") ─────────────────────────────────────────────
// The content pane hosts a generic browse mode (content-pane-render.js
// renderBrowseBody); this pane builds the group HTML since the row shape
// (deck chevron rows vs. suggestion pill rows) and click actions differ.

/**
 * "View all" under Recent → every real phrasebook, grouped by language
 * (Figma node 602:5562, "All phrasebooks"). Rows dispatch through the
 * content delegate (`content/browse-select`), not the shell delegate.
 */
export async function loadAllPhrasebooksBrowse() {
  const allDecks = await getDecks(null, { includeSystem: false });
  const byLang = {};
  for (const deck of allDecks) (byLang[deck.lang] ??= []).push(deck);
  for (const lang of Object.keys(byLang)) {
    byLang[lang].sort((a, b) => a.name.localeCompare(b.name));
  }

  const groups = [];
  for (const [lang, decks] of Object.entries(byLang).sort(([a], [b]) => a.localeCompare(b))) {
    const flag = LANG_FLAGS[lang] ?? "";
    const name = LANG_NAMES[lang] ?? lang.toUpperCase();
    const rowsHtml = [];
    for (const deck of decks) {
      const cards = await getCards(deck.id);
      rowsHtml.push(renderDeckRow(deck, cards.length, `${cards.length} ${nounFor(cards)}`, "content/browse-select"));
    }
    groups.push(`
      ${renderHeader(`${flag} ${name}`)}
      <div class="deck-picker-lang-group">${rowsHtml.join("")}</div>
    `);
  }

  return { title: "All phrasebooks", groupsHtml: groups.join("") };
}

/** "View all" under Suggested phrasebooks → every pending suggestion, flat. */
export async function loadSuggestedBrowse() {
  const seededDeckIds = await getSeededDeckIds();
  const suggestions = pendingSuggestions(seededDeckIds);
  const rowsHtml = suggestions
    .map((s) => renderSuggestedRow(s, "content/browse-view-suggested"))
    .join("");
  return {
    title: "Suggested phrasebooks",
    groupsHtml: `<div class="deck-picker-lang-group">${rowsHtml}</div>`,
  };
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
    const hasDecks = initial.items.some((i) => i.kind === "deck");
    return `
      <div id="nav-pane" class="nav-pane flex-col bg-primary overflow-y-auto">
        ${renderHero()}
        <div data-region="nav-banner">${renderCtaBanner(hasDecks)}</div>
        <div class="deck-list flex-1 overflow-y-auto" data-region="nav-list">${renderListHTML(initial.items)}</div>
        <button class="nav-pane-add-fab flex items-center justify-center bg-accent fg-surface shrink-0 tappable" data-action="nav/open-new-phrasebook" aria-label="New phrasebook">${icon("add", { size: "lg" })}</button>
      </div>
    `;
  },

  bindEvents(rootEl, host) {
    const { ui, delegate } = host;
    const listRegion = rootEl.querySelector('[data-region="nav-list"]');
    const bannerRegion = rootEl.querySelector('[data-region="nav-banner"]');

    // Re-render the list + banner when items change.
    const unsubItems = ui.subscribe("nav", (next, prev) => {
      if (next?.items === prev?.items) return;
      const items = next?.items ?? [];
      if (listRegion) setListHTMLSafe(listRegion, renderListHTML(items));
      if (bannerRegion) bannerRegion.innerHTML = renderCtaBanner(items.some((i) => i.kind === "deck"));
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

    delegate.register("nav/open-deck", (_e, el) => {
      const id = el.dataset.deckId;
      if (id && !id.startsWith("lang:")) {
        updateDeckAccessTime(id);
      }
      ui.transition("content/select-deck", { id });
      ui.transition("shell/close");
    });

    delegate.register("nav/open-new-phrasebook", () => {
      // Intentionally does NOT close the shell: the New Phrasebook activity
      // pane is a modal layer independent of the content pane (Pane
      // Protocol Rule — action layer sits above shell, not coupled to it).
      // The content pane only comes forward once a deck is actually
      // selected/created (see action-pane.js's new-phrasebook branch).
      ui.transition("action/open", { kind: "new-phrasebook", payload: {} });
    });

    delegate.register("nav/view-suggested", (_e, el) => {
      const suggestion = SUGGESTED_PHRASEBOOKS.find((s) => s.id === el.dataset.suggestionId);
      if (!suggestion) return;
      // Same reasoning as nav/open-new-phrasebook above — no shell/close here.
      ui.transition("action/open", { kind: "new-phrasebook", payload: { suggestion } });
    });

    delegate.register("nav/view-all-recent", async () => {
      const browse = await loadAllPhrasebooksBrowse();
      ui.transition("content/browse", browse);
      ui.transition("shell/close");
    });

    delegate.register("nav/view-all-suggested", async () => {
      const browse = await loadSuggestedBrowse();
      ui.transition("content/browse", browse);
      ui.transition("shell/close");
    });

    return () => {
      unsubItems();
      unsubReload();
      delegate.unregister("nav/open-deck");
      delegate.unregister("nav/open-new-phrasebook");
      delegate.unregister("nav/view-suggested");
      delegate.unregister("nav/view-all-recent");
      delegate.unregister("nav/view-all-suggested");
    };
  },
};
