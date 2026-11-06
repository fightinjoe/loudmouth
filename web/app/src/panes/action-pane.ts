import { cardIdentity } from "@catchphrase/card-schema";
import type { Lang } from "@catchphrase/card-schema";
import { openCreationPanel } from "../components/creation-panel";
import { openDeckSettings } from "../components/deck-settings";
import { openJsonPanel, toImportJson } from "../components/json-panel";
import { openNewPhrasebookPanel } from "../components/new-phrasebook-panel";
import type { BottomSheetHandle } from "../components/bottom-sheet";
import { openReviewPanel } from "../components/review-panel";
import {
  deleteDeck,
  updateDeckMode,
  updateDeckName,
  updateDeckOrder,
  updateDeckReadingDisplay,
} from "../js/db";
import type { AppHost, AppTransitions } from "../js/app-types";
import type {
  Ability,
  Deck,
  DeckMode,
  DeckOrder,
  LibraryEntry,
  PhrasebookDraftGroup,
  ReadingDisplay,
} from "../js/library-types";
import { DEFAULT_MODE } from "../js/modes";
import type { SuggestedPhrasebook } from "../js/suggested-phrasebooks";
import { setAttrSafe } from "../js/uiState";
import { uuid } from "../js/utils";

export interface PreviewDeck {
  id: string;
  name: string;
  lang: Lang;
  ability: Ability;
  seedId: string;
  mode: DeckMode;
  order: DeckOrder;
  readingDisplay: ReadingDisplay;
  preview: true;
  draftGroups: PhrasebookDraftGroup[];
}

export type ActionOpen =
  | { kind: "settings"; payload: { deck: Deck; cards: LibraryEntry[] } }
  | { kind: "review"; payload: { deck: Deck; cards: LibraryEntry[] } }
  | { kind: "creation"; payload: { lang?: Lang; seed?: string } }
  | { kind: "new-phrasebook"; payload: { suggestion: SuggestedPhrasebook } }
  | { kind: "json"; payload: { title: string; jsonString: string } };

export type ActionSlice = ActionOpen | null;

interface ClosableHandle {
  close(): void;
  dispose(): void;
}

interface PreviewContent {
  deck: PreviewDeck;
  cards: LibraryEntry[];
}

function buildPreview(
  suggestion: SuggestedPhrasebook,
  ability: Ability,
): PreviewContent {
  const deckId = uuid();
  const cardIds = new Map<string, string>();
  const cardIdFor = (card: LibraryEntry["card"]): string => {
    const identity = cardIdentity(card);
    const existing = cardIds.get(identity);
    if (existing) return existing;
    const id = uuid();
    cardIds.set(identity, id);
    return id;
  };

  const draftGroups: PhrasebookDraftGroup[] = suggestion.groups.map((group) => ({
    id: uuid(),
    title: group.title,
    thingsToSay: group.thingsToSay.map((card) => ({ id: uuid(), card })),
    likelyExchanges: group.likelyExchanges.map((exchange) => ({
      id: uuid(), title: exchange.title,
      lines: exchange.lines.map((line) => ({
        speaker: line.speaker, responses: line.responses.map((card) => ({ id: uuid(), card })),
      })),
    })),
    words: group.words.map((family) => ({ ...family, id: uuid() })),
    exampleConversation: group.exampleConversation.map((line) => ({ ...line, id: uuid() })),
  }));

  const cards: LibraryEntry[] = [];
  for (const group of draftGroups) {
    const addPhrase = (
      phrase: PhrasebookDraftGroup["thingsToSay"][number],
      section: NonNullable<LibraryEntry["occurrence"]>["section"],
      position: number,
      placement: Pick<NonNullable<LibraryEntry["occurrence"]>, "speaker" | "exchangeId" | "turnIndex"> = {},
    ): void => {
      const cardId = cardIdFor(phrase.card);
      cards.push({
        key: phrase.id, cardId, card: phrase.card,
        occurrence: {
          id: phrase.id, deckId, groupId: group.id, section, cardId, position,
          translation: phrase.card.translation, ...placement,
        },
        sources: [],
      });
    };
    group.thingsToSay.forEach((phrase, position) => addPhrase(phrase, "thingsToSay", position));
    for (const exchange of group.likelyExchanges) {
      exchange.lines.forEach((line, turnIndex) =>
        line.responses.forEach((phrase, position) =>
          addPhrase(phrase, "likelyExchanges", position, {
            speaker: line.speaker, exchangeId: exchange.id, turnIndex,
          })));
    }
    group.exampleConversation.forEach((phrase, position) =>
      addPhrase(phrase, "exampleConversation", position, { speaker: phrase.speaker }));

    for (const family of group.words) {
      for (const [position, candidate] of family.items.entries()) {
        const cardId = cardIdFor(candidate.card);
        const placementId = uuid();
        cards.push({
          key: placementId,
          cardId,
          card: candidate.card,
          wordPlacement: { id: placementId, deckId, groupId: group.id, familyId: family.id, cardId, position },
          sources: [...(candidate.sources ?? [])],
        });
      }
    }
  }

  return {
    deck: {
      id: deckId,
      name: suggestion.title,
      lang: suggestion.lang,
      ability,
      seedId: suggestion.id,
      mode: DEFAULT_MODE,
      order: "default",
      readingDisplay: "reading",
      preview: true,
      draftGroups,
    },
    cards,
  };
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

    case "new-phrasebook": {
      const { suggestion } = open.payload;
      let sheetHandle: BottomSheetHandle | null = null;
      sheetHandle = openNewPhrasebookPanel(
        hostElement,
        onDismiss,
        suggestion,
        ({ ability }) => {
          if (isDisposed()) return;
          const preview = buildPreview(suggestion, ability);
          ui.transition("shell/close");
          ui.transition("content/loaded", preview);
          sheetHandle?.close();
        },
      );
      return sheetHandle;
    }

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
