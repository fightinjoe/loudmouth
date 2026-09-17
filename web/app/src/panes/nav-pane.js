/**
 * Nav pane — Pane Protocol contract for the `nav` namespace.
 *
 * Layer: shell. The landing surface; sits underneath the content pane.
 *
 * Geometry follows the converged navigation-pane study
 * (explorations/navigation-pane/NAV_EXPLORATION.html): a brand header, up to
 * three "Jump back in" cards, one "Library" card per language, and a
 * bottom-anchored create action. The pane is a fixed height regardless of how
 * many phrasebooks exist — language cards open that language's browse view in
 * the content pane rather than expanding rows in place.
 *
 * Slice shape:
 *   { items: NavItem[], reloadAt: number }
 *   NavItem = { kind: 'recent',  deck, subtitle, newest } |
 *             { kind: 'lang',    lang, flag, name, subtitle }
 *
 * Transitions:
 *   nav/reload  — bumps `reloadAt`; the subscriber sees the change and
 *                 re-reads decks from db, then fires `nav/refresh`.
 *   nav/refresh — replaces `items` from a payload of pre-loaded data.
 *
 * Actions registered on the shell delegate:
 *   nav/open-deck             — payload from element data-deck-id
 *   nav/browse-lang           — opens one language's phrasebook list in the
 *                               content pane (payload from data-lang)
 *   nav/open-new-phrasebook   — opens the New-phrasebook action pane
 */
import {
  getCards,
  getDecks,
  getRecentDecks,
  updateDeckAccessTime,
} from "../js/db.js";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { setAttrSafe, setListHTMLSafe } from "../js/uiState.js";
import { renderPhrasebookRow } from "../components/phrasebook-row.js";
import { escapeHTML } from "../js/utils.js";


// ── Pure renderers ───────────────────────────────────────────────────────────

function renderHero() {
  return `
    <div class="nav-hero flex-col">
      <span class="nav-hero-logo text-h2 font-semibold fg-accent">CatchPhrase</span>
      <span class="nav-hero-tagline text-body2 fg-secondary font-light">Say what you need, avoid the rest</span>
    </div>
  `;
}

function renderSectionLabel(title) {
  return `<span class="nav-section-label section-label">${escapeHTML(title)}</span>`;
}

function renderRecentCard(item) {
  return renderPhrasebookRow({
    title: item.deck.name,
    subtitle: item.subtitle,
    chevron: true,
    card: true,
    highlighted: item.newest,
    rowAction: "nav/open-deck",
    rowData: { deckId: item.deck.id },
  });
}

function renderLangCard(item) {
  return renderPhrasebookRow({
    title: item.name,
    subtitle: item.subtitle,
    leading: item.flag,
    chevron: true,
    card: true,
    rowAction: "nav/browse-lang",
    rowData: { lang: item.lang },
  });
}

function renderListHTML(items) {
  const recent = items.filter((i) => i.kind === "recent");
  const langs = items.filter((i) => i.kind === "lang");

  // Both sections hide themselves when empty; first run is header + callout.
  const recentHTML = recent.length
    ? `<div class="nav-section">${renderSectionLabel("Jump back in")}<div class="nav-cards">${recent.map(renderRecentCard).join("")}</div></div>`
    : "";
  const langHTML = langs.length
    ? `<div class="nav-section">${renderSectionLabel("Library")}<div class="nav-cards">${langs.map(renderLangCard).join("")}</div></div>`
    : "";

  return recentHTML + langHTML;
}

// Bottom-anchored create action. With no phrasebooks it becomes the
// "Make your first phrasebook" callout; both live in the same pinned bar.
function renderCreateBar(hasDecks) {
  return hasDecks
    ? `<button class="nav-create-btn tappable" data-action="nav/open-new-phrasebook">New phrasebook</button>`
    : `
      <div class="nav-callout flex-col">
        <span class="nav-callout-title text-h2 font-semibold fg-surface">Make your first phrasebook</span>
        <span class="nav-callout-body text-body1 fg-surface">Tell us the situation. You get the phrases you’d actually say, and none you wouldn’t.</span>
        <button class="nav-callout-btn tappable" data-action="nav/open-new-phrasebook">New phrasebook</button>
      </div>
    `;
}

