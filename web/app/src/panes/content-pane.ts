import type { Lang } from "@catchphrase/card-schema";
import {
  commitPhrasebook,
  getReviewCards,
  updateDeckAccessTime,
  updateDeckEntryOrder,
} from "../js/db";
import type { AppHost, AppTransitions } from "../js/app-types";
import type {
  Deck,
  DeckMode,
  DeckOrder,
  Group,
  LibraryEntry,
  ReadingDisplay,
} from "../js/library-types";
import { setAttrSafe, setListHTMLSafe } from "../js/uiState";
import { icon } from "../components/icon";
import type { PreviewDeck } from "./action-pane";
import { registerCardActions } from "./content-pane-actions";
import {
  wireContentGestures,
  type ContentGesturesHandle,
} from "./content-pane-gestures";
import { loadDeckData } from "./content-pane-load";
import {
  getDeckPages,
  normalizePageKey,
  renderBrowseBody,
  renderBrowseCardsHTML,
  renderDeckBody,
  renderDeckPager,
  type ContentBrowse,
} from "./content-pane-render";
import { SUGGESTED_PHRASEBOOKS } from "../js/suggested-phrasebooks";

export interface SystemLanguageDeck {
  id: `lang:${Lang}`;
  name: string;
  lang: Lang;
  mode: DeckMode;
  order: DeckOrder;
  readingDisplay: ReadingDisplay;
  system: true;
}

export type ContentDeck = Deck | PreviewDeck | SystemLanguageDeck;

export function isStoredDeck(deck: ContentDeck | null): deck is Deck {
  return deck !== null && !("preview" in deck) && !("system" in deck);
}

function isPreviewDeck(deck: ContentDeck | null): deck is PreviewDeck {
  return deck !== null && "preview" in deck && deck.preview;
}

function isSystemDeck(deck: ContentDeck | null): deck is SystemLanguageDeck {
  return deck !== null && "system" in deck && deck.system;
}

export interface ContentStarPatch {
  deckId: string;
  cardId: string;
  starredAt: string | null;
}

export interface ContentSlice {
  deckId: string | null;
  deck: ContentDeck | null;
  cards: LibraryEntry[];
  groups: Group[];
  editMode: boolean;
  editOrder: string[] | null;
  menuOpen: boolean;
  pageKey: string | null;
  starPatch: ContentStarPatch | null;
  reload: number;
  browse: ContentBrowse | null;
}

export interface ContentLoadResult {
  deck: ContentDeck | null;
  cards: LibraryEntry[];
  groups: Group[];
}

function previewGroups(deck: PreviewDeck): Group[] {
  return deck.draftGroups.flatMap((group, position) => group.title === undefined
    ? []
    : [{
        id: group.id,
        deckId: deck.id,
        title: group.title,
        position,
      }]);
}

function resolvedGroups(deck: ContentDeck | null, groups?: Group[]): Group[] {
  if (groups) return groups;
  return isPreviewDeck(deck) ? previewGroups(deck) : [];
}

function reconcilePageKey(
  previousEntries: readonly LibraryEntry[],
  previousGroups: readonly Group[],
  nextEntries: readonly LibraryEntry[],
  nextGroups: readonly Group[],
  currentKey: string | null,
): string {
  const nextPages = getDeckPages(nextEntries, nextGroups);
  const currentPage = nextPages.find((page) => page.key === currentKey);
  if (currentPage) return currentPage.key;
  const previousPages = getDeckPages(previousEntries, previousGroups);
  const previousIndex = Math.max(
    0,
    previousPages.findIndex((page) => page.key === currentKey),
  );
  return nextPages[Math.min(previousIndex, nextPages.length - 1)].key;
}

const initialState: ContentSlice = {
  deckId: null,
  deck: null,
  cards: [],
  groups: [],
  editMode: false,
  editOrder: null,
  menuOpen: false,
  pageKey: null,
  starPatch: null,
  reload: 0,
  browse: null,
};

