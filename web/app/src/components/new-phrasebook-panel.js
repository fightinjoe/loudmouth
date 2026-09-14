import { openBottomSheet } from "./bottom-sheet.js";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { getLastAbility } from "../js/preferences.js";
import { escapeHTML } from "../js/utils.js";


const LANGS = ["zh", "ja", "es", "cs"];
const ABILITIES = ["none", "beginner", "intermediate", "advanced"];
const ABILITY_LABELS = { none: "None", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };


/**
 * Opens New-phrasebook mode: language and ability are chosen before guided
 * creation starts. No deck is persisted until generation succeeds.
 *
 * When `suggestion` is passed, the same surface acts as a confirmation gate
 * and hands the chosen language and ability to the caller, which builds the
 * unsaved preview.
 *
 * @param {HTMLElement} appEl
 * @param {Function} onCreated - (create mode) called with (lang, ability)
 * @param {Function} onDismiss
 * @param {{ id: string, emoji: string, title: string, lang: string }} [suggestion]
 * @param {Function} [onConfirmed] - (confirm mode) called with { lang, ability }
 */
export function openNewPhrasebookPanel(appEl, onCreated, onDismiss, suggestion, onConfirmed) {
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
      // Reuse this language's last chosen ability when available.
      state.ability = getLastAbility(state.lang) || "beginner";
      rerender();
    });

    abilitySelect?.addEventListener("change", (e) => {
      state.ability = e.target.value;
    });

    panel.querySelector('[data-action="new-phrasebook/create"]')?.addEventListener("click", (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      if (suggestion) {
        onConfirmed({ lang: state.lang, ability: state.ability });
        return;
      }
      onCreated(state.lang, state.ability);
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
      <span class="text-header fg-body font-semibold">${escapeHTML(heading)}</span>
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
      ${escapeHTML(buttonLabel)}
    </button>
  `;
}

