import type { Lang } from "@catchphrase/card-schema";
import { openBottomSheet } from "./bottom-sheet";
import type { BottomSheetHandle } from "./bottom-sheet";
import { CONTENT_LANGUAGES, LANG_FLAGS, LANG_NAMES, isContentLanguage } from "../js/lang";
import { getLastAbility } from "../js/preferences";
import { escapeHTML } from "../js/utils";
import { ABILITIES, ABILITY_LABELS, isAbility } from "../js/ability";
import type { Ability } from "../js/ability";

export interface PhrasebookSuggestion {
  id: string;
  emoji: string;
  title: string;
  lang: Lang;
}

export interface PhrasebookConfirmation {
  lang: Lang;
  ability: Ability;
}

export type PhrasebookCreatedCallback = (lang: Lang) => void;
export type PhrasebookConfirmedCallback = (confirmation: PhrasebookConfirmation) => void;

interface NewPhrasebookState {
  lang: Lang;
  ability: Ability;
}


/** Opens the language-selection or suggested-phrasebook confirmation sheet. */
export function openNewPhrasebookPanel(
  appElement: HTMLElement,
  onCreated: PhrasebookCreatedCallback,
  onDismiss: () => void,
  suggestion?: PhrasebookSuggestion,
  onConfirmed?: PhrasebookConfirmedCallback,
): BottomSheetHandle {
  const initialLanguage = suggestion?.lang ?? CONTENT_LANGUAGES[0];
  const savedAbility: unknown = getLastAbility(initialLanguage);
  const state: NewPhrasebookState = {
    lang: initialLanguage,
    ability: isAbility(savedAbility) ? savedAbility : "basics",
  };

  const sheet = openBottomSheet(appElement, {
    kind: "new-phrasebook",
    bodyHTML: `<div class="new-phrasebook-inner flex-col">${renderBody(state, suggestion)}</div>`,
    onClose: onDismiss,
    onMount: (panel) => bind(panel),
  });

  return sheet;

  function rerender(): void {
    const inner = sheet.panel.querySelector<HTMLElement>(".new-phrasebook-inner");
    if (!inner) return;
    inner.innerHTML = renderBody(state, suggestion);
    bind(sheet.panel);
  }

  function bind(panel: HTMLElement): void {
    const languageSelect = panel.querySelector<HTMLSelectElement>(
      '[data-action="new-phrasebook/lang"]',
    );
    const abilitySelect = panel.querySelector<HTMLSelectElement>(
      '[data-action="new-phrasebook/ability"]',
    );

    if (languageSelect) languageSelect.value = state.lang;
    if (abilitySelect) abilitySelect.value = state.ability;

    languageSelect?.addEventListener("change", () => {
      if (!isContentLanguage(languageSelect.value)) return;
      state.lang = languageSelect.value;
      const nextSavedAbility: unknown = getLastAbility(state.lang);
      state.ability = isAbility(nextSavedAbility) ? nextSavedAbility : "basics";
      rerender();
    });

    abilitySelect?.addEventListener("change", () => {
      if (isAbility(abilitySelect.value)) state.ability = abilitySelect.value;
    });

    panel.querySelector<HTMLButtonElement>(
      '[data-action="new-phrasebook/create"]',
    )?.addEventListener("click", (event) => {
      if (!(event.currentTarget instanceof HTMLButtonElement)) return;
      if (event.currentTarget.disabled) return;
      event.currentTarget.disabled = true;

      if (suggestion) {
        if (!onConfirmed) {
          throw new Error("A confirmation callback is required for a suggested phrasebook");
        }
        onConfirmed({ lang: state.lang, ability: state.ability });
        return;
      }
      onCreated(state.lang);
    });
  }
}

function renderBody(
  state: Readonly<NewPhrasebookState>,
  suggestion?: PhrasebookSuggestion,
): string {
  const heading = suggestion ? `"${suggestion.title}" phrasebook` : "New phrasebook";
  const subtitle = suggestion
    ? "Save and modify a collection for the language you want to catch and learn"
    : "Create a collection for the language you want to catch and learn";
  const buttonLabel = suggestion
    ? `View "${suggestion.title}" phrasebook`
    : "Create your first phrasebook";

  return `
    <div class="pane-header new-phrasebook-header flex-col">
      <span class="text-header fg-body font-semibold">${escapeHTML(heading)}</span>
      <span class="text-body2 fg-secondary">${subtitle}</span>
    </div>
    <div class="new-phrasebook-body flex-col" data-suggestion="${Boolean(suggestion)}">
      <label class="new-phrasebook-row flex items-center justify-between">
        <span class="text-body1 fg-body">Language</span>
        <select class="new-phrasebook-select" data-action="new-phrasebook/lang">
          ${CONTENT_LANGUAGES.map((language) => `<option value="${language}" ${state.lang === language ? "selected" : ""}>${LANG_FLAGS[language]} ${LANG_NAMES[language]}</option>`).join("")}
        </select>
      </label>
      <label class="new-phrasebook-row new-phrasebook-ability flex items-center justify-between">
        <span class="text-body1 fg-body">Your ability</span>
        <select class="new-phrasebook-select" data-action="new-phrasebook/ability">
          ${ABILITIES.map((ability) => `<option value="${ability}" ${state.ability === ability ? "selected" : ""}>${ABILITY_LABELS[ability]}</option>`).join("")}
        </select>
      </label>
    </div>
    <button class="new-phrasebook-create-btn tappable" data-action="new-phrasebook/create">
      ${escapeHTML(buttonLabel)}
    </button>
  `;
}