const transitions = {
  "content/select-deck": (slice, { id }) => ({
    ...slice,
    deckId: id,
    browse: null,
    ...(id !== slice.deckId
      ? { deck: null, cards: [], groups: [], pageKey: null, starPatch: null }
      : {}),
  }),

  "content/reload-deck": (slice) => ({
    ...slice,
    reload: slice.reload + 1,
  }),

  "content/loaded": (slice, { deck, cards, groups }) => {
    const nextGroups = resolvedGroups(deck, groups);
    return {
      ...slice,
      deckId: deck?.id ?? null,
      deck,
      cards,
      groups: nextGroups,
      editMode: false,
      editOrder: null,
      menuOpen: false,
      browse: null,
      pageKey: isStoredDeck(deck)
        ? normalizePageKey(cards, nextGroups, slice.deckId === deck.id ? slice.pageKey : null)
        : null,
      starPatch: null,
    };
  },

  "content/cards-changed": (slice, { cards, groups, deckId }) => {
    if (deckId !== undefined && deckId !== slice.deckId) return slice;
    const nextGroups = groups ?? slice.groups;
    return {
      ...slice,
      cards,
      groups: nextGroups,
      pageKey: isStoredDeck(slice.deck)
        ? reconcilePageKey(slice.cards, slice.groups, cards, nextGroups, slice.pageKey)
        : null,
      starPatch: null,
    };
  },

  "content/card-star-changed": (slice, { deckId, cardId, starredAt }) => {
    if (!isStoredDeck(slice.deck) || slice.deck.id !== deckId) return slice;
    let changed = false;
    const cards = slice.cards.map((entry) => {
      const membership = entry.membership;
      if (entry.cardId !== cardId || !membership || membership.deckId !== deckId) {
        return entry;
      }
      changed = true;
      return {
        ...entry,
        membership: { ...membership, starredAt },
      };
    });
    return changed
      ? { ...slice, cards, starPatch: { deckId, cardId, starredAt } }
      : slice;
  },

  "content/set-page": (slice, { pageKey }) => {
    if (!isStoredDeck(slice.deck)) return slice;
    const nextPageKey = normalizePageKey(slice.cards, slice.groups, pageKey);
    return nextPageKey === slice.pageKey ? slice : { ...slice, pageKey: nextPageKey };
  },

  "content/enter-edit": (slice) => isStoredDeck(slice.deck)
    ? {
        ...slice,
        editMode: true,
        menuOpen: false,
        editOrder: slice.cards.map((entry) => entry.key),
      }
    : slice,

  // Only replace the slots belonging to the active page. Other page buckets
  // keep their relative order while persistence receives the complete key set.
  "content/reorder": (slice, { pageOrder }) => {
    if (!slice.editMode || !slice.editOrder) return slice;
    const pageKeys = pageOrder.filter((key, index) =>
      slice.editOrder?.includes(key) && pageOrder.indexOf(key) === index);
    if (pageKeys.length < 2) return slice;
    const pageSet = new Set(pageKeys);
    const current = slice.editOrder.filter((key) => pageSet.has(key));
    if (current.length !== pageKeys.length
      || current.every((key, index) => key === pageKeys[index])) return slice;
    let replacementIndex = 0;
    const editOrder = slice.editOrder.map((key) =>
      pageSet.has(key) ? pageKeys[replacementIndex++] : key);
    return { ...slice, editOrder };
  },

  "content/confirm-edit": (slice) => {
    if (!slice.editMode || !slice.editOrder) return slice;
    const byKey = new Map(slice.cards.map((entry) => [entry.key, entry]));
    const cards = slice.editOrder.flatMap((key) => {
      const entry = byKey.get(key);
      return entry ? [entry] : [];
    });
    return {
      ...slice,
      cards,
      editMode: false,
      editOrder: null,
      menuOpen: false,
      starPatch: null,
    };
  },

  "content/cancel-edit": (slice) => ({
    ...slice,
    editMode: false,
    editOrder: null,
    menuOpen: false,
  }),

  "content/toggle-menu": (slice) => ({ ...slice, menuOpen: !slice.menuOpen }),
  "content/close-menu": (slice) => ({ ...slice, menuOpen: false }),
  "content/browse": (slice, payload) => ({ ...slice, browse: payload }),
  "content/browse-back": (slice) => ({ ...slice, browse: null }),
} satisfies AppTransitions;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The change could not be saved.";
}

