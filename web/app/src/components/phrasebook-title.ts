import { escapeHTML } from "../js/utils";

/** Speech-bubble outline from Figma v04; the gradient follows the phrasebook accent. */
const BUBBLE_PATH = "M414 141.097C414 162.147 397.684 179.596 376.681 181.007L132.838 197.384C127.91 203.921 114.137 226.458 138.102 248.87C97.3941 244.815 83.9774 208.898 81.4648 200.834L54.6807 202.634C31.5864 204.185 12.0002 185.87 12 162.724V8H414V141.097Z";

export interface PhrasebookTitleOptions {
  /** Library and settings controls; supplied by the pane so actions stay pane-owned. */
  leading: string;
  trailing: string;
}

function renderBubble(): string {
  return `<svg class="phrasebook-bubble" viewBox="0 0 426 265.446" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <filter id="phrasebook-bubble-shadow" x="0" y="0" width="426" height="265.446" filterUnits="userSpaceOnUse"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000" flood-opacity=".25"/></filter>
      <linearGradient id="phrasebook-bubble-fill" x1="213" y1="73.5" x2="213" y2="248.87" gradientUnits="userSpaceOnUse"><stop class="phrasebook-bubble-top"/><stop offset="1" class="phrasebook-bubble-bottom"/></linearGradient>
      <clipPath id="phrasebook-bubble-clip"><path d="${BUBBLE_PATH}"/></clipPath>
    </defs>
    <g filter="url(#phrasebook-bubble-shadow)">
      <path d="${BUBBLE_PATH}" fill="url(#phrasebook-bubble-fill)"/>
      <path d="${BUBBLE_PATH}" fill="none" stroke="#fff" stroke-width="8" clip-path="url(#phrasebook-bubble-clip)"/>
    </g>
  </svg>`;
}

/**
 * Fixed title layer: the bubble title and a slim bar share one header. The
 * content pane switches between them with a class at a scroll threshold.
 */
export function renderPhrasebookTitle(name: string, { leading, trailing }: PhrasebookTitleOptions): string {
  const title = escapeHTML(name);
  return `<header class="phrasebook-titlebar" data-region="book-header">
    <div class="phrasebook-minibar" aria-hidden="true"><span>${title}</span></div>
    <div class="phrasebook-bubble-wrap">${renderBubble()}<h1 class="phrasebook-title">${title}</h1></div>
    <div class="phrasebook-controls">${leading}<div class="phrasebook-tools">${trailing}</div></div>
  </header>`;
}
