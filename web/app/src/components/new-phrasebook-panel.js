import { openBottomSheet } from "./bottom-sheet.js";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { getLastAbility } from "../js/preferences.js";

const LANGS = ["zh", "ja", "es", "cs"];
const ABILITIES = ["none", "beginner", "intermediate", "advanced"];
const ABILITY_LABELS = { none: "None", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };

// Placeholder name for a freshly created phrasebook — the lookup panel
// renames it to "{Term} phrasebook" on the first term ever saved into it
// (docs/journeys.md Journey 1 step 10 shows the finished deck as "Dinner
// phrasebook", named after the first look-up, not left as a generic
// placeholder). See lookup-panel.js `maybeAutoNameDeck`.
export const PLACEHOLDER_DECK_NAME = "New phrasebook";

/**
 * Opens New-phrasebook mode (docs/journeys.md Journey 1 steps 1-2 +
 * 'Ability field'): Language + Your ability selects, immutable once the
 * phrasebook is created. On create, opens directly into the Input mode of
 * the /lookup stack (see action-pane.js's 'new-phrasebook' -> 'lookup'
 * hand-off).
 *
 * Also serves Journey 2's Confirm mode (a suggested-phrasebook preview
 * gate) when `suggestion` is passed — "reuses the New-phrasebook
 * action-pane content, confirm-specific copy" per
 * docs/projects/phrasebook-lookup-ux/tasks.json PH-008. Confirm mode
 * doesn't call `createDeck` itself; it hands the chosen language/ability
 * back to `onConfirmed` so the caller can build the unsaved preview
 * (action-pane.js's 'new-phrasebook' -> content-pane preview hand-off).
 *
 * @param {HTMLElement} appEl
 * @param {{ createDeck: Function }} deps
 * @param {Function} onCreated - (create mode) called with the created deck
 * @param {Function} onDismiss
 * @param {{ id: string, emoji: string, title: string, lang: string }} [suggestion]
 * @param {Function} [onConfirmed] - (confirm mode) called with { lang, ability }
 */
export function openNewPhrasebookPanel(appEl, { createDeck }, onCreated, onDismiss, suggestion, onConfirmed) {
  const state = {
    lang: suggestion?.lang || LANGS[0],
    ability: getLastAbility(suggestion?.lang || LANGS[0]) || "beginner",
  };

  const sheet = openBottomSheet(appEl, {
    kind: "new-phrasebook",
    bodyHTML: `<div class="new-phrasebook-inner flex-col">${renderBody(state, suggestion)}</div>`,
    onClose: onDismiss,
    onMount: (panel) => bind(panel),
  });

  return sheet;

  function rerender() {
    const inner = sheet.panel.querySelector(".new-phrasebook-inner");
    if (!inner) return;
    inner.innerHTML = renderBody(state, suggestion);
    bind(sheet.panel);
  }

  function bind(panel) {
    const langSelect = panel.querySelector('[data-action="new-phrasebook/lang"]');
    const abilitySelect = panel.querySelector('[data-action="new-phrasebook/ability"]');
    // Explicitly sync from state rather than relying solely on the parsed
    // `selected` attribute — set values here so selection is always
    // JS-driven and consistent with the input-field pattern elsewhere.
    if (langSelect) langSelect.value = state.lang;
    if (abilitySelect) abilitySelect.value = state.ability;

    langSelect?.addEventListener("change", (e) => {
      state.lang = e.target.value;
      // App-wide "last ability used" pre-fills for a language you've used
      // before (docs/journeys.md 'Ability field').
      state.ability = getLastAbility(state.lang) || "beginner";
      rerender();
    });

    abilitySelect?.addEventListener("change", (e) => {
      state.ability = e.target.value;
    });


    panel.querySelector('[data-action="new-phrasebook/create"]')?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      if (suggestion) {
        onConfirmed({ lang: state.lang, ability: state.ability });
        return;
      }
      const deck = await createDeck(PLACEHOLDER_DECK_NAME, state.lang, { ability: state.ability });
      onCreated(deck);
    });
  }
}

function renderBody(state, suggestion) {
  const heading = suggestion ? `"${suggestion.title}" phrasebook` : "New phrasebook";
  const subtitle = suggestion
    ? "Save and modify a collection for the language you want to catch and learn"
    : "Create a collection for the language you want to catch and learn";
  const buttonLabel = suggestion ? `View "${suggestion.title}" phrasebook` : "Create your first phrasebook";

  return `
    <div class="pane-header new-phrasebook-header flex-col">
      <span class="text-header fg-body font-semibold">${esc(heading)}</span>
      <span class="text-body2 fg-secondary">${subtitle}</span>
    </div>
    <div class="new-phrasebook-body flex-col">
      <label class="new-phrasebook-row flex items-center justify-between">
        <span class="text-body1 fg-body">Language</span>
        <select class="new-phrasebook-select" data-action="new-phrasebook/lang">
          ${LANGS.map((l) => `<option value="${l}" ${state.lang === l ? "selected" : ""}>${LANG_FLAGS[l]} ${LANG_NAMES[l]}</option>`).join("")}
        </select>
      </label>
      <label class="new-phrasebook-row flex items-center justify-between">
        <span class="text-body1 fg-body">Your ability</span>
        <select class="new-phrasebook-select" data-action="new-phrasebook/ability">
          ${ABILITIES.map((a) => `<option value="${a}" ${state.ability === a ? "selected" : ""}>${ABILITY_LABELS[a]}</option>`).join("")}
        </select>
      </label>
    </div>
    <button class="new-phrasebook-create-btn tappable" data-action="new-phrasebook/create">
      ${esc(buttonLabel)}
    </button>
  `;
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
