import { icon } from "./icon.js";

/**
 * Pane header row — the Figma "Header" component: a left control, a centered
 * title, and a right control, used by every action/content pane
 * (content, lookup, review, card-edit, json). Slots take pre-built HTML so
 * each pane keeps its own controls (menu vs back vs close, done vs save vs
 * badge) while sharing one structure.
 *
 * @param {{ leading?: string, title?: string, trailing?: string }} slots
 * @returns {string} HTML string
 */
export function renderPaneHeader({ leading = "", title = "", trailing = "" } = {}) {
  return `
    <div class="pane-header flex items-center">
      ${leading || headerSpacer()}
      ${title}
      ${trailing || headerSpacer()}
    </div>
  `;
}

/** A 44px inert placeholder that balances a single-sided header. */
export function headerSpacer() {
  return `<span class="pane-header-spacer shrink-0"></span>`;
}

/**
 * A header icon button (back / close / menu / done …).
 * @param {string} name - icon name
 * @param {{ action?: string, label?: string, className?: string }} [opts]
 */
export function headerIconButton(name, { action, label, className = "" } = {}) {
  const cls = ["icon-button", className].filter(Boolean).join(" ");
  const actionAttr = action ? `data-action="${action}"` : "";
  return `<button class="${cls}" ${actionAttr} aria-label="${label || name}">${icon(name)}</button>`;
}

/**
 * The centered pane title. Pass `action` to make it a tappable button (e.g.
 * the phrasebook title menu); omit for a plain label.
 * @param {string} text
 * @param {{ action?: string, className?: string }} [opts]
 */
export function headerTitle(text, { action, className = "" } = {}) {
  const cls = ["pane-header-title", "flex-1", "text-center", "fg-body", className]
    .filter(Boolean)
    .join(" ");
  return action
    ? `<button class="${cls} tappable" data-action="${action}">${text}</button>`
    : `<span class="${cls}">${text}</span>`;
}
