import { icon } from "./icon";
import { escapeHTML } from "../js/utils";

export interface PaneHeaderSlots {
  leading?: string;
  title?: string;
  trailing?: string;
}

export interface HeaderIconButtonOptions {
  action?: string;
  label?: string;
  className?: string;
}

export interface HeaderTitleOptions {
  action?: string;
  className?: string;
}

/** Renders the common left/title/right pane header structure. */
export function renderPaneHeader(
  { leading = "", title = "", trailing = "" }: PaneHeaderSlots = {},
): string {
  return `
    <div class="pane-header flex items-center">
      ${leading || headerSpacer()}
      ${title}
      ${trailing || headerSpacer()}
    </div>
  `;
}

/** A 44px inert placeholder that balances a single-sided header. */
export function headerSpacer(): string {
  return `<span class="pane-header-spacer shrink-0"></span>`;
}

/** Renders an icon button for a pane header. */
export function headerIconButton(
  name: string,
  { action, label, className = "" }: HeaderIconButtonOptions = {},
): string {
  const classes = escapeHTML(["icon-button", className].filter(Boolean).join(" "));
  const actionAttribute = action ? `data-action="${escapeHTML(action)}"` : "";
  return `<button class="${classes}" ${actionAttribute} aria-label="${escapeHTML(label || name)}">${icon(name)}</button>`;
}

/** Renders the centered title as a label or an action button. */
export function headerTitle(
  text: string,
  { action, className = "" }: HeaderTitleOptions = {},
): string {
  const classes = escapeHTML([
    "pane-header-title",
    "flex-1",
    "text-center",
    "fg-body",
    className,
  ].filter(Boolean).join(" "));
  const escapedText = escapeHTML(text);
  return action
    ? `<button class="${classes} tappable" data-action="${escapeHTML(action)}">${escapedText}</button>`
    : `<span class="${classes}">${escapedText}</span>`;
}
