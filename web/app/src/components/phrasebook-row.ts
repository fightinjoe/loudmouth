import { icon } from "./icon";
import { escapeHTML } from "../js/utils";

export type DataAttributes = Readonly<Record<string, unknown>>;

export interface PhrasebookRowPill {
  label: string;
  action: string;
  data?: DataAttributes;
}

export interface PhrasebookRowOptions {
  title: string;
  subtitle?: string;
  selected?: boolean;
  chevron?: boolean;
  card?: boolean;
  highlighted?: boolean;
  leading?: string;
  rowAction?: string;
  rowData?: DataAttributes;
  pill?: PhrasebookRowPill | null;
}

/** Renders a navigation or suggestion phrasebook row. */
export function renderPhrasebookRow({
  title,
  subtitle = "",
  selected = false,
  chevron = false,
  card = false,
  highlighted = false,
  leading = "",
  rowAction = "",
  rowData = {},
  pill = null,
}: PhrasebookRowOptions = { title: "" }): string {
  const actionAttribute = rowAction ? `data-action="${escapeHTML(rowAction)}"` : "";
  const classes = [
    "deck-picker-row",
    "flex",
    "items-center",
    "justify-between",
    card && "deck-picker-card",
    rowAction && "tappable",
  ].filter(Boolean).join(" ");
  const trailing = chevron
    ? icon("next", { className: "deck-picker-chevron fg-accent" })
    : pill
      ? `<button class="suggested-row-view-btn tappable" data-action="${escapeHTML(pill.action)}" ${renderDataAttributes(pill.data)}>${escapeHTML(pill.label)}</button>`
      : "";

  return `
    <div class="${classes}"${selected ? " data-selected" : ""}${highlighted ? ' data-highlighted="true"' : ""} ${actionAttribute} ${renderDataAttributes(rowData)}>
      ${leading ? `<span class="deck-picker-leading" aria-hidden="true">${escapeHTML(leading)}</span>` : ""}
      <div class="deck-picker-row-text flex-col gap-sm">
        <span class="text-body-lg fg-body">${escapeHTML(title)}</span>
        ${subtitle ? `<span class="text-body2 fg-caption">${escapeHTML(subtitle)}</span>` : ""}
      </div>
      ${trailing}
    </div>
  `;
}

function renderDataAttributes(data: DataAttributes = {}): string {
  return Object.entries(data)
    .filter(([name]) => /^[a-z][a-zA-Z0-9]*$/.test(name))
    .map(([name, value]) => {
      const attribute = name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
      return `data-${attribute}="${escapeHTML(value)}"`;
    })
    .join(" ");
}
