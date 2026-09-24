import type {
  Deck,
  DeckMode,
  DeckOrder,
  ReadingDisplay,
} from "../js/library-types";
import { MODE_LABELS, MODES as MODES_MAP } from "../js/modes";
import { escapeHTML } from "../js/utils";
import { openBottomSheet } from "./bottom-sheet";
import type { BottomSheetHandle } from "./bottom-sheet";
import { icon } from "./icon";

const MODES: readonly DeckMode[] = Object.values(MODES_MAP);
const ORDERS: readonly DeckOrder[] = ["default", "random", "reverse"];
const ORDER_LABELS = {
  default: "Default",
  random: "Random",
  reverse: "Reverse",
} as const satisfies Record<DeckOrder, string>;
const READING_DISPLAYS: readonly ReadingDisplay[] = ["reading", "romanization"];
const READING_DISPLAY_LABELS = {
  reading: "Native",
  romanization: "Romanized",
} as const satisfies Record<ReadingDisplay, string>;

interface DeckSettingsState {
  name: string;
  mode: DeckMode;
  order: DeckOrder;
  readingDisplay: ReadingDisplay;
}

interface DeckSettingsOperations {
  updateDeckMode(deckId: string, mode: DeckMode): Promise<void>;
  updateDeckName(deckId: string, name: string): Promise<void>;
  updateDeckOrder(deckId: string, order: DeckOrder): Promise<void>;
  updateDeckReadingDisplay(deckId: string, readingDisplay: ReadingDisplay): Promise<void>;
  deleteDeck(deckId: string): Promise<void>;
  exportJson(): void;
}

export type DeckSettingsChange =
  | { name: string }
  | { mode: DeckMode }
  | { order: DeckOrder }
  | { readingDisplay: ReadingDisplay }
  | { deleted: true };

function renderBody({ name, mode, order, readingDisplay }: DeckSettingsState): string {
  return `
    <div class="deck-settings-section-header section-label">General</div>
    <div class="deck-settings-row flex items-center justify-between tappable" id="ds-name-row">
      <span class="deck-settings-label text-body1 font-medium fg-body">Name</span>
      <span class="deck-settings-value flex items-center text-body1 font-medium fg-body" id="ds-name-value">${escapeHTML(name)}</span>
    </div>
    <div class="deck-settings-row flex items-center justify-between tappable" id="ds-mode-row">
      <span class="deck-settings-label text-body1 font-medium fg-body">Card template</span>
      <span class="deck-settings-value deck-settings-value--accent flex items-center text-body1 font-medium fg-accent" id="ds-mode-value">
        ${escapeHTML(MODE_LABELS[mode])}
        ${icon("next", { size: "sm", className: "deck-settings-chevron" })}
      </span>
    </div>
    <div class="deck-settings-row flex items-center justify-between tappable" id="ds-order-row">
      <span class="deck-settings-label text-body1 font-medium fg-body">Card order</span>
      <span class="deck-settings-value deck-settings-value--accent flex items-center text-body1 font-medium fg-accent" id="ds-order-value">
        ${escapeHTML(ORDER_LABELS[order])}
        ${icon("next", { size: "sm", className: "deck-settings-chevron" })}
      </span>
    </div>
    <div class="deck-settings-row flex items-center justify-between tappable" id="ds-reading-display-row">
      <span class="deck-settings-label text-body1 font-medium fg-body">Reading</span>
      <span class="deck-settings-value deck-settings-value--accent flex items-center text-body1 font-medium fg-accent" id="ds-reading-display-value">
        ${escapeHTML(READING_DISPLAY_LABELS[readingDisplay])}
        ${icon("next", { size: "sm", className: "deck-settings-chevron" })}
      </span>
    </div>
    <div class="deck-settings-row flex items-center justify-between tappable" id="ds-export-row">
      <span class="deck-settings-label text-body1 font-medium fg-body">Export JSON</span>
    </div>
    <div class="deck-settings-section-header section-label">Danger zone</div>
    <div class="deck-settings-row deck-settings-row--destructive flex items-center justify-between tappable" id="ds-delete-row">
      <span class="deck-settings-label text-body1 font-medium fg-danger">Delete phrasebook</span>
    </div>
  `;
}

/** Opens settings for a persisted phrasebook. */
export function openDeckSettings(
  appElement: HTMLElement,
  deck: Deck,
  operations: DeckSettingsOperations,
  onChanged: (change: DeckSettingsChange) => void,
  onDismiss?: () => void,
): BottomSheetHandle {
  const state: DeckSettingsState = {
    name: deck.name,
    mode: deck.mode,
    order: deck.order,
    readingDisplay: deck.readingDisplay,
  };

  const sheet = openBottomSheet(appElement, {
    kind: "settings",
    bodyHTML: renderBody(state),
    onMount: bind,
    onClose: onDismiss,
  });
  return sheet;

  function rerender(): void {
    const handle = sheet.panel.firstElementChild;
    if (!handle) throw new Error("Missing deck settings sheet handle");
    sheet.panel.innerHTML = "";
    sheet.panel.appendChild(handle);
    sheet.panel.insertAdjacentHTML("beforeend", renderBody(state));
    bind(sheet.panel);
  }

  function bind(panel: HTMLElement): void {
    panel.querySelector<HTMLElement>("#ds-name-row")?.addEventListener("click", async () => {
      const value = prompt("Rename phrasebook", state.name);
      const name = value?.trim();
      if (!name || name === state.name) return;
      await operations.updateDeckName(deck.id, name);
      state.name = name;
      onChanged({ name });
      rerender();
    });

    panel.querySelector<HTMLElement>("#ds-mode-row")?.addEventListener("click", async () => {
      const index = MODES.indexOf(state.mode);
      const mode = MODES[(index + 1) % MODES.length];
      await operations.updateDeckMode(deck.id, mode);
      state.mode = mode;
      onChanged({ mode });
      rerender();
    });

    panel.querySelector<HTMLElement>("#ds-order-row")?.addEventListener("click", async () => {
      const index = ORDERS.indexOf(state.order);
      const order = ORDERS[(index + 1) % ORDERS.length];
      await operations.updateDeckOrder(deck.id, order);
      state.order = order;
      onChanged({ order });
      rerender();
    });

    panel.querySelector<HTMLElement>("#ds-reading-display-row")?.addEventListener("click", async () => {
      const index = READING_DISPLAYS.indexOf(state.readingDisplay);
      const readingDisplay = READING_DISPLAYS[(index + 1) % READING_DISPLAYS.length];
      await operations.updateDeckReadingDisplay(deck.id, readingDisplay);
      state.readingDisplay = readingDisplay;
      onChanged({ readingDisplay });
      rerender();
    });

    panel.querySelector<HTMLElement>("#ds-export-row")?.addEventListener("click", operations.exportJson);

    panel.querySelector<HTMLElement>("#ds-delete-row")?.addEventListener("click", async () => {
      const warning = `Delete "${state.name}"? The phrasebook will be removed, but saved cards will remain in your library.`;
      if (!confirm(warning)) return;
      await operations.deleteDeck(deck.id);
      onChanged({ deleted: true });
      sheet.close();
    });
  }
}
