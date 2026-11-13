import type { ContextResponse } from "@catchphrase/card-schema";
import { icon } from "./icon";
import { escapeHTML } from "../js/utils";

export function renderRadioList<T extends string>(
  options: readonly T[],
  {
    name,
    action,
    selected,
    label = (value: T) => value,
    extra = "",
  }: {
    name: string;
    action: string;
    selected?: string;
    label?: (value: T) => string;
    extra?: string;
  },
): string {
  return `<div class="creation-radio-items flex-col">
    ${options.map((value, index) => `
      <label class="creation-radio-item flex items-center tappable">
        <input type="radio" name="${escapeHTML(name)}" data-action="${escapeHTML(action)}" data-option="${index}" value="${escapeHTML(value)}" ${selected === value ? "checked" : ""}>
        <span>${escapeHTML(label(value))}</span>
      </label>
    `).join("")}
    ${extra}
  </div>`;
}

export function renderChecklistItem(item: ContextResponse["checklist"][number], index: number): string {
  return `
    <button class="creation-checklist-item flex items-center tappable" data-action="creation/toggle-checklist-item" data-index="${index}" data-checked="${item.checked}" aria-pressed="${item.checked}">
      <span class="creation-checklist-check flex items-center justify-center" aria-hidden="true">${icon("check")}</span>
      <span>${escapeHTML(item.label)}</span>
    </button>
  `;
}
