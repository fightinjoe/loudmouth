import { icon } from "./icon.js";
import { escapeHTML } from "../js/utils.js";


/**
 * Phrasebook list row — the Figma "Phrasebook" component (node 542:3753),
 * used in the navigation pane for Recent/Library rows (tappable, trailing
 * chevron) and Suggested rows (non-tappable, trailing "View" pill).
 *
 * Mirrors the Figma component's variant props: `chevron` ⇢ showIconButton,
 * `pill` ⇢ showPill, `subtitle` ⇢ showSubtitle, `selected` ⇢ selected.
 *
 * @param {Object} opts
 * @param {string} opts.title           - primary line (may include a leading emoji)
 * @param {string} [opts.subtitle]      - caption line
 * @param {boolean} [opts.selected]     - highlighted (e.g. a just-added phrasebook)
 * @param {boolean} [opts.chevron]      - show the trailing disclosure chevron
 * @param {string} [opts.rowAction]     - data-action for tapping the whole row
 * @param {Record<string, unknown>} [opts.rowData] - data attributes on the row
 * @param {{ label: string, action: string, data?: Record<string, unknown> }} [opts.pill]
 *                                       - trailing pill button (e.g. "View")
 * @returns {string} HTML string
 */
export function renderPhrasebookRow({
  title,
  subtitle = "",
  selected = false,
  chevron = false,
  rowAction = "",
  rowData = {},
  pill = null,
} = {}) {
  const actionAttr = rowAction ? `data-action="${escapeHTML(rowAction)}"` : "";
  const tappable = rowAction ? "tappable" : "";
  const trailing = chevron
    ? icon("next", { className: "deck-picker-chevron fg-accent" })
    : pill
    ? `<button class="suggested-row-view-btn tappable" data-action="${escapeHTML(pill.action)}" ${renderDataAttributes(pill.data)}>${escapeHTML(pill.label)}</button>`
    : "";

  return `
    <div class="deck-picker-row flex items-center justify-between ${tappable}"${selected ? " data-selected" : ""} ${actionAttr} ${renderDataAttributes(rowData)}>
      <div class="flex-col gap-sm">
        <span class="text-body-lg fg-body">${escapeHTML(title)}</span>
        ${subtitle ? `<span class="text-body2 fg-caption">${escapeHTML(subtitle)}</span>` : ""}
      </div>
      ${trailing}
    </div>
  `;
}

function renderDataAttributes(data = {}) {
  return Object.entries(data)
    .filter(([name]) => /^[a-z][a-zA-Z0-9]*$/.test(name))
    .map(([name, value]) => {
      const attribute = name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
      return `data-${attribute}="${escapeHTML(value)}"`;
    })
    .join(" ");
}
