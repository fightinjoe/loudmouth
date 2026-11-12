import type { Lang } from "@catchphrase/card-schema";
import { openCreationPanel } from "../components/creation-panel";
import { openDeckSettings } from "../components/deck-settings";
import { openJsonPanel, toImportJson } from "../components/json-panel";
import { openReviewPanel } from "../components/review-panel";
import {
  deleteDeck,
  updateDeckMode,
  updateDeckName,
  updateDeckOrder,
  updateDeckReadingDisplay,
} from "../js/db";
import type { AppHost, AppTransitions } from "../js/app-types";
import type { Deck, LibraryEntry } from "../js/library-types";
import { setAttrSafe } from "../js/uiState";

export type ActionOpen =
  | { kind: "settings"; payload: { deck: Deck; cards: LibraryEntry[] } }
  | { kind: "review"; payload: { deck: Deck; cards: LibraryEntry[] } }
  | { kind: "creation"; payload: { lang?: Lang; seed?: string } }
  | { kind: "json"; payload: { title: string; jsonString: string } };

export type ActionSlice = ActionOpen | null;

interface ClosableHandle {
  close(): void;
  dispose(): void;
}

function openKind(
  open: ActionOpen,
  host: AppHost,
  hostElement: HTMLElement,
  onDismiss: () => void,
  isDisposed: () => boolean,
): ClosableHandle {
  const { ui } = host;

  switch (open.kind) {
    case "settings": {
      const { deck, cards } = open.payload;
      return openDeckSettings(
        hostElement,
        deck,
        {
          updateDeckMode,
          updateDeckName,
          updateDeckOrder,
          updateDeckReadingDisplay,
          deleteDeck,
          exportJson: () => {
            if (isDisposed()) return;
            ui.transition("action/open", {
              kind: "json",
              payload: { title: deck.name, jsonString: toImportJson(cards) },
            });
          },
        },
        (change) => {
          if (isDisposed()) return;
          ui.transition("nav/reload");
          if ("deleted" in change) {
            ui.transition("content/select-deck", { id: null });
          } else {
            ui.transition("content/reload-deck");
          }
        },
        onDismiss,
      );
    }

    case "review":
      return openReviewPanel(
        hostElement,
        open.payload.deck,
        open.payload.cards,
        onDismiss,
      );

    case "creation":
      return openCreationPanel(
        hostElement,
        open.payload,
        (deck: Deck) => {
          if (isDisposed()) return;
          ui.transition("shell/close");
          ui.transition("nav/reload");
          ui.transition("content/select-deck", { id: deck.id });
        },
        onDismiss,
        (deckId, illustration) => {
          if (isDisposed()) return;
          ui.transition("content/illustration-updated", { deckId, illustration });
          ui.transition("nav/reload");
        },
      );

    case "json":
      return openJsonPanel(
        hostElement,
        open.payload.title,
        open.payload.jsonString,
        onDismiss,
      );
  }
}

const transitions = {
  "action/open": (_slice, payload) => payload,
  "action/close": () => null,
} satisfies AppTransitions;

const actionPane = {
  namespace: "action" as const,
  initialState: null satisfies ActionSlice,
  transitions,

  render(): string {
    return '<div id="action-layer"></div>';
  },

  bindEvents(rootElement: HTMLElement, host: AppHost): () => void {
    const { ui, stageEl } = host;
    if (!stageEl) throw new Error("Action pane requires a stage element");

    const unsubscribeAttribute = ui.subscribe("action", (next) => {
      setAttrSafe(stageEl, "actionState", next ? "open" : "closed");
    });

    let currentHandle: ClosableHandle | null = null;
    let currentKey: string | null = null;
    let disposed = false;
    const handles = new Set<ClosableHandle>();

    const unsubscribe = ui.subscribe("action", (next) => {
      const nextKey = next ? `${next.kind}:${JSON.stringify(next.payload)}` : null;
      if (nextKey === currentKey && currentHandle) return;

      if (currentHandle) {
        const closing = currentHandle;
        currentHandle = null;
        closing.close();
      }

      if (!next) {
        currentKey = null;
        return;
      }

      let handle: ClosableHandle | null = null;
      const onDismiss = (): void => {
        if (handle) handles.delete(handle);
        if (disposed) return;
        if (ui.get("action") && currentHandle === handle) {
          currentHandle = null;
          currentKey = null;
          ui.transition("action/close");
        }
      };
      handle = openKind(next, host, rootElement, onDismiss, () => disposed);
      handles.add(handle);
      currentHandle = handle;
      currentKey = nextKey;
    });

    return () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      unsubscribeAttribute();
      for (const handle of handles) handle.dispose();
      handles.clear();
      currentHandle = null;
      currentKey = null;
      setAttrSafe(stageEl, "actionState", "closed");
    };
  },
};

export default actionPane;