const contentPane = {
  namespace: "content" as const,
  initialState,
  transitions,

  render(initial: ContentSlice): string {
    return `
      <div id="content-pane" class="content-pane absolute-inset flex-col bg-surface transition-transform"${initial.deck ? "" : " data-empty"}>
        <div class="meat screen flex-1 flex-col bg-surface overflow-hidden" data-region="content-body">
          ${renderDeckBody(initial.deck, initial.cards, initial.groups, initial.pageKey)}
        </div>
        <div id="reorder-handle" class="reorder-handle" aria-hidden="true"></div>
        <div id="deck-title-menu-scrim" data-action="content/close-menu"></div>
        <div id="deck-title-menu" class="deck-title-menu bg-surface overflow-hidden">
          <button class="deck-title-menu-item fg-body text-menu-item text-left tappable" data-action="content/menu-settings">Settings</button>
          <button class="deck-title-menu-item fg-body text-menu-item text-left tappable" data-action="content/menu-edit">Edit cards</button>
        </div>
      </div>
    `;
  },

  bindEvents(rootEl: HTMLElement, host: AppHost): () => void {
    const { ui, delegate, stageEl } = host;
    if (!delegate || !stageEl) throw new Error("Content pane requires a delegate and stage element");
    const meatEl = rootEl.querySelector<HTMLElement>('[data-region="content-body"]');
    const handleEl = stageEl.querySelector<HTMLElement>(".shell-swipe-handle");
    const reorderHandleEl = rootEl.querySelector<HTMLElement>("#reorder-handle");
    const menuEl = rootEl.querySelector<HTMLElement>("#deck-title-menu");
    if (!meatEl || !handleEl || !reorderHandleEl || !menuEl) {
      throw new Error("Content pane is missing required elements");
    }

    let syncPager: ContentGesturesHandle["syncPager"] = () => {};

    function visibleEntries(slice: ContentSlice): LibraryEntry[] {
      if (!slice.editMode || !slice.editOrder) return slice.cards;
      const byKey = new Map(slice.cards.map((entry) => [entry.key, entry]));
      return slice.editOrder.flatMap((key) => {
        const entry = byKey.get(key);
        return entry ? [entry] : [];
      });
    }

    const capturePageScrolls = (): Map<string, number> => {
      const scrolls = new Map<string, number>();
      meatEl.querySelectorAll<HTMLElement>(".deck-page").forEach((page) => {
        if (page.dataset.pageKey) scrolls.set(page.dataset.pageKey, page.scrollTop);
      });
      return scrolls;
    };

    const restorePageScrolls = (scrolls: ReadonlyMap<string, number>): void => {
      meatEl.querySelectorAll<HTMLElement>(".deck-page").forEach((page) => {
        page.scrollTop = page.dataset.pageKey
          ? scrolls.get(page.dataset.pageKey) ?? 0
          : 0;
      });
    };

    const showInlineError = (message: string | null): void => {
      const errorElement = meatEl.querySelector<HTMLElement>('[data-region="content-error"]');
      if (!errorElement) return;
      errorElement.textContent = message ?? "";
      errorElement.hidden = message === null;
    };

    const patchStar = (patch: ContentStarPatch, entries: readonly LibraryEntry[]): void => {
      if (!entries.some((candidate) => candidate.cardId === patch.cardId)) return;
      const starred = patch.starredAt !== null;
      meatEl.querySelectorAll<HTMLButtonElement>(".card-star[data-card-id]")
        .forEach((button) => {
          if (button.dataset.cardId !== patch.cardId) return;
          const entry = entries.find(
            (candidate) => candidate.key === button.dataset.entryKey,
          );
          button.dataset.selected = String(starred);
          button.setAttribute("aria-pressed", String(starred));
          button.setAttribute(
            "aria-label",
            `${starred ? "Unstar" : "Star"}: ${entry?.card.translation ?? ""}`,
          );
          button.innerHTML = icon(starred ? "star-fill" : "star");
        });
    };

    const unsubContent = ui.subscribe("content", (next, previous) => {
      const deckChanged = next.deck !== previous.deck;
      const browseChanged = next.browse !== previous.browse;
      const cardsChanged = next.cards !== previous.cards;
      const groupsChanged = next.groups !== previous.groups;
      const pageChanged = next.pageKey !== previous.pageKey;
      const reorderedWhileEditing = next.editMode
        && previous.editMode
        && next.editOrder !== previous.editOrder;
      const leavingEditOrder = previous.editMode
        && !next.editMode
        && previous.editOrder !== null;

      if (browseChanged || deckChanged) {
        const scrolls = capturePageScrolls();
        meatEl.innerHTML = next.browse
          ? renderBrowseBody(next.browse)
          : renderDeckBody(next.deck, next.cards, next.groups, next.pageKey);
        restorePageScrolls(scrolls);
        syncPager(next.pageKey, { animate: false });
      } else if (!next.browse
        && cardsChanged
        && next.starPatch
        && next.starPatch !== previous.starPatch) {
        patchStar(next.starPatch, next.cards);
      } else if (!next.browse
        && (cardsChanged || groupsChanged || reorderedWhileEditing || leavingEditOrder)) {
        const orderedEntries = visibleEntries(next);
        if (next.deck && (isSystemDeck(next.deck) || isPreviewDeck(next.deck))) {
          const list = meatEl.querySelector<HTMLElement>(
            '.deck-view-list[data-region="card-list"]',
          );
          if (list) {
            setListHTMLSafe(
              list,
              renderBrowseCardsHTML(next.deck, orderedEntries, next.groups),
            );
          }
        } else if (next.deck) {
          const scrolls = capturePageScrolls();
          const pager = meatEl.querySelector<HTMLElement>('[data-region="deck-pager"]');
          const pagerHtml = renderDeckPager(
            next.deck,
            orderedEntries,
            next.groups,
            next.pageKey,
          );
          if (pager) pager.outerHTML = pagerHtml;
          else {
            meatEl.innerHTML = renderDeckBody(
              next.deck,
              orderedEntries,
              next.groups,
              next.pageKey,
            );
          }
          restorePageScrolls(scrolls);
          syncPager(next.pageKey, { animate: false });
        }
      } else if (!next.browse && pageChanged) {
        syncPager(next.pageKey);
      }

      if (cardsChanged || deckChanged || browseChanged) {
        const reviewButton = meatEl.querySelector<HTMLButtonElement>('[data-action="content/review"]');
        if (reviewButton) {
          reviewButton.disabled = !isStoredDeck(next.deck)
            || !next.cards.some((entry) => entry.membership?.starredAt != null);
        }
      }

      setAttrSafe(rootEl, "editMode", next.editMode ? "" : null);
      setAttrSafe(rootEl, "menuOpen", next.menuOpen ? "" : null);
      setAttrSafe(rootEl, "empty", next.browse || next.deck ? null : "");
      if (next.menuOpen && !previous.menuOpen) positionTitleMenu();
      if (next.deck?.mode) stageEl.dataset.deckMode = next.deck.mode;
      else delete stageEl.dataset.deckMode;
    });

    const positionTitleMenu = (): void => {
      const anchor = meatEl.querySelector<HTMLElement>('[data-action="content/deck-title"]');
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      menuEl.style.top = `${rect.bottom + 4}px`;
      menuEl.style.left = `${rect.left + rect.width / 2}px`;
    };

    let inflight = 0;
    const unsubLoad = ui.subscribe("content", (next, previous) => {
      if (isPreviewDeck(next.deck) && next.deck.id === next.deckId) {
        inflight += 1;
        return;
      }
      if (next.deckId === previous.deckId && next.reload === previous.reload) return;
      const stamp = ++inflight;
      void loadDeckData(next.deckId).then((data) => {
        if (stamp === inflight) ui.transition("content/loaded", data);
      }).catch((error: unknown) => {
        if (stamp === inflight) showInlineError(errorMessage(error));
      });
    });

    function isEdit(): boolean {
      return ui.get("content").editMode;
    }
    const gestures = wireContentGestures({
      rootEl,
      handleEl,
      reorderHandleEl,
      ui,
      isEdit,
    });
    const { resetReveal } = gestures;
    syncPager = gestures.syncPager;

    delegate.register("content/menu", () => ui.transition("shell/toggle"));

    delegate.register("content/deck-title", () => {
      const deck = ui.get("content").deck;
      if (isSystemDeck(deck)) ui.transition("shell/toggle");
      else if (isStoredDeck(deck)) ui.transition("content/toggle-menu");
    });

    delegate.register("content/menu-settings", () => {
      ui.transition("content/close-menu");
      const { deck, cards } = ui.get("content");
      if (isStoredDeck(deck)) {
        ui.transition("action/open", { kind: "settings", payload: { deck, cards } });
      }
    });

    delegate.register("content/menu-edit", () => {
      ui.transition("content/close-menu");
      ui.transition("content/enter-edit");
    });

    delegate.register("content/close-menu", () => ui.transition("content/close-menu"));

    delegate.register("content/done", (_event, element) => {
      const slice = ui.get("content");
      if (!slice.editMode || !slice.editOrder || !isStoredDeck(slice.deck)) return;
      const deckId = slice.deck.id;
      const order = [...slice.editOrder];
      const button = element instanceof HTMLButtonElement ? element : null;
      if (button) button.disabled = true;
      showInlineError(null);
      void updateDeckEntryOrder(deckId, order).then(() => {
        const current = ui.get("content");
        if (isStoredDeck(current.deck)
          && current.deck.id === deckId
          && current.editMode) {
          ui.transition("content/confirm-edit");
        }
      }).catch((error: unknown) => {
        const current = ui.get("content");
        if (isStoredDeck(current.deck) && current.deck.id === deckId) {
          showInlineError(errorMessage(error));
        }
      }).finally(() => {
        if (button?.isConnected) button.disabled = false;
      });
    });

    delegate.register("content/review", (_event, element) => {
      const slice = ui.get("content");
      if (!isStoredDeck(slice.deck)) return;
      const deck = slice.deck;
      const button = element instanceof HTMLButtonElement ? element : null;
      if (button) button.disabled = true;
      void getReviewCards(deck.id).then((cards) => {
        const current = ui.get("content");
        if (!isStoredDeck(current.deck) || current.deck.id !== deck.id || cards.length === 0) {
          return;
        }
        ui.transition("action/open", { kind: "review", payload: { deck, cards } });
      }).catch((error: unknown) => {
        const current = ui.get("content");
        if (isStoredDeck(current.deck) && current.deck.id === deck.id) {
          showInlineError(errorMessage(error));
        }
      }).finally(() => {
        if (button?.isConnected) {
          const current = ui.get("content");
          button.disabled = !isStoredDeck(current.deck)
            || current.deck.id !== deck.id
            || !current.cards.some((entry) => entry.membership?.starredAt != null);
        }
      });
    });

    delegate.register("content/save-preview", (_event, element) => {
      const preview = ui.get("content").deck;
      if (!isPreviewDeck(preview)) return;
      const previewId = preview.id;
      const button = element instanceof HTMLButtonElement ? element : null;
      if (button) button.disabled = true;
      showInlineError(null);
      void commitPhrasebook({
        name: preview.name,
        lang: preview.lang,
        ability: preview.ability,
        seedId: preview.seedId,
        groups: preview.draftGroups,
        selectedIndexes: preview.draftGroups.map((_group, index) => index),
      }).then((realDeck) => {
        if (ui.get("content").deck?.id !== previewId) return;
        ui.transition("nav/reload");
        ui.transition("content/select-deck", { id: realDeck.id });
      }).catch((error: unknown) => {
        if (ui.get("content").deck?.id === previewId) {
          showInlineError(errorMessage(error));
        }
      }).finally(() => {
        if (button?.isConnected) button.disabled = false;
      });
    });

    delegate.register("content/browse-back", () => ui.transition("content/browse-back"));

    delegate.register("content/browse-select", (_event, element) => {
      const id = element.dataset.deckId;
      if (!id) return;
      void updateDeckAccessTime(id);
      ui.transition("content/select-deck", { id });
    });

    delegate.register("content/browse-view-suggested", (_event, element) => {
      const suggestion = SUGGESTED_PHRASEBOOKS.find(
        (candidate) => candidate.id === element.dataset.suggestionId,
      );
      if (suggestion) {
        ui.transition("action/open", {
          kind: "new-phrasebook",
          payload: { suggestion },
        });
      }
    });

    delegate.register("content/set-page", (_event, element) => {
      const pageKey = element.dataset.pageKey;
      if (pageKey) ui.transition("content/set-page", { pageKey });
    });

    const unregisterCardActions = registerCardActions({ host, isEdit, resetReveal });
    const registeredActions = [
      "content/menu",
      "content/deck-title",
      "content/menu-settings",
      "content/menu-edit",
      "content/close-menu",
      "content/done",
      "content/review",
      "content/save-preview",
      "content/browse-back",
      "content/browse-select",
      "content/browse-view-suggested",
      "content/set-page",
    ];

    return () => {
      unsubContent();
      unsubLoad();
      unregisterCardActions();
      for (const action of registeredActions) delegate.unregister(action);
    };
  },
};

export default contentPane;
