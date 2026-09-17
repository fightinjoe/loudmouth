import { icon } from "./icon.js";
import { escapeHTML } from "../js/utils.js";


/**
 * Phrasebook list row — the Figma "Phrasebook" component (node 542:3753),
 * used in the navigation pane for Jump back in / Library cards (tappable,
 * trailing chevron) and Suggested rows (non-tappable, trailing "View" pill).
 *
 * Mirrors the Figma component's variant props: `chevron` ⇢ showIconButton,
 * `pill` ⇢ showPill, `subtitle` ⇢ showSubtitle, `selected` ⇢ selected.
 *
 * The navigation-pane study adds a card treatment: `card` gives the row a
 * gray-50 filled surface with its own padding and radius, `highlighted`
 * swaps that fill for yellow-100 (the newest phrasebook), and `leading`
 * renders a decorative glyph — a flag — before the text.
 *
 * @param {Object} opts
 * @param {string} opts.title           - primary line (may include a leading emoji)
 * @param {string} [opts.subtitle]      - caption line
 * @param {boolean} [opts.selected]     - highlighted (e.g. a just-added phrasebook)
 * @param {boolean} [opts.chevron]      - show the trailing disclosure chevron
 * @param {boolean} [opts.card]         - render as a filled card rather than a bare row
 * @param {boolean} [opts.highlighted]  - card variant only: yellow-100 fill
 * @param {string} [opts.leading]       - decorative leading glyph (e.g. a flag)
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
  card = false,
  highlighted = false,
  leading = "",
  rowAction = "",
  rowData = {},
  pill = null,
} = {}) {
  const actionAttr = rowAction ? `data-action="${escapeHTML(rowAction)}"` : "";
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
    <div class="${classes}"${selected ? " data-selected" : ""}${highlighted ? ' data-highlighted="true"' : ""} ${actionAttr} ${renderDataAttributes(rowData)}>
      ${leading ? `<span class="deck-picker-leading" aria-hidden="true">${escapeHTML(leading)}</span>` : ""}
      <div class="deck-picker-row-text flex-col gap-sm">
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