function nounFor(cards) {
  return cards.every((c) => c.type === "word") ? "words" : "words & phrases";
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// ── Data loader ──────────────────────────────────────────────────────────────

async function loadNavItems() {
  const items = [];

  const recent = await getRecentDecks(3);
  recent.forEach((deck, index) => {
    items.push({ kind: "recent", deck, subtitle: "", newest: index === 0 });
  });

  // Subtitles need card counts; fetch them alongside the rows above.
  for (const item of items) {
    const cards = await getCards(item.deck.id);
    const langName = LANG_NAMES[item.deck.lang] ?? item.deck.lang;
    item.subtitle = `${langName} · ${cards.length} ${nounFor(cards)}`;
  }

  const allDecks = await getDecks(null, { includeSystem: false });
  const byLang = {};
  for (const deck of allDecks) (byLang[deck.lang] ??= []).push(deck);

  for (const lang of Object.keys(byLang).sort()) {
    items.push({
      kind: "lang",
      lang,
      flag: LANG_FLAGS[lang] ?? "",
      name: LANG_NAMES[lang] ?? lang.toUpperCase(),
      subtitle: plural(byLang[lang].length, "phrasebook"),
    });
  }

  return items;
}

// ── Browse view ──────────────────────────────────────────────────────────────
// The content pane hosts a generic browse mode (content-pane-render.js
// renderBrowseBody); this pane builds the group HTML since the row shape and
// click action are the nav pane's, not the content pane's.

/**
 * A Library card's destination: every phrasebook in one language, as rows.
 * Rows dispatch through the content delegate (`content/browse-select`), not
 * the shell delegate, because by then the content pane owns the surface.
 */
export async function loadLangBrowse(lang) {
  const decks = (await getDecks(lang, { includeSystem: false }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rowsHtml = [];
  for (const deck of decks) {
    const cards = await getCards(deck.id);
    rowsHtml.push(renderPhrasebookRow({
      title: deck.name,
      subtitle: `${cards.length} ${nounFor(cards)}`,
      chevron: true,
      rowAction: "content/browse-select",
      rowData: { deckId: deck.id },
    }));
  }

  const flag = LANG_FLAGS[lang] ?? "";
  const name = LANG_NAMES[lang] ?? lang.toUpperCase();
  return {
    title: `${flag} ${name}`.trim(),
    groupsHtml: `<div class="deck-picker-lang-group">${rowsHtml.join("")}</div>`,
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
    const hasDecks = initial.items.some((i) => i.kind === "recent");
    return `
      <div id="nav-pane" class="nav-pane flex-col bg-surface" data-state="${hasDecks ? "populated" : "empty"}">
        <div class="nav-scroll flex-1 overflow-y-auto" data-region="nav-list">
          ${renderHero()}
          <div data-region="nav-sections">${renderListHTML(initial.items)}</div>
        </div>
        <div class="nav-bar" data-region="nav-bar">${renderCreateBar(hasDecks)}</div>
      </div>
    `;
  },

  bindEvents(rootEl, host) {
    const { ui, delegate } = host;
    // app.js binds this pane with `navEl` = #nav-pane itself, while the unit
    // tests mount it inside a wrapper — so match self first, then descendants.
    const paneEl = rootEl.matches?.("#nav-pane") ? rootEl : rootEl.querySelector("#nav-pane");
    const sectionsRegion = rootEl.querySelector('[data-region="nav-sections"]');
    const barRegion = rootEl.querySelector('[data-region="nav-bar"]');

    // Re-render the sections + create bar when items change.
    const unsubItems = ui.subscribe("nav", (next, prev) => {
      if (next?.items === prev?.items) return;
      const items = next?.items ?? [];
      const hasDecks = items.some((i) => i.kind === "recent");
      if (sectionsRegion) setListHTMLSafe(sectionsRegion, renderListHTML(items));
      if (barRegion) barRegion.innerHTML = renderCreateBar(hasDecks);
      // The empty state's taller callout needs more scroll padding; CSS keys
      // off this attribute rather than the pane toggling styles directly.
      if (paneEl) setAttrSafe(paneEl, "state", hasDecks ? "populated" : "empty");
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
      if (id) updateDeckAccessTime(id);
      ui.transition("content/select-deck", { id });
      ui.transition("shell/close");
    });

    delegate.register("nav/browse-lang", async (_e, el) => {
      const lang = el.dataset.lang;
      if (!lang) return;
      ui.transition("content/browse", await loadLangBrowse(lang));
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

    return () => {
      unsubItems();
      unsubReload();
      delegate.unregister("nav/open-deck");
      delegate.unregister("nav/browse-lang");
      delegate.unregister("nav/open-new-phrasebook");
    };
  },
};
