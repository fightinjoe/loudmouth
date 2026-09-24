import { cardIdentity } from "@catchphrase/card-schema";
import type { Lang } from "@catchphrase/card-schema";
import { openCardEditPanel } from "../components/card-edit-panel";
import { openCreationPanel } from "../components/creation-panel";
import { openDeckSettings } from "../components/deck-settings";
import { openJsonPanel, toImportJson } from "../components/json-panel";
import { openNewPhrasebookPanel } from "../components/new-phrasebook-panel";
import type { BottomSheetHandle } from "../components/bottom-sheet";
import { openReviewPanel } from "../components/review-panel";
import {
  deleteCard,
  deleteDeck,
  updateCard,
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
  | { kind: "creation"; payload: { lang: Lang } }
  | { kind: "new-phrasebook"; payload: { suggestion?: SuggestedPhrasebook } }
  | { kind: "card-edit"; payload: { entry: LibraryEntry } }
  | { kind: "json"; payload: { title: string; jsonString: string } };

export type ActionSlice = ActionOpen | null;

interface ClosableHandle {
  close(): void;
}

interface PreviewContent {
  deck: PreviewDeck;
  cards: LibraryEntry[];
}

function uuid(): string {
  return crypto.randomUUID();
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
    ...(group.title === undefined ? {} : { title: group.title }),
    phrases: group.phrases.map((card) => ({ id: uuid(), card })),
    vocab: group.vocab,
  }));

  const cards: LibraryEntry[] = [];
  const nonPhraseEntries = new Map<string, LibraryEntry>();
  let grouplessPosition = 0;
  for (const group of draftGroups) {
    for (let position = 0; position < group.phrases.length; position += 1) {
      const phrase = group.phrases[position];
      const cardId = cardIdFor(phrase.card);
      const occurrencePosition = group.title === undefined ? grouplessPosition++ : position;
      cards.push({
        key: phrase.id,
        cardId,
        card: phrase.card,
        occurrence: {
          id: phrase.id,
          deckId,
          ...(group.title === undefined ? {} : { groupId: group.id }),
          cardId,
          position: occurrencePosition,
          translation: phrase.card.translation,
          ...(phrase.speaker === undefined ? {} : { speaker: phrase.speaker }),
          ...(phrase.alternative === undefined ? {} : { alternative: phrase.alternative }),
        },
        sources: [],
      });
    }

    for (const candidate of group.vocab) {
      const identity = cardIdentity(candidate.card);
      const existing = nonPhraseEntries.get(identity);
      if (existing) {
        existing.sources.push(...(candidate.sources ?? []));
        continue;
      }
      const cardId = cardIdFor(candidate.card);
      const entry: LibraryEntry = {
        key: JSON.stringify([deckId, cardId]),
        cardId,
        card: candidate.card,
        sources: [...(candidate.sources ?? [])],
      };
      nonPhraseEntries.set(identity, entry);
      cards.push(entry);
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
          exportJson: () => ui.transition("action/open", {
            kind: "json",
            payload: { title: deck.name, jsonString: toImportJson(cards) },
          }),
        },
        (change) => {
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
        { lang: open.payload.lang },
        (deck: Deck) => {
          ui.transition("shell/close");
          ui.transition("nav/reload");
          ui.transition("content/select-deck", { id: deck.id });
        },
        onDismiss,
      );

    case "new-phrasebook": {
      const { suggestion } = open.payload;
      let sheetHandle: BottomSheetHandle | null = null;
      sheetHandle = openNewPhrasebookPanel(
        hostElement,
        (lang) => {
          ui.transition("action/open", {
            kind: "creation",
            payload: { lang },
          });
        },
        onDismiss,
        suggestion,
        suggestion
          ? ({ ability }) => {
              const preview = buildPreview(suggestion, ability);
              ui.transition("shell/close");
              ui.transition("content/loaded", preview);
              sheetHandle?.close();
            }
          : undefined,
      );
      return sheetHandle;
    }

    case "card-edit":
      return openCardEditPanel(
        hostElement,
        open.payload.entry,
        { updateCard, deleteCard },
        () => ui.transition("content/reload-deck"),
        () => ui.transition("content/reload-deck"),
        onDismiss,
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
        if (ui.get("action") && currentHandle === handle) {
          currentHandle = null;
          currentKey = null;
          ui.transition("action/close");
        }
      };
      handle = openKind(next, host, rootElement, onDismiss);
      currentHandle = handle;
      currentKey = nextKey;
    });

    return () => {
      unsubscribe();
      unsubscribeAttribute();
      currentHandle?.close();
    };
  },
};

export default actionPane;
